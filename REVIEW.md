# 完整审查报告：dsh-pentest 未提交变更（fix 批次）

审查对象：工作区 15 个未提交文件（含新增 REVIEW.md），基线 `3815e74`。
审查方式：源码逐行审查 + 构建产物字节级比对 + 三套件全量测试运行。
运行环境：Node v22.16.0，Windows x64。

## 变更内容概览

本批变更是对前次审查（REVIEW.md）所列问题的修复批次，涉及四个层面：

| 层 | 文件 | 变更主题 |
|---|---|---|
| 存储 | `src/dsh-pentest/src/store.ts` | 每会话写队列互斥（`sessionQueues`）、`initGoal` 先写后清、`addSubmission` 全或无回滚、`sessionData` 数值序排序 |
| 投影 | `src/dsh-pentest/src/projection.ts` | `normalizeConfidence` 对齐 store、`retainedEdges` 悬挂边过滤 |
| 工具 | `src/dsh-pentest/src/tools.ts` | `pentest_submit` 改为单一 `store.addSubmission` 事务调用（消除逐条 `addFact` 循环） |
| 伴生 | `src/invariant.ts` | `sameSession` 双键查找（scoped 键优先，裸键兜底） |
| 清单 | `package.json` + README + bundle.spec | 声明 `schemastery`/`zod` 运行时依赖与 `dsh-storage` peer，文档化 Node >= 22.5 |

## 测试验证（全部通过）

| 套件 | 结果 |
|---|---|
| `tests/bundle.spec.ts`（根） | 3 passed |
| `src/dsh-pentest`（host 插件：invariant + projection + tools） | 62 passed |
| `src/dsh-client-ui-pentest`（graph + apply + views + view） | 35 passed |

合计 100 个测试全部通过。新增测试覆盖到位：并发写唯一 ID（`concurrent graph writes`）、混合提交回滚（`rolls back a mixed submission`）、悬挂边过滤（`does not expose edges whose capped endpoints are absent`）、百分比 confidence 归一（投影侧断言改为 `0.09`）。

## 产物一致性（字节级验证）

- `lib/pentest.js` ≡ `packages/dsh-pentest/lib/index.js`（fc /b 相同，605714 字节），且包含全部新符号：`sessionQueues`、`enqueue`、`addSubmission`、`retainedEdges`、`normalizeConfidence`。
- `lib/invariant.js` ≡ `packages/dsh-pentest/lib/invariant.js`，包含 `recordKey` 与双键查找。
- `lib/storage-sqlite.js` ≡ `packages/dsh-storage-sqlite/lib/index.js`。
- `cordis.patch.yml` 无变更，与 `lib/` 导出面保持对齐。

前次审查的「packages/ 产物过期」问题（旧 #10）已随本批重建消除。

## 前次高危问题修复验证

### 1. 并发 ID 竞争（旧 #1）——已修复

`sessionQueues: Map<string, Promise<void>>` + `enqueue()`（store.ts L128/167-174）将每个 session 的 read/allocate/write 事务串行化：`previous.then(operation)` 链式排队，settled promise 吞掉结果避免链断裂。`dispose()` 清空队列。所有写路径（`initGoal`/`addIntent`/`addFact`/`addFinding`/`addAsset`/`addSubmission`）均走 `enqueue`。并发测试（tools.spec L251-262）验证两个并发 `addFact` 得到 `fact-1`/`fact-2` 唯一 ID。

**遗留小点（LOW）**：`sessionQueues` 无淘汰机制，会话 ID 数量大时 Map 无界增长；dispose 前条目永驻。当前为单进程会话模型，实际风险很低。

### 2. invariant 键方案不一致（旧 #2）——已修复

`src/invariant.ts` L79：`domain.table(tableName).get(recordKey(record.sessionId, id)) ?? domain.table(tableName).get(id)`——scoped 键优先，裸键兜底（兼容迁移窗口）。`lib/invariant.js` 已同步。上次建议「invariant 测试直接驱动真实 store」未完全采纳（invariant.spec.ts 仍以裸键/自造数据为主，部分用 scoped 键），但双键查找使两种数据形状都通过，行为正确。

### 3. `initGoal` 先清后写（旧 #7）——已修复

现在先 `put` 新 goal 再 `clearSession`（store.ts L219-230），goal 写入失败时旧图保留，不再落入无 goal 空图态。

### 4. `pentest_submit` 逐条写+投影错位（旧 #3/#8 部分收敛）——已修复

`tools.ts` 现在先构造全部 `factWrites`/`assetWrites`/`findingWrites`（预归一化），单次 `store.addSubmission(...)` 全或无落库，成功后才 `appendSubmissionProjection`。混合提交回滚测试验证：`parentId: 'asset-404'` 时 facts/assets 全部回滚、无 `pentest_add_fact` 合成事件。

回滚实现（store.ts L378-385）正确：`created.reverse()` 逆序删除，边先于节点删，节点用 `TABLE_OF_ID_KIND` 定位。前置校验（L353-362）把可预期的失败全部提前到写入前，catch 路径仅覆盖意外错误。

### 5. confidence 双端不一致（旧 #4）——已修复

投影侧新增 `normalizeConfidence`（projection.ts L140-149）与 tools 侧 `confidenceValue` 语义对齐：数字 >1 或百分比字符串按 /100 折算并 clamp 到 [0,1]，无效值回落 0.5。投影测试断言 `confidence: 9` → `0.09`。

**注意差异（LOW）**：双端对非法值的处理不同——tools 侧抛错（`confidence must be 0..1...`），投影侧静默回落 0.5。这对「投影只重放已成功的 tool/call 事件」的设计成立（成功事件里 confidence 已被 tools 归一），但若历史日志中存在绕过工具层的原始事件，两侧仍会分叉。可接受。

### 6. `sessionData` 词典序（旧 #5）——已修复

排序改为提取 `-(\d+)$` 尾部序号按数值比较（store.ts L400-404），无匹配回落 `MAX_SAFE_INTEGER`。`fact-10` 现在正确排在 `fact-2` 之后。

### 7. 依赖声明（旧 #11/#12）——已修复

`package.json` 新增 `dependencies: { @deepseek-ai/schemastery: 3.18.1, zod: ^4.4.3 }` 与 `peerDependencies: { @deepseek-ai/dsh-storage }`（optional），README 标注 Node >= 22.5 运行时要求，`bundle.spec.ts` 断言清单契约。

**一个不一致（MEDIUM）**：README 目录结构注释写「项目根 = bundle 包 @howmp/dsh-pentest（运行时依赖由宿主提供）」，但 `dependencies` 里的 `zod`/`schemastery` 是**随 tarball 交付**的运行时依赖而非宿主提供（npm pack 会带上它们）。表述与清单行为相反，属文档措辞问题。更值得注意的是：这使 bundle 从「零依赖自包含」变为「两依赖」，peer 里其它 `@deepseek-ai/dsh-*`（dsh-tools/dsh-session/dsh-storage-domain/dsh-system-prompt/zod 同位）仍未声明——bundle 实际是「混合模式」。锁定文件只有 36 行变更（新增两包），行为自洽。

### 8. 悬挂边（新修复，旧 #6 关联）——已修复

`retainedEdges`（projection.ts L151-160）在节点/资产被 cap 逐出时同步清理引用它的边，`withNode`/`withAsset` 均接入，goal id 计入白名单（spawns 边的 source）。测试验证 cap 边界下所有边端点仍在图内。

**遗留（继承旧 #6，MEDIUM）**：投影 counts 仍由截断后数组计算（`viewPentestState` L345-350），超 200 后 UI 计数封顶而持久层继续增长；计数语义（「投影内可见数」vs「总会话记录数」）未文档化。且被逐出窗口的 intent/fact 使后续 `derived_from`/`yields` 引用在投影中被跳过（store 仍接受），两侧图形态在长会话中必然分叉——这是 cap 设计的固有属性，README 边界说明可覆盖，建议补充一句明确「UI 图是最近 200 条的窗口视图，完整记录以 pentest_state/pentest_report 为准」。

## 新发现问题

### MEDIUM

**N1. `enqueue` 后读操作未串行化，读到的可能是队列中间态**

`getGoal`/`sessionData`/`view` 不经过 `enqueue`。在提交事务执行中途（`addSubmission` 的多写之间）并发调用 `pentest_state`，读到的是部分写入状态。读工具对最终一致性无硬需求、且 JS 单线程下每个 `put` 原子可见，实际影响限于「读视图瞬间含半批提交」，对模型决策无实质误导（下一次读即完整）。若要消除，读也排队即可，代价极小。

**置信度：85**（行为确定存在，影响评估为低）

**N2. `appendSubmissionProjection` 的 `turn: 0` 合成事件重放顺序仍未验证**

tools.ts L108-131 沿用：合成 `tool/call` 事件 `turn: 0`、模块级全局 `submissionProjectionEvent` 计数器做 step。本仓库无法解析 `@deepseek-ai/dsh-session` 的重放排序实现（包不在根 node_modules，仅存在于 pnpm 虚拟存储 `C:\Users\admin\Desktop\dsh\deepseek-harness`），未验证按 (turn, step) 排序重放时 `turn:0` 事件是否排在真实事件前而被折叠跳过。测试覆盖了「append 落库」与「投影折叠」，仍缺「子提交 → 父会话全量重放」整链。前次审查 #3 的验证诉求未被本批响应。

**置信度：80**（排序风险机制存在，实际宿主行为未证实）

**N3. `nextId` 在 `initGoal` 后依赖「清空后的表」，但多会话共享一张表时 O(全表) 扫描仍在**

`nextId` 遍历整表按 sessionId 过滤（store.ts L191-201）。每条写两遍（node + edge 各一次 nextId），100 会话 × 每会话 500 节点时每次写扫描 5 万行 × 2。sqlite 后端下 `entries()` 若为全表物化，长任务下写延迟线性退化。继承自旧 #9，队列化后每写额外放大（串行不减少扫描量）。建议给 domain 增加按会话的索引或维护内存计数器（store 已是单写者，内存 max-seq 缓存即可，`clearSession` 时重置）。

**置信度：85**（性能问题确定，触发规模取决于使用模式）

### LOW

**N4. `addSubmission` 回滚删除可能自身失败**

catch 路径里 `domain.table(...).delete(...)` 若再抛错（后端 IO 故障），异常会取代原始错误上抛，且留下部分回滚的中间态。可接受（触发条件是后端双重故障），建议在回滚循环里 try/catch 每个删除并把二次失败并入错误信息。

**N5. `enqueue` 无取消语义，`dispose()` 清空 `sessionQueues` 后排队中的操作仍持有旧 domain 引用**

`dispose` 先清 Map 再 `await close()`，此时若有在途 `enqueue` 操作正在执行，`close()` 与写操作竞争。Cordis 插件销毁路径通常不再有新工具调用，实际风险低；严格做法是先 await 所有队列排空再 close。

**N6. `normalizeConfidence` 接受 `"0.5"` 这类字符串且 `parsed >= 0` 才处理，负数字符串回落 0.5 而非报错**

与 tools 侧（负数抛错）不对称，见上节「注意差异」。

**N7. README「运行时依赖由宿主提供」措辞与 dependencies 行为相反**（见上节 #7）。

### 观察项（不计问题）

- `concreteIntentId` 正则覆盖 `delegation-intent-id`/`<intentId>`/`{intent_id}` 等占位形态，与协议提示词闭环良好。
- `migrateLegacyKeys` 保持幂等（scoped 键已存在则只删旧键），迁移测试覆盖「不覆盖既有 scoped 记录」。
- 双端（store/投影）引用校验镜像纪律维持良好；`v8 ignore` 注释的使用克制且有理由说明。
- 提交投影的 `callId` 前缀 `pentest-submit-` 与计数器单调递增，无碰撞面（单进程内）。

## 后续修复执行记录（同会话追加）

审查批准后，P1-P3 建议已全部实施并验证：

### P1：`turn: 0` 合成事件重放语义 —— 已验证安全 + 测试锁定

对宿主 `dsh-session`（`packages/core/session/src/index.ts`）源码取证：

- `Session.append` 的事件 `seq = log.length`（连续性契约，L629），事件严格按到达顺序进入日志；
- `SessionProjectionRegistry` 的 eager drive 与 lazy fold 均按日志序折叠，**不存在任何 (turn, step) 排序**；
- 冷恢复路径 `restoreFloor`/`readFrom` 同样按 seq 序供给事件。

因此 `appendSubmissionProjection` 的 `turn: 0` 合成事件虽排在真实 turn≥1 事件「之前」的 turn 值上，但其 **seq 位于父会话自身事件之后**，重放时 goal/intent 已折叠存在，不会被跳过。原 N2 风险不成立。

新增集成测试 `replays the full parent log in seq order: turn-0 synthetic submissions fold after their anchors`（projection.spec.ts）：构造 turn-1 goal/intent + turn-0 合成提交事件，断言 live snapshot 与全量重放折叠结果完全相等，永久锁定该语义。

### P2：`nextId` O(全表) 扫描 —— 已消除

`PentestStore` 新增 `sessionCounters: Map<sessionId, Map<IdKind, number>>` 内存 max-seq 缓存：

- 会话首次分配时从五张表一次性构建（仍一次全表，但摊销 O(1)/写）；
- 后续分配 O(1) 递增（store 是域的单写者且分配都在 `enqueue` 临界区内，缓存与持久层不会分叉）；
- `initGoal` 重置时整表删除，计数器随新 engagement 重启；
- `dispose` 时清空。

### P2：README —— 已修正

- 目录结构注释改为「自带 zod/schemastery 运行时依赖，其余宿主提供」（与 dependencies 行为一致）；
- 已知边界新增「Web 图为窗口视图」条目：投影保留最新 200 节点/资产/边、悬挂边同步清理、完整记录以 `pentest_state`/`pentest_report` 为准。

### P3：加固 —— 已实施

- `addSubmission` 回滚循环内逐条 try/catch：单个删除二次失败不再中断其余回滚，原始错误保留上抛；
- `dispose` 先 `await Promise.all([...sessionQueues.values()])` 排空在途事务，再关闭域与清空簿记，消除 close 与在途写的竞争。

### 产物同步与验证

- 上述 store 改动同步进 `lib/pentest.js`（手工 patch 保持 tsdown 编译形态），并镜像至 `packages/dsh-pentest/lib/index.js`（`fc /b` 字节一致）；
- 全量测试：host 63（+1 重放集成测试）+ client 35 + bundle 3 = **101 全绿**。

### 仍未处理（接受现状）

- N1（读操作不入队，读到半批提交的中间态）：评估影响为「瞬时可读但不误导」，保留现状；
- `sessionQueues`/`sessionCounters` 无淘汰（会话 ID 无界增长）：单进程生命周期内可接受，留待宿主提供会话生命周期钩子时再收口。

## 总体评估

| 维度 | 评分 | 说明 |
|---|---|---|
| 正确性 | 9/10 | 六项前次问题全部有效修复，事务与并发处理正确 |
| 一致性 | 9.5/10 | src/lib/packages/patch 四层字节级同步 |
| 测试 | 9/10 | 100 测试全绿，新增并发/回滚/悬挂边覆盖；缺 turn:0 重放整链 |
| 安全性 | 9/10 | 无新增面；引用校验与占位符拒绝维持 |
| 可维护性 | 8.5/10 | 队列/回滚逻辑清晰；`enqueue` 内存与 nextId 扫描有轻微技术债 |
| 文档 | 8/10 | Node 版本已注明；依赖表述与窗口计数语义待补 |

**结论：批准合入。** 前次两个高危问题修复扎实且都有测试背书。遗留事项均为中低危，不阻塞发布。

## 建议后续（按优先级）

1. **P1**：补一条「子提交 → 父会话全量重放」集成测试，或在真实验证 `dsh-session` 事件排序语义后为合成事件选择不会被折叠跳过的 turn 值（N2）。
2. **P2**：`nextId` 加内存 max-seq 缓存（N3），消除 O(全表) 扫描。
3. **P2**：README 修正依赖表述 + 补投影窗口语义说明（N7、旧 #6）。
4. **P3**：`enqueue` 条目淘汰与 dispose 排空语义（LOW 项）；读操作入队以获得线性一致读（N1，可选）。
