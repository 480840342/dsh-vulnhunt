# dsh-redteam-model 融合说明

本项目对 `SeaOf0/dsh-redteam-model` 做了模块级审计，并以提交
`e549e0f2fa515cce5f71842088f75333e7e997e7` 为固定上游版本。上游采用 MIT License。
项目自带「挖洞模式」（预设 ID `bughunt`）作为赏金挖掘入口；上游的「渗透测试模式」
（`pentest`）、「安全研究员」（`redteam`）及其余专业模式与插件通过
`scripts/configure-redteam-suite.mjs` 事务式部署。本包不再占用 `pentest` / `redteam` ID，
因此两套预设可以共存。

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
| 专业模式 | 渗透测试、安全研究员、资产测绘、攻防演练、二进制分析、云安全、代码审计、CTF 解题、事件响应 |
| 扫描与审计 | `dsh-scanner-tools` 和 `dsh-semgrep-audit` 按预设挂载 |
| 过程治理 | stage-gate、route-boost、auto-advance、session-pulse、trace-vault、campaign-memory |
| 协作与展示 | AttackAtlas、Hunter、product-subagents、redteam-results、mode-group |
| MCP 管理 | MCP Studio 提供连接配置界面；项目原有 Burp MCP 仍保持按需连接 |
| 确定性安全约束 | sec-enforce 限制工作区写入、报告门禁、高风险操作与无速率控制扫描 |

## 部署清单

宿主平面安装 13 个插件：`dsh-attack-atlas`、`dsh-auto-advance`、`dsh-campaign-memory`、
`dsh-hunter`、`dsh-mcp-studio`、`dsh-mode-group`、`dsh-product-subagents`、
`dsh-redteam-results`、`dsh-route-boost`、`dsh-sec-enforce`、`dsh-session-pulse`、
`dsh-stage-gate`、`dsh-trace-vault`。

预设平面安装 2 个插件：`dsh-scanner-tools`、`dsh-semgrep-audit`。它们作为依赖存在，但不加入宿主
bundle 列表，防止工具目录污染其他模式。

## 安全排除与转换

- 不部署 `av-evasion` 模式。
- 不安装 `dsh-refusal-guard`，也不加载上游管理器 UI，避免从设置页重新安装被排除组件。
- 不安装 `dsh-webshell-mgr`，不分发其生成、连接、隧道和持久化能力。
- 不部署上游全局 `AGENTS.md`，避免改写普通会话和宿主的全局行为。
- 部署专业模式时，配置器会在副本中删除对 `dsh-refusal-guard` 的反拒答提示，替换为明确授权范围、
  只读优先、限速、可回滚和侵入动作确认要求；上游依赖本体保持不变。
- 参考资料可以用于授权审计、检测和复核，但不会被转换成自动盲扫或未授权执行指令。

## 安装可靠性

- 依赖使用固定提交的 HTTPS 归档，避免要求用户配置 GitHub SSH Key。
- profile 的 `package.json` 和 `pnpm-lock.yaml` 修改前自动备份；安装失败恢复快照并重新同步依赖。
- 所有插件一次 `pnpm install` 完成，减少逐插件安装导致的半安装状态。
- 固定版 MCP Studio 的 Web channel 会做精确签名补丁，修复当前 DSH 下 `/api` 前缀导致的 404；未知版本拒绝改写。
- 模式由项目自己的 marker 管理；遇到同名但非本项目管理的目录时跳过，不覆盖用户内容。
- 启动脚本先调用 `--status`，只有缺项或版本变化时才重新配置，完成后提示重启 DSH Web。

这样融合的目标是在安全许可范围内保留上游可运行的主要能力，同时不破坏本项目现有的持久状态、Web 投影、Burp MCP 可选连接和旧会话兼容性。所有模式都只允许在用户明确授权的范围、时间窗口和动作边界内运行。
