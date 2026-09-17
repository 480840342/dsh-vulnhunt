# dsh-redteam-model 融合说明

本项目对 `SeaOf0/dsh-redteam-model` 做了模块级审计，并按现有持久数据模型重写适配。上游采用 MIT License。
融合能力只在独立的「红队模式」启用；原 `pentest` 预设保留兼容 ID，显示为「挖洞模式」，不注入红队门禁协议。

## 已融合

| 上游思路 | 本项目实现 |
|---|---|
| 阶段门禁 | `workflow.ts` 计算 scope / recon / validation / review，`pentest_gate` 给出 PASS 或缺项 |
| operation 中断恢复 | `pentest_state.workflow.nextActions` 联合现有 task checkpoint、租约、退避和幂等 submission 恢复 |
| 证据预判与反证 | intent 的 `evidencePlan` 记录 expected / negative / stopConditions / fallback |
| 扫描命中不等于漏洞 | 命中保留为 fact/coverage，finding 仍强制复现步骤及 observed/control/impact |
| 连续失败熔断 | 复用 `maxAttempts`；耗尽后进入 blocked，并把 intent fallback 带入 `lastError` |
| 攻击面收口 | 四类基础侦察必须显式覆盖，高价值 vuln/finding/cve fact 必须派生验证 intent |
| 状态可视化 | 会话投影增加 workflow，渗透页显示当前阶段、完成状态和未通过门禁数量 |

## 没有直接引入

- 十个安全模式、十七个运行时插件：当前项目只提供挖洞/红队两个清晰入口，不扩大为上游完整模式矩阵。
- 全量 refs、payload 与扫描器封装：避免提示词膨胀、盲扫和工具链冲突；按资产特征按需接入。
- 全局 `AGENTS.md`、拒答修复和系统指令覆盖：不修改宿主全局行为，也不降低运行时安全边界。
- AttackAtlas SQLite 图谱、成果大屏和多 harness 双签：现有探索图、资产图和独立复核门继续作为唯一事实源。
- 自动安装外部工具：工具缺失时优先 MCP、现有替代工具、受控脚本或人工确认。

这样融合的目标是保留上游最有价值的流程治理，同时不破坏本项目现有的持久状态、Web 投影、Burp MCP 可选连接和旧会话兼容性。两个模式都只允许在用户明确授权的范围、时间窗口和动作边界内运行。
