# dsh-pentest

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的可恢复授权安全测试插件。
它提供「挖洞模式」，把侦察、资产归档、逐项验证、证据复核和报告生成连接成可追踪工作流，
并在 Web 中提供探索链路、漏洞、资产和报告视图。

红队评估与其余专业安全模式由上游 [SeaOf0/dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model)
提供，两者按预设 ID 分工共存，不互相覆盖。详见[与上游集合共存](#与上游集合共存)。

当前实现版本：`0.1.0-rc.36`

## 项目特点

- **先侦察再测试**：子域名、目录/端点、端口/服务、框架指纹、存储桶和前端资源统一归档。
- **资产驱动推进**：新发现的 API、路由、对象 ID、内部 host、组件版本和云资源自动进入待测队列。
- **中断可恢复**：任务 checkpoint、租约、指数退避、阻塞状态和幂等提交避免断线后重复工作。
- **漏洞质量门槛**：只有符合赏金/授权范围，并具备复现步骤、观察结果、对照结果和影响证据的问题才进入 finding。
- **低噪声策略**：识别 WAF、CDN、风控和限速后降低频率与并发，避免高强度 fuzz、批量爆破和破坏性验证。
- **覆盖检查**：对每个资产登记检查项；未覆盖资产、未完成任务或阻塞项存在时只输出阶段报告。
- **Skill 融合**：吸收 `clown-src-6k-skill` 的锁面/自由跳、一种子闭环、短表、价值排序、黑盒/白盒双轨和按特征选择知识模块。
- **单一挖洞模式**：预设 ID 为 `bughunt`，显示为「挖洞模式」；上游 `pentest`（渗透测试）和 `redteam`（安全研究员）由本包套件一并部署，互不抢 ID。
- **输入框兼容修复**：随包分发 DSH 会话组件修复，覆盖文字不可见、清空草稿后的高度和翻译扩展引起的 DOM 冲突；Windows 启动脚本自动执行。
- **Burp MCP 模式**：可选接入 Burp 的 legacy SSE MCP，通过 `mcp-remote` 转为 DSH stdio；自动重连、超时和离线降级配置不会影响未使用 Burp 的安装。
- **完整安全能力套件**：固定整合上游集合的 9 个专业模式（含渗透测试与安全研究员）与 15 个安全插件，覆盖 AttackAtlas、扫描器、Semgrep、MCP Studio、会话脉冲、轨迹仓库、成果面板、阶段门禁、恢复推进和子代理协作。
- **安全白名单部署**：不加载免杀规避模式、拒答绕过插件和 WebShell 管理器；上游预设中的反拒答指令会在部署副本中替换为授权范围、低噪声和破坏性操作确认约束。

本目录是自包含 bundle 包（`@howmp/dsh-pentest`）：宿主插件、Web 界面、SQLite 后端和挖洞预设通过包内
`exports` 一同分发。Release 资产可直接由 `dsh plugin add` 安装。

## 安装

本包 **不再** 把 `SeaOf0/dsh-redteam-model` 写成 URL 依赖。pnpm 12 的 `blockExoticSubdeps` 会拒绝这种子依赖，导致 `dsh plugin add` 报 `ERR_PNPM_EXOTIC_SUBDEP`。专业模式改由 `configure:suite` 在安装后按需下载固定提交。

### 从 GitHub 源码归档安装

```bash
dsh plugin --profile web add https://github.com/480840342/dsh-vulnhunt/archive/refs/heads/main.tar.gz
```

### 从 Release URL 安装

```powershell
dsh plugin --profile web add https://github.com/baianquanzu/dsh-pentest/releases/latest/download/dsh-pentest.tar.gz
```

### 或下载后从本地文件安装

```powershell
dsh plugin --profile web add file:C:\path\to\dsh-pentest.tar.gz
```

直接用 `dsh plugin add` 安装的用户，还需执行包内的输入框修复脚本。默认 Windows 安装位置：

```powershell
node "$env:USERPROFILE\.dsh\profiles\web\node_modules\@howmp\dsh-pentest\scripts\repair-composer.mjs"
node "$env:USERPROFILE\.dsh\profiles\web\node_modules\@howmp\dsh-pentest\scripts\configure-redteam-suite.mjs"
```

Linux/macOS：

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/@howmp/dsh-pentest/scripts/repair-composer.mjs"
node "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/@howmp/dsh-pentest/scripts/configure-redteam-suite.mjs"
```

自定义 `DSH_HOME` 或 profile 时调整脚本路径。脚本默认通过 `npm root -g` 定位全局 DSH；
非全局安装可附加 `--host-root /path/to/node_modules/@deepseek-ai/dsh`。
支持会话组件 `0.1.0-rc.6`、`0.1.0-rc.8`，修改前自动备份，重复运行不会重复修改，未知版本会报错而不写入。
修复后停止并重新启动 DSH Web，在浏览器强制刷新，然后在新会话中选择「挖洞模式」。

### 本地源码启动

Windows 用户可以直接运行：

```powershell
.\start-pentest.bat
```

启动脚本会自动运行输入框修复并配置完整安全能力套件。旧版输入框补丁曾只存在于开发电脑的全局 DSH 中；从 `rc.28` 起，
源码 ZIP 和 Release 安装包都包含修复脚本。升级 DSH 后请重新运行启动脚本或输入框修复命令。

### Burp MCP 模式

启动时不连接 Burp。点击输入框左下角 **+**，选择 **burp-connect · 连接 Burp MCP**；断开时选择 **burp-disconnect · 断开 Burp MCP**。
连接由当前 DSH 进程内的会话共享，重启后需重新连接。默认 bridge 为 `D:\burp-mcp\node_modules\mcp-remote\dist\proxy.js`；
也可以显式指定：

```powershell
.\start-pentest.bat -BurpMcp -BurpMcpUrl http://127.0.0.1:9876/ `
  -BurpMcpBridge D:\burp-mcp\node_modules\mcp-remote\dist\proxy.js
```

其他目录使用环境变量：

```powershell
$env:DSH_BURP_MCP_BRIDGE = 'D:\burp-mcp\node_modules\mcp-remote\dist\proxy.js'
$env:DSH_BURP_MCP_URL = 'http://127.0.0.1:9876/'
.\start-pentest.bat -BurpMcp
```

`-BurpMcp` 只保存连接参数，不会自动连接。配置器更新 `$DSH_HOME\profiles\web\cordis.patch.yml`，保存 stdio bridge、
legacy SSE transport 和重连策略，并保留原文件备份。启动脚本会迁移旧的 Burp 自动连接配置。Burp MCP 工具在模型目录中通常显示为 `mcp__burp__*`；
两个模式都会先检查实际工具目录和参数，再把 Burp 的流量、请求、响应和技术栈线索归档到资产与事实记录。
Burp 未启动或 MCP 暂时断开时，连接会标记为可重试/阻塞，其他侦察和测试任务仍可继续。

清除已保存的 Burp MCP 连接参数（正在运行的连接请用加号菜单断开）：

```powershell
.\start-pentest.bat -DisableBurpMcp
```

Burp 端建议保持监听在本机回环地址，并在 Burp MCP 设置中按授权范围配置 HTTP 请求和项目数据权限。

### 模式切换与安全测试入口排查

- 选择模式应在新会话发送首条消息之前完成。模式按钮与菜单勾选不一致时，先关闭本页自动翻译并强制刷新；rc.30 为模式标签增加了防翻译处理。
- **轨迹** 是 DSH 的通用执行日志，**挖洞/红队** 是本插件按当前预设显示的探索链路、资产和漏洞视图。发送首条消息后，会话顶部才显示这些标签。
- 有模式名称但没有对应标签时，检查是否安装了完整 bundle；仅复制 `preset` 目录不会安装前端。运行项目的 `start-pentest.bat` 重新安装，然后重启 DSH 并按 Ctrl+F5。
- rc.31 的启动脚本每次重新打包，并比较已安装前端文件，避免同版本旧包一直被复用。
- 模式标签存在但图为空，表示当前会话尚无 `pentest_*` 工具记录；普通聊天和 Shell 调用不会自动变成探索图。

手动构建和校验：

```powershell
npm ci
npm test
npm run build
npm run build:check
```

构建完成后，使用 `dist\howmp-dsh-pentest-<version>.tgz` 安装到 DSH Web profile。插件更新后需要重启正在运行的 DSH Web 进程。

## 挖洞模式

- 预设 ID 为 `bughunt`，显示为「挖洞模式」：面向漏洞赏金和授权挖掘，先过滤明确不可获赏金的问题，
  按 `completion.canFinish` 收口；不注入红队阶段门禁协议。
- 渗透测试（`pentest`）和红队评估（`redteam`）由上游集合提供，见[与上游集合共存](#与上游集合共存)。

## 补充专业模式与插件

安装套件后，模式选择器还会提供：渗透测试、安全研究员、资产测绘、攻防演练、二进制分析、云安全、代码审计、CTF 解题和事件响应。

安全白名单共安装 15 个上游插件：AttackAtlas、自动推进、任务记忆、Hunter、MCP Studio、模式分组、产品子代理、红队成果、路由增强、扫描工具、安全执行约束、Semgrep 审计、会话脉冲、阶段门禁和轨迹仓库。扫描工具与 Semgrep 只挂载到对应预设，其余插件位于宿主平面；安全执行约束负责工作区写入、报告门禁、高风险命令确认与扫描速率纪律。

配置器还会对固定版本的 MCP Studio 客户端执行一次签名校验兼容补丁，使其在当前 DSH Web 路由中直接使用裸 channel，避免设置页先请求错误 `/api` 地址产生 404。原文件只备份一次，未知代码布局会停止安装并回滚 profile。

以下组件不会部署：`av-evasion`、`dsh-refusal-guard`、`dsh-webshell-mgr`。上游代码以提交 `e549e0f2fa515cce5f71842088f75333e7e997e7` 的 HTTPS 归档固定，配置器会备份 profile 与锁文件，失败时回滚。检查状态：

```powershell
node "$env:USERPROFILE\.dsh\profiles\web\node_modules\@howmp\dsh-pentest\scripts\configure-redteam-suite.mjs" --status
```

## 挖洞工作流

1. 创建目标并记录授权说明。
2. 建立侦察 intent，归档子域名、端点、端口、框架和其他资产。
3. 将资产标记为 `eligible`、`unknown` 或 `excluded`，只有符合赏金范围的资产才进入主动测试。
4. 为资产登记覆盖项，按业务面和证据强度创建去重的测试任务。
5. 深度测试 intent 填写 `evidencePlan.expected`、`negative`、`stopConditions` 和 `fallback`，使验证目标可证伪、可停止、可降级。
6. 子 agent 通过 `pentest_submit` 提交事实、资产、覆盖状态和已复核结果；网络中断时使用相同 `submissionId` 重试。
7. 输出前调用 `pentest_state` 检查 `completion`、任务、覆盖项和待验证事实。
8. 只有 `completion.canFinish=true` 时才生成最终报告，否则输出阶段报告并列出剩余工作。

## 与上游集合共存

本包与 [SeaOf0/dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model) 按预设 ID 分工，可同时安装。
本包把挖洞预设改名为 `bughunt`，把 `pentest` / `redteam` 让给上游，`configure:suite` 会把上游完整专业模式一并部署：

| 预设 ID | 归属 | 显示名 | 说明 |
|---|---|---|---|
| `bughunt` | **本包** | 挖洞模式 | 本包的探索链路/漏洞/资产/报告四视图挂在这里。 |
| `pentest` | 上游 | 渗透测试模式 | Web/API/app/小程序专业渗透，走上游自己的门禁与界面。 |
| `redteam` | 上游 | 安全研究员 | 上游通用总入口。 |
| 其余专业模式 | 上游 | — | 资产测绘、攻防演练、二进制分析、云安全、代码审计、CTF 解题、事件响应。 |

`av-evasion`、`dsh-refusal-guard`、`dsh-webshell-mgr` 仍不部署。用户自己创建的同名预设目录不会被覆盖，只会被跳过并提示。

## 使用边界

本项目仅用于明确授权的安全测试、内部审计、训练环境和本地代码审查。默认优先只读验证、测试账号和可回滚字段；
不登出或吊销用户会话，不修改他人对象、密码、角色、订单或资金。详细攻击载荷不会作为盲扫指令自动执行，所有漏洞都需要
可复现证据和范围确认。

## 界面预览

### 模式选择

![安全测试模式选择](images/mode.png)

### 对话与执行

![对话与执行](images/chat.png)

### 探索链路

![探索链路](images/flow.png)

### 漏洞视图

![漏洞视图](images/vuln.png)

### 资产视图

![资产视图](images/asset.png)

### 测试报告

![测试报告](images/report.png)

## 架构速览

- **领域模型**（`src/dsh-pentest/src/spec.ts`）：storage domain `pentest`（version 2）——`goals` / `intents` /
  `facts` / `findings` / `assets` / `tasks` / `coverage` / `submissions` / `edges`。边即链路词汇：`spawns`(goal→intent)、
  `yields`(intent→fact)、`derived_from`(fact→intent)、`proves`(intent→finding)，资产关系用 `parent`(asset→asset)。
  finding 必填可复现步骤、赏金资格与观察/对照/影响证据；任务、覆盖项和提交批次支持断点续跑与幂等重试。
- **确定性 id**（`store.ts`）：节点/边 id 为 `<kind>-<n>`（按会话计数，goal 重置后归零）——工具返回 id 供模型
  跨调用引用，会话投影从日志纯重放同一张图。
- **工具**（`tools.ts`）：`pentest_submit`（子 agent 直写指定父 intent）/ `pentest_add_goal`（重置整图）/ `pentest_add_intent`（恰好一个锚点，自动建任务）/
  `pentest_add_fact` / `pentest_add_finding` / `pentest_add_asset` / `pentest_update_asset` / `pentest_update_task` /
  `pentest_add_coverage` / `pentest_state` / `pentest_gate` / `pentest_graph` / `pentest_report`。资产、覆盖项和任务均带状态门槛。
- **会话投影**（`projection.ts`）：折叠已日志化的 `pentest_*` 调用为 `{ goal, nodes, assets, tasks, coverage, edges, counts, completion, workflow }`，
  镜像 store 的引用拒绝；上限各 200，并支持旧日志回放。
- **Web 标签页**（`src/dsh-client-ui-pentest`）：按会话注册（当前会话或列表祖先链含 `pentest` 预设即显示，
  其他会话隐藏；上游 `redteam` 与专业模式会话不显示，它们有自己的界面）；主标签为「挖洞」，含四个子标签——
  探索链路（@xyflow/react 图，边带关系胶囊：意图链/产出/推导自/证实）、
  漏洞（严重度/描述/可复现步骤/影响资产）、资产（列表/图两种模式）、报告（Markdown 渲染、复制与保存）。
- **协议**（`instructions.ts`）：系统提示词段 `pentest:protocol`（order 50）由 `bughunt` 配置生成，
  强制授权边界、低噪声 WAF 策略和独立复核。红队阶段门禁协议不在本包内，由上游集合提供。
- **Skill 融合**（`src/dsh-pentest/src/clown-skill.ts`）：吸收 `clown-src-6k` 的锁面/自由跳节奏、
  一种子闭环、短表与价值排序、黑盒/白盒双轨、按特征选择知识模块和阶段自检；详细载荷资料不作为盲扫指令注入。
- **能力套件**（`scripts/configure-redteam-suite.mjs`）：以安全白名单部署 `SeaOf0/dsh-redteam-model`
  的专业模式与运行时插件，并保证该预设根里不存在与本包 `pentest` 冲突的同名目录；适配说明见
  [`docs/REDTEAM-MODEL-INTEGRATION.md`](docs/REDTEAM-MODEL-INTEGRATION.md)。

## 已知边界

- **数据库**：安全测试记录写入 `$DSH_HOME/storages/pentest-sessions.db`（sqlite，经 bundle 补丁路由）。
  宿主其它域的存储不受影响（仍为宿主默认 json 后端）。
- **授权**：只测试有授权的目标。`pentest_add_goal` 的 `authorization` 参数可填写授权说明（授权对象 /
  书面许可引用），会写入状态与最终报告留痕；它只是审计事实，不是门禁——扫描/利用动作仍受部署沙箱与
  审批约束。
- **记录按单会话作用域**；同一会话在进程重启、页面重连或“继续”后会依据任务 checkpoint、租约和提交幂等记录续跑。
  重新开始一次 engagement 仍需明确调用新的 `pentest_add_goal`，它会清空当前会话探索图。
- **Web 图为窗口视图**：会话投影各保留最新 200 个节点/资产/边（超出后最旧被逐出，悬挂边同步清理）。
  UI 计数与图反映的是该窗口；完整记录以 `pentest_state` / `pentest_report`（读存储层）为准。
- **图布局为静态分层**（可平移缩放，节点不可拖拽）。
- **运行时要求**：sqlite 后端使用 Node.js `node:sqlite`，宿主运行时需 Node.js >= 22.5。

## 目录结构

```
dsh-pentest/                   # 项目根 = bundle 包 @howmp/dsh-pentest（自带 zod/schemastery 运行时依赖，其余宿主提供）
├── package.json               # bundle manifest：dsh.bundle.patch + dsh.client + exports 子路径
├── cordis.patch.yml           # 补丁层：UI、sqlite 后端与 storage-domain 路由
├── lib/                       # 构建产物（npm pack 的内容）
│   ├── index.js               #   包入口：空 apply
│   ├── pentest.js             #   宿主安全测试插件：pentest_* 工具 + 挖洞协议 + 会话投影
│   ├── preset-root.js          #   注册包内只读挖洞预设目录（兼容 DSH rc.6）
│   ├── storage-sqlite.js      #   安全测试记录专用的 sqlite 后端（node:sqlite）
│   ├── ui-pentest.js          #   Web 插件宿主半：空 apply
│   ├── ui-pentest.client.js   #   Web 插件浏览器半：挖洞视图标签页（4 个子标签，@xyflow/react 内联）
│   └── invariant.js           #   探索图不变量伴生（与官方各包同构，生产环境不加载）
├── src/                       # 源码快照（继续开发/重新构建用）
│   ├── index.ts / invariant.ts
│   ├── dsh-pentest/               # host 包源码：src/ + tests/ + tsconfig + tsdown + README
│   └── dsh-client-ui-pentest/     # client 包源码：src/client/（视图/图布局/注册）+ tests/
├── tests/bundle.spec.ts       # bundle 补丁层测试
├── packages/                  # 三个构建好的子包（仅作构建源保留；bundle 不再依赖它们）
│   ├── dsh-pentest/               # host 插件源码构建产物
│   ├── dsh-client-ui-pentest/     # Web 界面插件源码构建产物
│   └── dsh-storage-sqlite/        # sqlite 后端构建产物（来自 dsh 仓库，无独立源码）
├── preset/bughunt/            # 「挖洞模式」agent 预设（id = bughunt，避免与上游 pentest 冲突）
├── scripts/configure-redteam-suite.mjs # 固定上游版本、安全过滤、profile 事务安装与共存模式部署
├── images/                    # README 界面预览截图
└── README.md
```

## 参考项目

- [ARTEX](https://github.com/Autumn-27/ARTEX)
- [SeaOf0/dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model)（MIT；专业模式、阶段门禁、恢复与证据治理）
