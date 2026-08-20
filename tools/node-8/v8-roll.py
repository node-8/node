#!/usr/bin/env python3
"""Validate a node-8 V8 revision against Node's patched deps/v8 tree."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


SCRIPT_DIR = Path(__file__).resolve().parent
NODE_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_MANIFEST = SCRIPT_DIR / "v8-roll.json"
DEFAULT_V8_ROOT = NODE_ROOT.parent / "v8"


class RollError(RuntimeError):
  pass


def run_git(repo, *args, input_bytes=None, env=None, check=True):
  result = subprocess.run(
      ["git", "-C", os.fspath(repo), *args],
      input=input_bytes,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      env=env,
      check=False,
  )
  if check and result.returncode:
    command = " ".join(("git", *args))
    detail = result.stderr.decode("utf-8", errors="replace").strip()
    raise RollError(f"{command} failed in {repo}: {detail}")
  return result


def git_text(repo, *args):
  return run_git(repo, *args).stdout.decode("utf-8").strip()


def require_repo(path, label):
  path = path.resolve()
  actual = Path(git_text(path, "rev-parse", "--show-toplevel")).resolve()
  if actual != path:
    raise RollError(f"{label} root is {actual}, expected {path}")
  return path


def require_clean(repo, label):
  status = git_text(repo, "status", "--porcelain=v1", "--untracked-files=all")
  if status:
    raise RollError(f"{label} worktree is not clean:\n{status}")


def require_branch(repo, expected, label):
  branch = git_text(repo, "symbolic-ref", "--quiet", "--short", "HEAD")
  if branch != expected:
    raise RollError(f"{label} is on {branch!r}; expected {expected!r}")


def resolve_commit(repo, revision):
  return git_text(
      repo,
      "rev-parse",
      "--verify",
      "--end-of-options",
      f"{revision}^{{commit}}",
  )


def require_ancestor(repo, older, newer, label):
  result = run_git(
      repo, "merge-base", "--is-ancestor", older, newer, check=False
  )
  if result.returncode:
    raise RollError(f"{label}: {older} is not an ancestor of {newer}")


def common_object_dir(repo):
  git_dir = Path(git_text(repo, "rev-parse", "--git-common-dir"))
  if not git_dir.is_absolute():
    git_dir = repo / git_dir
  return (git_dir.resolve() / "objects")


def read_manifest(path):
  try:
    manifest = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError) as error:
    raise RollError(f"cannot read manifest {path}: {error}") from error
  if manifest.get("schema_version") != 1:
    raise RollError("unsupported v8-roll.json schema_version")
  return manifest


def read_embedder_string():
  common_gypi = (NODE_ROOT / "common.gypi").read_text(encoding="utf-8")
  match = re.search(r"'v8_embedder_string':\s*'([^']*)'", common_gypi)
  if not match:
    raise RollError("common.gypi does not define v8_embedder_string")
  return match.group(1)


def patch_bytes(v8_root, base, target):
  return run_git(
      v8_root,
      "diff",
      "--binary",
      "--full-index",
      base,
      target,
      "--",
      ".",
  ).stdout


def commits_between(v8_root, base, target):
  output = git_text(
      v8_root, "rev-list", "--reverse", "--topo-order", f"{base}..{target}"
  )
  commits = output.splitlines() if output else []
  for commit in commits:
    parents = git_text(v8_root, "rev-list", "--parents", "-n", "1", commit)
    if len(parents.split()) != 2:
      raise RollError(f"roll series contains merge commit {commit}")
  return commits


def validate(manifest, v8_root, allow_dirty):
  node = manifest["node"]
  v8 = manifest["v8"]

  require_repo(NODE_ROOT, "Node")
  require_repo(v8_root, "V8")
  if not allow_dirty:
    require_clean(NODE_ROOT, "Node")
    require_clean(v8_root, "V8")
  require_branch(NODE_ROOT, node["development_branch"], "Node")
  require_branch(v8_root, v8["development_branch"], "V8")

  node_head = resolve_commit(NODE_ROOT, "HEAD")
  node_base = resolve_commit(NODE_ROOT, node["base_commit"])
  require_ancestor(NODE_ROOT, node_base, node_head, "Node baseline")

  upstream_base = resolve_commit(v8_root, v8["upstream_base"])
  integrated = resolve_commit(v8_root, v8["integrated_commit"])
  require_ancestor(v8_root, upstream_base, integrated, "integrated V8")

  deps_tree = git_text(NODE_ROOT, "rev-parse", "HEAD:deps/v8")
  if deps_tree != node["deps_v8_tree"]:
    raise RollError(
        f"Node deps/v8 tree is {deps_tree}; manifest records "
        f"{node['deps_v8_tree']}"
    )

  embedder = read_embedder_string()
  if embedder != node["v8_embedder_string"]:
    raise RollError(
        f"Node v8_embedder_string is {embedder!r}; manifest records "
        f"{node['v8_embedder_string']!r}"
    )

  digest = hashlib.sha256(
      patch_bytes(v8_root, upstream_base, integrated)
  ).hexdigest()
  if digest != manifest["roll"]["patch_sha256"]:
    raise RollError(
        f"integrated V8 patch SHA-256 is {digest}; manifest records "
        f"{manifest['roll']['patch_sha256']}"
    )

  return {
      "node_head": node_head,
      "node_base": node_base,
      "deps_tree": deps_tree,
      "upstream_base": upstream_base,
      "integrated": integrated,
  }


def commit_patch(v8_root, commit):
  parent = git_text(v8_root, "rev-parse", f"{commit}^")
  return run_git(
      v8_root,
      "diff-tree",
      "--binary",
      "--full-index",
      "--no-commit-id",
      "-p",
      parent,
      commit,
      "--",
      ".",
  ).stdout


def simulate_roll(v8_root, state, target):
  require_ancestor(v8_root, state["integrated"], target, "V8 roll")
  commits = commits_between(v8_root, state["integrated"], target)

  with tempfile.TemporaryDirectory(prefix="node-8-v8-roll-") as temp_dir:
    temp_root = Path(temp_dir)
    object_dir = temp_root / "objects"
    object_dir.mkdir()
    env = os.environ.copy()
    env["GIT_INDEX_FILE"] = os.fspath(temp_root / "index")
    env["GIT_OBJECT_DIRECTORY"] = os.fspath(object_dir)
    env["GIT_ALTERNATE_OBJECT_DIRECTORIES"] = os.pathsep.join(
        (os.fspath(common_object_dir(NODE_ROOT)),
         os.fspath(common_object_dir(v8_root)))
    )

    run_git(NODE_ROOT, "read-tree", "HEAD", env=env)
    for commit in commits:
      patch = commit_patch(v8_root, commit)
      if patch:
        run_git(
            NODE_ROOT,
            "apply",
            "--cached",
            "--3way",
            "--directory=deps/v8",
            input_bytes=patch,
            env=env,
        )
      run_git(NODE_ROOT, "write-tree", env=env)

    result_tree = git_text_with_env(NODE_ROOT, env, "write-tree")
    result_deps_tree = git_text_with_env(
        NODE_ROOT, env, "rev-parse", f"{result_tree}:deps/v8"
    )
  return commits, result_deps_tree


def git_text_with_env(repo, env, *args):
  return run_git(repo, *args, env=env).stdout.decode("utf-8").strip()


def print_check(manifest, state):
  print("repository check: OK")
  print(f"Node branch: {manifest['node']['development_branch']}")
  print(f"Node base: {state['node_base']}")
  print(f"Node deps/v8 tree: {state['deps_tree']}")
  print(f"V8 base: {state['upstream_base']}")
  print(f"integrated V8: {state['integrated']}")


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
  parser.add_argument("--v8-dir", type=Path, default=DEFAULT_V8_ROOT)
  parser.add_argument(
      "--allow-dirty",
      action="store_true",
      help="allow dirty worktrees while developing this tool",
  )
  subparsers = parser.add_subparsers(dest="command", required=True)
  subparsers.add_parser("check", help="validate the recorded integration")
  dry_run = subparsers.add_parser(
      "dry-run", help="apply pending V8 commits to an isolated Git index"
  )
  dry_run.add_argument(
      "--target",
      help="V8 revision to test; defaults to the integrated manifest commit",
  )
  args = parser.parse_args()

  manifest = read_manifest(args.manifest.resolve())
  v8_root = args.v8_dir.resolve()
  state = validate(manifest, v8_root, args.allow_dirty)
  if args.command == "check":
    print_check(manifest, state)
    return 0

  target_revision = args.target or manifest["v8"]["integrated_commit"]
  target = resolve_commit(v8_root, target_revision)
  commits, result_deps_tree = simulate_roll(v8_root, state, target)
  cumulative_digest = hashlib.sha256(
      patch_bytes(v8_root, state["upstream_base"], target)
  ).hexdigest()

  print_check(manifest, state)
  print("dry-run: OK")
  print(f"target V8: {target}")
  print(f"pending commits: {len(commits)}")
  print(f"cumulative patch SHA-256: {cumulative_digest}")
  print(f"resulting Node deps/v8 tree: {result_deps_tree}")
  if not commits:
    print("zero-delta roll: Node deps/v8 is unchanged")
  return 0


if __name__ == "__main__":
  try:
    sys.exit(main())
  except (KeyError, OSError, RollError) as error:
    print(f"v8-roll: {error}", file=sys.stderr)
    sys.exit(1)
