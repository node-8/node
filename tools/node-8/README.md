# node-8 V8 roll

`node-8/v8` owns generic engine changes. Node keeps its existing V8 patch set
in `deps/v8`. This directory records the exact relationship and checks whether
new engine commits apply on top of Node's patched tree.

The branch model is:

- `main`: clean upstream mirror
- `node-8`: frozen baseline plus node-8 changes
- `experiment/*`: temporary experiments

Validate the recorded integration from the Node repository:

```sh
python3 tools/node-8/v8-roll.py check
python3 tools/node-8/v8-roll.py dry-run
```

Test a later commit from the adjacent V8 repository:

```sh
python3 tools/node-8/v8-roll.py dry-run --target node-8
```

The dry-run applies each pending V8 commit to an isolated Git index. It does
not change either worktree, branch, or repository object database. It rejects
merge commits and stops when a commit conflicts with Node's V8 patch set.

Keep generic V8 commits small and prefix their subjects with `[node-8]`. A real
Node roll must preserve their order and add this trailer to each translated
commit:

```text
Node-8-V8-Commit: <full V8 commit>
```

After a successful roll, update `v8-roll.json` with the integrated V8 commit,
the cumulative patch SHA-256, and the resulting `deps/v8` tree hash. Keep
Node-specific integration commits separate from translated V8 commits.
