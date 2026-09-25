# node-8 待补性能测试清单

更新：2026-09-24。状态：**全部新增测速仍暂停，本文只登记，不授权启动测试。**

2026-09-22 用户决定先修功能，等有可靠硬件后再恢复性能验收。
“功能测试通过”“提交已推送”“OpenSpec 功能任务完成”都不表示性能通过。
没有实测的项目继续保留；静态分析不能代替 2% 无回退证明。

本文是待补测登记的主文件，纳入 `node-8/node` Git。
工作区根目录 `NODE_8_PERFORMANCE_BACKLOG.md` 只提供入口。
下文 `results/`、`local-baselines/`、`openspec/` 均相对父工作区
`/home/rinick/p/node8`；这些证据和二进制主要仅在本地，不随本文上传。
跨机器复测前必须另行备份它们，不要以为推送本文就已备份原始样本。

## 1. 状态与比较规则

- **待测**：有功能改动，但性能尚未验收。
- **环境未合格**：已有校准或诊断，不能推出候选加速或回退。
- **功能前置未完成**：先完成构建/正确性，再计时。
- **历史已通过（限定范围）**：保留原结论；不能外推到后续累计版本。
- **历史已拒绝**：原型已测出回退并撤回，不是“漏测”，不能自动恢复。

恢复时分别准备两类比较：

1. **改动回归**：同一个 profile、同构建配置、正确输出相同的改动前后版本。
2. **产品对比**：固定同源 Node/依赖/编译配置的原版 Node 与 node-8，
   比较网络字节或最终处理结果一致的任务；字节索引本来就允许不同。

旧版本算错、漏处理或挂住的输入不能用作“更快”的基线。
这类输入先与正确的 stock 参考结果对齐，或只记录新实现成本；
仍须用两边都正确的 ASCII/其他控制项判断新增开销。
不要把同一修改版二进制关闭实验开关误称为未修改的原版 Node。

## 2. 已有协议、尚未完成的验收

| ID / 状态 | 需要补测的部分 | 冻结范围与特别风险 | 复用入口及证据 |
| --- | --- | --- | --- |
| P01 环境未合格 | V8 与 Node 的 trim / trimStart / trimEnd | 短 ASCII、无删除、空格/TAB/CRLF、长边界、全空白、短复制/长 slice、Unicode 内容；stock Latin-1/TwoByte；启动及 realm 初始化。历史正式协议 37 项，另有仅候选 Unicode 目标；不能用旧错误 trim 输出比较提速。Node 集成也需单独验证。 | `results/2026-09-13-trim-solo-protocol.md`、`results/2026-09-13-trim-controlled-protocol.md`；`results/run-trim-solo.sh`、`results/trim-perf-worker.js`。 |
| P02 环境未合格 | canonical V8 的 replacement-class / first-iteration 原型及精简 | ASCII 成功、合法非成员失败、malformed-tail、未改 ASCII/Unicode、stock；稳态之外还要补首次编译、首次执行、生成码大小与缓存成本。不能混入 Node 后当成已验收 roll。 | `openspec/changes/prototype-regexp-replacement-first-iteration/tasks.md`；`results/regexp-first-iteration-paired-perf.py`、`results/run-regexp-fixed-frequency.sh`；`results/2026-09-12-v8-regexp-final-calibration.md`。 |
| P03 环境未合格 | Node Inspector 请求入口及新 String8 集成后的请求成本 | 五项原门：stock/short、node8/short、stock/long、node8/long、stock/unicode；node8/unicode 的旧基线结果错误，只测新候选成本，不算有效 A/B 加速。该门不覆盖输出、WebSocket、worker、连接创建、启动或 HTTP。 | 最新入口 `results/run-inspector-output-request-perf.sh`，协议 `results/2026-09-19-inspector-output-request-perf-protocol.md`；旧 request/v2/v3 记录保留但不与新窗口合并。 |

关键未决证据：

- P01：v2 第二轮 A/A 在 trimEnd/unicode-payload 出现约 2.5 倍慢进程；
  后续基线诊断分别仅完成 3/96、30/96 样本后因热事件停止。
  不能把功能验证、81 样本基线诊断或 1,200 个部分校准样本当作正式 A/B。
  见 `results/2026-09-13-trim-solo-window2.md`、
  `results/2026-09-14-trim-process-window2.md`。
- P02：最后 180 对 A/A 只通过 3/6 项，未启动正式 A/B。
  精简使选中路径指令字节由 4,676 降至 4,628，旧基线为 1,296；
  代码变小不等于吞吐通过，编译成本仍未量化。
  见 `results/2026-09-12-v8-regexp-cleanup-retest.md`。
- P03：2026-09-19 多次窗口在旧基线阶段因频率/温度停止，新候选未运行。
  Chrome/Zed 在报错后才打开，不能归因为它们。CPU 调试已停止，不应原样循环重试。
  见 `results/2026-09-19-inspector-environment-stops.md`、
  `results/2026-09-19-inspector-quiet-window-stop.md`。
- 历史启动器包含本机 CPU 4/12、固定频率、暂时下线逻辑线程等配置；
  **这里只记录入口，不提供立即执行授权**。换硬件后先重审拓扑、工具和恢复流程，
  不能照抄旧 CPU 编号，也不能把不同协议窗口拼接为通过。

## 3. Node 功能修复后跳过的性能验收

除另注外，下列项目随功能检查点 `96338ae049e90c1550c2601eeec662efcb5373c6`
接入。每项状态均为**待测**，需要 ASCII 控制和目标 Unicode/字节输入；
列出的功能测试只提供输入与输出 oracle，不能直接用整个测试文件耗时当 benchmark。

| ID | 修改范围 / 应测负载 | 特别关注的成本 | 证据与可复用资产 |
| --- | --- | --- | --- |
| P04 | Inspector Unicode 输出、属性/预览、源码与 sourceURL/sourceMappingURL 搜索；本地/worker/远程会话 | String8 构造、协议 JSON、搜索编译、连接/启动、未连接 inspector 时的控制；请求门 P03 不能覆盖这些 | `results/2026-09-18-inspector-output-migration.md`、`results/2026-09-19-sourceurl-complete.md`、`results/2026-09-19-inspector-dependencies-complete.md`；`node/test/parallel/test-inspector-output-utf8.js`。 |
| P05 | Buffer.fill / alloc 的显式 utf16le/UCS2 编码；小/大模式，奇数长度与子视图 | 转码、临时缓冲、按实际编码长度重复；numeric/Buffer/UTF-8 分支作控制 | `results/2026-09-13-buffer-fill-fix.md`；`node/benchmark/buffers/buffer-fill.js`，需补对应矩阵。 |
| P06 | Buffer indexOf / lastIndexOf / includes 的 UTF-16 搜索与 nbytes 对齐修复 | String/Buffer needle，奇偶起点、短/长 needle、成功/失败、长重复数据；两种模式都要测，对齐修复影响共享底层 | `results/2026-09-13-buffer-search-fix.md`；`node/benchmark/buffers/buffer-indexof.js`。 |
| P07 | Buffer.fill Latin-1 单字符捷径 | codePointAt 代替 charCodeAt 的短调用成本；数值快路及长模式控制 | `results/2026-09-13-buffer-latin1-fix.md`；`node/test/parallel/test-buffer-fill-latin1-shortcut.js`。 |
| P08 | atob / btoa binary-string 往返 | 小/大 Base64、0–255 字节，避免重新 UTF-8 编码后的分配和复制；旧高位字节错误输出不能作有效基线 | `results/2026-09-22-atob-byte-output-review.md`；`node/test/parallel/test-buffer-atob-byte-output.js`。 |
| P09 | ICU GetStringWidth 及显示宽度消费者 | ASCII 捷径、Latin/CJK/emoji/组合字符、WTF-8/malformed 的解码成本；长文本与终端调用 | `results/2026-09-14-icu-width-fix.md`；`node/test/parallel/test-icu-stringwidth-node-8-boundary.js`。 |
| P10 | Web Locks 名称及 held/pending/query | 短/长名、重复请求、竞争/worker；保留原 String 句柄可能延长 backing storage 生命周期，须测释放后保留内存与 GC | `results/2026-09-14-web-locks-names-fix.md`；`node/test/parallel/test-web-locks-byte-names.js`。 |
| P11 | WebStorage byte BLOB 格式及 WAL 初始化重试 | session/local 的 get/set/remove/key/枚举、短/长键值、接近配额、首次/重复打开、多进程竞争延迟与 CPU；重试成功不等于没有性能代价 | `results/2026-09-14-webstorage-byte-fix.md`、`results/2026-09-22-node-webstorage-wal-closeout.md`；WAL 提交 `1e0ed56e1c`；`node/benchmark/webstorage/`。仅使用新建隔离数据库，不碰用户数据。 |
| P12 | querystring 编码/解码及 punycode Unicode 字节解码 | ASCII 无转义、Unicode 转义、长 key/value、多参数；码点扫描与结果分配，保留 option/snapshot 正确性 | `results/2026-09-22-querystring-byte-encoding-review.md`、`results/2026-09-22-punycode-byte-decoding-review.md`；`node/benchmark/querystring/`。 |
| P13 | util.inspect / console 字节转义 | ASCII/控制字符/Unicode/非法片段，长字符串、截断、嵌套对象；输出长度和分配 | `results/2026-09-22-inspect-byte-escaping-review.md`；`node/benchmark/util/inspect.js`。 |
| P14 | readline 编辑与分片输入 | 光标移动、删除、词边界、emoji、组合字符、每字节输入；局部边界扫描及终端显示宽度 | `results/2026-09-22-readline-byte-boundaries-review.md`；`node/test/parallel/test-readline-byte-input.js`，需专用计时场景。 |
| P15 | glob / minimatch 的字节通配符 | 多层目录、ASCII/Unicode 文件名、多个问号、同步/异步、未命中；旧常数长度检查改为有界扫描及其 RegExp 依赖 | `results/2026-09-22-glob-byte-wildcards-review.md`；`node/benchmark/fs/bench-glob.js`。 |
| P16 | 内置 Fetch/Undici WebIDL ByteString | ASCII/Latin-1 header、Headers 构造/get/set、验证失败、Request/Response 与真实请求；非 ASCII 模式查询/解码成本 | `results/2026-09-22-fetch-headers-bytestring-audit.md`、`results/2026-09-22-fetch-bytestring-ready.md`；`node/test/parallel/test-fetch-bytestring-byte-boundary.js`。npm 独立 Undici 不等于内置修复。 |
| P17 | legacy URL 字节边界及与 query/path 的组合 | parse/resolve/format、ASCII 普通 URL、Unicode host/path、百分号编码、长路径；扫描和切片 | `results/2026-09-22-node-legacy-url-ready.md`；`node/test/parallel/test-url-byte-boundaries.js`、`node/benchmark/url/`。 |
| P18 | JSON 模块 BOM 与 debugger profile unit | CJS/ESM/hook 小模块首次加载、无 BOM ASCII 快路、Unicode BOM；debugger profile 启停/输出单独测，不与 JSON 吞吐混算 | `results/2026-09-22-node-json-module-bom-ready.md`、`results/2026-09-22-node-debugger-profile-unit-ready.md`；BOM 回归 `node/test/parallel/test-module-json-bom-byte-boundaries.js`。 |
| P19 | Intl.Segmenter C2 字节边界 | 短/长文本、word/grapheme/sentence、containing 随机位置、多字节/非法片段；边界判断成本 | Node 提交 `0106ad8f1a`；`results/2026-09-22-node-parser-segmenter-verified.md`。与同批 RegExp parser 分开归因。 |

P05/P06/P07/P09/P10/P11 对应 OpenSpec 仍明确保留性能或内存待办；
其他条目的功能任务即使已经完成，也不从这份性能清单中自动销项。
对已有 Node benchmark 应补固定字节长度、准确结果检查和 profile 识别，
不能假设上游默认参数已覆盖本次修复。

## 4. 暂停测速后持续接入的 RegExp 批次

本节为 **P20，所有行均待测**。表列 Node 功能修改均已接入；R13 的新正向折叠引用已于 2026-09-24 完成 Node 功能验收，性能仍待测。
每行需要独立结果，即使多个场景共用一次构建，也不能用总平均掩盖回退。

| 子项 | 功能批次 / Node 提交定位 | 重点负载与成本 |
| --- | --- | --- |
| R01 | 基础组合字面量、positive class、精确反向引用、前向字符消费、空匹配推进、非空/可空 lookaround；`96338ae049` | ASCII 不变路径、dot/否定类/U+FFFD、Unicode 与 malformed、搜索候选推进；成功/失败及长尾回溯。参考 `results/2026-09-22-functional-verified.md`。 |
| R02 | 字节原生 RegExp parser；`0106ad8f1a` | literal/constructor、冷编译、缓存命中、源码长度、astral/孤立代理项；省去转换是否被 AST 构建成本抵消。参考 `results/2026-09-22-node-parser-segmenter-verified.md`。 |
| R03 | Unicode folded literal captures / 有序双分支；`96649cc620`、`d7286497f1` | 编译期 simple-case closure、capture 分配、第一/后续分支成功及全部失败；ASCII 闭包控制。 |
| R04 | 非 ASCII greedy/lazy/finite/large 量词、量化捕获、整个 Atom 和序列重复；`b6b745c9ab`、`c3cc0a4da1`、`e45e09fd62`、`e8ad245615`、`5df1300b1e`、`396b6423d5`、`cce655bf4a` | 小/大计数、短/长 subject、捕获清除、末尾失败；是否展开、生成码大小、首次编译与稳态成本。 |
| R05 | 同级/嵌套重复、重复内分支、分支内重复、可空体、多分支及混合闭包；`74b38008ce`、`fd19ce319e`、`ef896845c6`、`f7a5d55958`、`4d87db7935`、`fad799ccb4`、`2423583c8e` | 共享/独立循环、回溯、三条以上分支；闭合 ASCII 快路、编译图深度，预算内的困难输入。 |
| R06 | 锚定可空根、非锚定重复与非锚定可空根；`77464f945a`、`5b15ecdadd`、`7c4f7d26ce` | 长前缀 miss、连续候选起点、空结果、global/sticky/replace/matchAll/split；推进不能落入字符内部。 |
| R07 | folded positive/decoder classes 和 U+FFFD 字面量；`d5ab2813af`、`b239843d07`、`89b1cc1b36` | 类范围大小、非成员失败、malformed-tail、截断、ASCII 密集混合文本；解码次数和代码体积。 |
| R08 | local dotAll（folded 与 sensitive）；`b581240598`、`bb06a1b77b` | 点号及换行、嵌套 s 开关、恢复组外标志、长字符串 miss。 |
| R09 | 多行锚点及 local multiline；`6117460889`、`8124b845e4` | LF/CR/U+2028/U+2029，长文本、多行搜索与 m/s 混合。 |
| R10 | sensitive / folded 词边界；`19d1749068`、`d3c40482aa` | ASCII 词、Kelvin/long-s、Unicode 相邻字符、零宽根；长模式编译图与合并 ASCII 片段成本。 |
| R11 | local i 启用/禁用与混合作用域；`adafb07885`、`9df5fd755b` | 频繁切换、嵌套恢复、组外 sensitive 控制、编译开销与不必要折叠。 |
| R12 | folded / local-disable 前瞻与后瞻；`7a0b2a1ba8`、`b4f64c1dd9`、`08c9a4c60f`、`c42a29fa94` | 正/负断言、捕获、可空根、逆向匹配、长非匹配前缀；不混入仍未支持的组合。 |
| R13 | sensitive local-disable 反向引用 `ba1ce3db4b`；新正向 folded 引用 V8 `6a8f0d817f`，Node 镜像同批验收完成 | 必测短 ASCII /u 引用的 C-call 成本、闭合 ASCII 旧快路、k↔K/ſ↔S 不等宽、短/长 capture、空/未匹配 capture、失败/回溯；编译期 100 步 capture 分析的成本。功能前置已完成，性能仍待测。 |

共同维度：

- 分开报告编译、首次匹配、稳定匹配、缓存命中/失效、生成码字节、分配和 RSS；
  不把启动/预热/JIT/tier-up 混进稳态时间。
- 至少区分 native、强制解释器、正常 tiered；其他优化开关按相关改动选取，
  不能把正确性套件的 20 种配置简单相加当作独立性能样本。
- ASCII、Latin、CJK、emoji、WTF-8/malformed；literal/constructor；
  大小按字节冻结，输出与 byte indices 按 node-8 规范检查。
- 控制编译预算和回溯上限，记录 timeout，不用异常退出或早退结果制造提速。
- 各 `results/*closeout.md`、`*verified.md` 和对应
  `node/deps/v8/test/mjsunit/node-8-regexp-*.js` 提供批次定位与 oracle，
  **多数新批次还没有正式性能 harness，需先编写并冻结**。
- canonical V8 的 packed plan / tail precheck / first-iteration 性能原型未整体 roll
  到 Node；standalone d8 与 Node 可能不是同一补丁集合，必须分别列 patch identity。
  旧 stock/no-optimization 的已知功能例外也不能作为快慢比较数据。

## 5. 最终累计版本仍需重测的目标

以下为**P21–P23，待测/重验**。不否认旧快照的局部结果，但它们不能替代当前版本。

| ID | 范围 | 已有入口与需要补齐的内容 |
| --- | --- | --- |
| P21 | HTTP UTF-8 主目标 | `node/benchmark/http/node-8-utf8-response.js` 已有 H01 Buffer、H02 cached String、H03 template、H04 Buffer echo、H05 String echo、H06 streaming transform、H07 JSON API、H09 multi-write。优先 H02/H05/H07，保留 H01/H04/ASCII 控制；补齐 p95/p99、CPU/request、错误字节检查及生成器瓶颈诊断。 |
| P22 | JSON、Buffer↔String、StringDecoder、字符串基础与启动 | `node/benchmark/misc/node-8-json-utf8.js`、`node/benchmark/string_decoder/node-8-utf8.js`；补 Buffer UTF-8 边界、concat/flatten、hash/equality/search/slice、解析/属性查找、snapshot/realm/worker、N-API/嵌入边界。旧 JSON 加速数字仅适用于当时二进制与负载，不直接沿用。 |
| P23 | 内存、持续运行与应用层 | 大量驻留 ASCII/CJK/emoji/mixed String 的 heap/RSS/GC；Web Locks 保留名专项；H05/H07 长时间 soak、固定吞吐下尾延迟；raw HTTP 之后再测固定版本框架、TLS/HTTP2、cluster/worker。未实现/未通过正确性路径先补功能，不先测速。 |

HTTP 语料至少覆盖 ASCII、Latin mixed、CJK、emoji、mixed JSON，
核心长度 128 B / 1 KiB / 16 KiB / 256 KiB，流分片覆盖 1/2/3/4/7/16 字节及大块。
验证 Content-Length、返回字节、keep-alive、背压和客户端中断，再开始计时。
原计划 `NODE_8_PERFORMANCE_TEST_PLAN.md` 保留 M01–M08、H00–H11 和统计说明；
其中早期“建议门槛/待安装工具/待用户决策”是历史草案，恢复时核对，不默认为现状。

## 6. 已测与已拒绝：不要误记为待补测

### HIST01：stream sizing 历史限定通过

Node 源码提交 `2ec936fa5af3814b74d8478e9ee27f2e68751e10`。
两独立窗口各 384 样本，TCP single/writev/small/Buffer 的吞吐和 CPU/request
分别通过 2% 非劣效规则；没有显著加速结论。
这不是 HTTP 尾延迟、对原版 Node 的比较或最新累计二进制验收。
不要求为了补账再跑同一旧版本第三轮；新累计版本把这些场景纳入 P21/P22 控制。

证据：`results/2026-09-13-stream-controlled-two-windows.md`。
本地快照：`local-baselines/node-f014c87-stream-sizing-qualified-2026-09-13/`；
Node SHA-256：`cb0798770d28ca8e088c4f407e5b1aa8605d71bf06f2664725c318188eaa5dd4`。

### HIST02：被拒绝的旧 RegExp 原型

以下任务已有早期或完整性能拒绝结果，撤回不等于跳过验收：

- `integrate-regexp-replacement-class-scalar-dispatch`：两轮复现
  legal-nonmember 11.1%–12.9%、malformed-tail 48.6%–49.3% 回退，拒绝。
- `prototype-regexp-replacement-class-packed-prefix-dispatch`、
  `prototype-regexp-replacement-class-structured-executor`、
  `prototype-regexp-replacement-class-generated-tail-precheck`、
  `prototype-regexp-tail-precheck-preserve-trace`：各自任务/结果记录保留，
  不能因后来功能继续推进而改写成通过。
- 后续 first-iteration/cleanup 候选另列 P02，状态是校准未合格，不继承旧原型拒绝
  或验收结论。若重新提出其中某种设计，应新建候选身份和协议，不覆盖旧证据。

## 7. 复测用的历史基线索引

下表是已记录的恢复/诊断身份，不自动指定为下一轮 A/B。
先检查 README、SHA256SUMS、依赖、补丁集合及输出正确性。

| 用途 | 本地目录（相对 local-baselines/） | 已记录二进制 SHA-256 |
| --- | --- | --- |
| P02 精简后的旧候选 / P01 前置基线 | `v8-before-trim-2026-09-13/` | d8 `1d39cef775c306dc886a2152831016007ef74050d8230c29dd0cfddb11b52a15` |
| P01 旧 trim 候选 | `v8-trim-candidate-2026-09-13/` | d8 `e246076e7ee0affaa95d5f8773dfc31325d05265737b2188f5a166bb2a52d9cf` |
| P03 旧 A | `node-webstorage-candidate-2026-09-14-qa14Zv/` | node `c28db2fe8f0ddd5d880e352ccf7d23ee19a4f09f6a0a89e99fb9c16563beb841` |
| P03 2026-09-19 的 B | `node8-inspector-correctness-2026-09-19-p769qilc/`（二进制 node/node） | node `33398c656f9ea84f9f8fda208f8b6fd239d110177b7b73133bad071c05b52134` |
| P05 单独候选 | `node-buffer-fill-candidate-2026-09-13-v4RRnA/` | node `f61618cea4a7fa71487190ddb1068ef7b574d7cebff46b6c23f4ad91f4f3a002` |
| P06 单独候选 | `node-buffer-search-candidate-2026-09-13-NsEJpE/` | node `172ae8da295b3da1b3cc654d313dcedd6e1df6ee1fba4a6b01ac79ed42310dc4` |
| P07 单独候选 | `node-buffer-latin1-candidate-2026-09-13-FJOzjN/` | node `059c178a5bba034b5763bba2930df572cc42c14638d5a447974e7b5939b15c82` |
| P09 单独候选 | `node-icu-width-candidate-2026-09-14-bBVmZO/` | node `1e94fb9b51f093df2b7e86245c369051fa12197d6933af8daaf4f0ac49254d3c` |
| P10 单独候选 | `node-web-locks-candidate-2026-09-14-BIuhau/` | node `acd72ce313e8087a436352926903c9c53b93267a4917134683989f3c590cc0b7` |
| 上一版 Node 功能快照（ba1ce3db4b） | `node8-local-disable-backref-correctness-20260923-hOjAlD/` | node `4cbbfbfab205dd6ddb74792bfcc75cddd177abaa6e82e6ef972b0bd8b9da5e07` |
| 本批 Node 正向 folded 引用功能快照（2026-09-24） | `node8-forward-fold-backref-correctness-20260924-xCAs66/`（二进制 node） | node `59681d6799c4f1368bb5575f0eb3839ab1c1d7c9af731204405ef4d04d2fd79f` |
| 最新 V8 正向 folded 引用（6a8f0d817f） | `v8-forward-fold-backref-correctness-20260923-o3Zl5r/`（二进制 v8/out/x64.release/d8） | d8 `9b9ec34dc4eb2c1fd769c46296d95a34c7410aba6e3cc46ba60d77711355936c` |

P02 更早的 control d8 SHA：
`76fba0d7a5db3e0c7db8768da5d64167610a2aa94eb14f0a0aabb3a3e1b2bf29`；
确切会话依赖见 `results/regexp-fixed-frequency-8ZTGje/user/session/session.jsonl`。
trim 两份旧快照均含相同的未验收 RegExp 原型，不能顺带验收该原型。

2026-09-24 已续编完成剩余 320 步。新 Node 通过 53 组专项/实际功能检查、
28 组历史回归和 WebStorage 24 项检查；本地副本完成 62 次独立执行并封存。
功能证据见 `results/2026-09-24-node-forward-fold-backref-verified.md`。
这不构成性能验收，P20/R13 不销项。测速仍须先核对二进制 SHA；
仅文档提交也不改变上述“功能快照”的身份。
恢复副本不一定包含完整源码/构建环境；不得依赖缺失文件时悄悄回落到工作区。

## 8. 重新开测前与销项条件

- [ ] 用户确认恢复性能工作及本轮安静窗口；确认硬件、预计时长和必要的临时设置。
- [ ] 选择登记 ID、比较类型与明确 A/B；冻结源码/补丁、二进制、编译器/参数、
  snapshot/ICU、工具、语料和 benchmark SHA-256。构建身份不一致先处理。
- [ ] 在两侧核对真实 stock/node-8 profile，功能前置通过，所有输出有独立 oracle。
- [ ] 复用可移植负载；重审旧本机启动器、权限、资源保护与独立恢复。
  运行时采用受限进程组、零 swap、整组 OOM 终止和固定时限，不与编译并行。
- [ ] 先冻结样本数/统计量/无效条件/多重比较，再 A/A；合格后执行平衡 ABBA/BAAB。
  多次平均不能消除系统漂移，不删除慢样本、不追加到通过、不用频率换算时间。
- [ ] 既有 2% 门保持：吞吐新/旧比值的约定区间下限 >0.98；
  耗时、CPU/request、约定负载延迟的上限 <1.02。
  按旧协议的多重比较与两独立窗口要求分别裁决，不能用总体平均抵消某项回退。
  新内存/启动指标先冻结自己的阈值，不擅自把早期建议升级为已确认门槛。
- [ ] 记录算术平均、配对几何平均、效应量、置信区间、原始样本和无效原因。
  profiling/trace 与主计时分离；构建/测试服务的 runtime 和 MemoryPeak 不是基准。
- [ ] 两独立窗口完成并复核；CPU/online/governor/EPP 等恢复核对通过。
- [ ] 给该 ID 填写结果报告、窗口目录、身份与结论，再更新状态；
  结论只能是“限定范围通过 / 回退需修 / 证据不足”，不能以功能通过代替。
- [ ] 继续保存旧原始数据、失败记录与本地二进制；不上传编译资产。

建议恢复顺序：先 P21/P22 的短 A/A 与累计版本关键控制，确认新环境可用；
再处理 P01–P03、P20 中短 ASCII /u 引用及非成员失败等高风险项；
随后覆盖其他 Node 边界和内存/长期运行。每一轮仍须单独确认，不自动开测。

## 9. 后续登记模板

每次功能改动跳过性能测试，在提交时追加或更新对应 ID，不因任务归档而删除：

- ID / 修改标题 / 日期：
- V8、Node 提交或准确未提交补丁身份：
- 状态与跳过原因：
- 可能新增的扫描、分配、复制、转换、C-call、代码体积或保留内存：
- 待测负载、ASCII/未改路径控制、正确性前置：
- A/B 及不具备等效输出的旧输入：
- 基线目录、二进制/依赖/构建与负载摘要：
- harness 已有入口或“尚需实现”：
- 门槛、样本预算、窗口与恢复条件：
- 复测日期、原始结果路径、限定结论及剩余项：

本文建立时没有启动任何计时、预热、A/A、A/B、构建或 CPU 设置操作。
