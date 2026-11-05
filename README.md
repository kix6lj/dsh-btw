# BTW · DeepSeek Harness 旁问插件

> Ask a side question about the current DeepSeek Harness session — **no tools, no interruption, no context pollution**, with a searchable history page.

基于当前会话上下文的旁支提问：不调用工具、不打断会话、回答不进入主对话，并在独立页面里回看历史。

灵感来自 Claude Code 的 `/btw`，补上了 Web 端缺少的两件事：流式悬浮窗，以及可检索、可回看的历史页面。

## 特性

- **旁路回答**：直接调用模型的流式 API，不走 Agent loop、不注册工具、不写入任何 session event。
- **悬浮窗**：输入框左侧按钮 / `/btw` / `/btw 问题` 打开；流式 Markdown、折叠推理、随时停止、复制。
- **历史页面**：按会话隔离，列表 + 详情、搜索、会话切换、再次提问、删除/清空。
- **上下文可控**：只取已提交的会话文本与截断后的工具结果，默认跳过系统提示；预算可配。
- **不设输出上限**：由 provider/模型决定回答长度；如果仍以 `max-tokens` 结束，会明确标记「已截断」。
- **本地存储**：历史保存在 `$DSH_HOME/storages/btw`，不上传任何遥测或第三方服务。

## 安装（其他 Harness）

### 要求

- DeepSeek Harness Web profile，且 Plugin Manager 可用。
- 已在 DSH `0.2.0-rc.2`（Node 24）验证；其他版本如 API 有变动可能不兼容。

### 步骤

1. 克隆仓库到任意目录（不要放进 DSH profile 目录）：

   ```bash
   git clone git@github.com:kix6lj/dsh-btw.git
   # 或 https://github.com/kix6lj/dsh-btw.git
   ```

2. 在 DSH 会话里让 agent 用 Plugin Manager 安装这个**目录**（传绝对路径）：

   ```
   plugin_manager action=install_bundle target=/absolute/path/to/dsh-btw
   ```

   安装会注册 bundle、插入 Loader 行 `dsh-plugin-btw` 并启用。

3. 刷新 Harness 页面。若 Host 半没有激活（例如安装时页面未打开），重启一次 DSH。

### 升级 / 卸载

- 升级：`git pull` 后重新安装该目录；Host 代码通常需要重启 DSH 才会生效，Client 代码刷新页面即可。
- 卸载：`plugin_manager action=remove_bundle target=@local/dsh-plugin-btw`，然后按需删除 `$DSH_HOME/storages/btw`。

> 包名 `@local/dsh-plugin-btw` 是当前 Loader 身份，未发布到 npm；请以目录方式安装。

## 使用

| 入口 | 行为 |
|---|---|
| 输入框左侧 `BTW` 按钮 | 打开当前会话的悬浮窗 |
| `/btw`（裸命令） | 同上；纯客户端动作，不写任何 session event |
| `/btw 问题` | 直接把问题送进悬浮窗并开始流式回答 |
| 左侧栏 `BTW` 图标 | 打开历史页面 |

### `/btw 问题` 的日志行为

DSH 的客户端 slash 命令只支持裸调用，带参数必须由 Host 命令接管。因此带参数时会在会话日志里留下 `command/run` + `command/done` 两条 **log-only** 事件：

- `command/run` 不记录输入；
- `command/done` 记录一次问题文本；
- 回答、提示词、token 均不写入 session，也不进入模型上下文。

裸 `/btw` 与按钮路径零日志。聊天里这条命令记录由本插件注册的 `commandview` 渲染为空。

## 悬浮窗

- 流式 Markdown：标题、列表、表格、代码块（带复制）、行内代码、粗斜体、链接、引用。
- 推理过程折叠展示；可随时停止。
- 底部显示模型、耗时、输入/输出 token、上下文规模与历史条数。
- `⌘/Ctrl + Enter` 发送，`Esc` 关闭；关闭/停止会把已生成的部分以 `stopped` 落盘。
- 窄屏自动变底部抽屉。

## 历史页面

- 左侧列表：问题、时间、状态、模型、回答长度；搜索框按问题与回答预览过滤。
- 右侧详情：完整问题、元信息、完整 Markdown 回答、复制回答 / 复制 Q&A / 再次提问 / 删除。
- 顶栏可切换「有历史的会话」，可清空本会话；窄屏为列表⇄详情。
- 会话标题来自 DSH 的会话列表，记录本身按 `sessionId` 存放。

## 上下文口径

从 `session.deriveMessages()` 提取当前会话已提交的消息：

```text
[environment] cwd: /path/to/work
[user] ...
[assistant] ...
[tool result: read] ...（单条截断，保留头尾）
[assistant] ...
```

- 默认包含主 agent 的 **system prompt** 与 **developer 消息**（`includeSystemPrompt`、`includeDeveloper`），它们作为只读上下文标注为 `[system]` / `[developer]`，不是给旁问模型的指令。
- 默认**不设字符预算、不截断工具结果**：完整发送 `deriveMessages()` 的全部消息。只有显式把 `contextChars` / `toolResultChars` 设为正数才会裁剪；即使设了预算，**所有 user 消息与 system prompt 永远保留**，只在中间省略较早的工具/助手内容并标注「较早的部分内容已省略」。
- 完整上下文 = 主模型当前可见的派生消息（含 system/developer）；如果主会话发生过压缩，这里反映的是压缩后的视图，而不是原始日志全量。
- 图片/附件只留占位符；推理块不进入上下文。
- 当前 turn 尚未落盘的流式文本不在上下文内。
- 请求形态：`system` = BTW 规则 + `<session_transcript>`；`messages` = 单条用户问题；**不传 `tools`**，从机制上禁止工具调用。
- **不传 `maxTokens`**：插件不设置输出上限。若 provider 自身以 `max-tokens` 结束，条目会记录 `finish` / `truncated`，UI 显示「已截断」而不是假装完整。

## 模型

默认跟随当前会话模型（`session.requestContext()`），没有则用 Host 的默认模型。`provider` / `model` 配置可覆盖；`reasoningEffort` 默认留空，用 provider 默认值而不是继承主会话的 `max`，保证旁问足够快。

## 存储与隐私

```text
$DSH_HOME/storages/btw/sessions/<sessionId>.json
```

- 每个会话一个 JSON，原子写入（tmp + rename），写操作按会话串行。
- 每会话上限 200 条（`maxEntries`），超出丢最早。
- 没有 `$DSH_HOME` 时回退到 `~/.dsh`；`storeDir` 可覆盖根目录。
- 不写入 session 日志、不修改任何会话文件。
- **不上传遥测**。唯一的网络请求是这次旁问本身：问题 + 截断后的会话 transcript 会发送给 DSH 当前配置的模型 provider，与主会话使用同一凭据与链路。
- 历史只存在本机；删除/清空只影响本插件自己的数据。

## 配置

在 profile 的 `cordis.patch.yml` 里按行 id `dsh-plugin-btw` 覆盖。注意：同 id 的覆盖会替换**整份** config，未列出的字段会回到默认值。

```yaml
- id: dsh-plugin-btw
  name: "@local/dsh-plugin-btw"
  config:
    provider: ''
    model: ''
    reasoningEffort: ''
    contextChars: 0
    toolResultChars: 0
    includeSystemPrompt: true
    includeDeveloper: true
    storeReasoning: true
    maxEntries: 200
    questionMaxChars: 4000
    timeoutMs: 120000
    storeDir: ''
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `provider` / `model` | `''` | 空 = 跟随当前会话 |
| `reasoningEffort` | `''` | 空 = provider 默认 |
| `contextChars` | `0` | `0` = 完整上下文；正数 = 软预算（user 消息与 system prompt 始终保留） |
| `toolResultChars` | `0` | `0` = 工具结果不截断；正数 = 单条上限 |
| `includeSystemPrompt` | `true` | 是否把主系统提示带进 transcript |
| `includeDeveloper` | `true` | 是否带 developer 消息 |
| `storeReasoning` | `true` | 是否持久化推理过程 |
| `maxEntries` | `200` | 每会话历史上限 |
| `questionMaxChars` | `4000` | 问题长度上限 |
| `timeoutMs` | `120000` | 单次旁问超时 |
| `storeDir` | `''` | 空 = `$DSH_HOME/storages/btw` |

## HTTP 接口

全部经 `ctx.connection.fetch` 注册，复用浏览器会话与 Host/Origin 校验：

| 路由 | 说明 |
|---|---|
| `POST /api/btw.ask` | SSE：`start` / `reasoning` / `delta` / `usage` / `done` / `error` |
| `GET /api/btw.list?sessionId=` | 列表摘要 |
| `GET /api/btw.entry?sessionId=&id=` | 单条详情 |
| `POST /api/btw.delete` | 删除一条 |
| `POST /api/btw.clear` | 清空本会话 |
| `GET /api/btw.sessions` | 有历史的会话与数量 |
| `GET /api/btw.meta` | 生效配置 |

同一会话同时只允许一个进行中的旁问；客户端断开/关闭会中止模型调用，并把已生成内容存为 `stopped`。

## 开发与测试

```bash
node --check index.mjs && node --check client.js
node test/host.test.mjs     # 假 ctx：transcript、SSE、存储、并发、截断、迁移
node test/client.test.mjs   # 假浏览器：工厂、slot 注册、SSE 分片、渲染树、/btw 事件
```

目录结构：

```text
index.mjs           Host：transcript、模型调用、SSE、存储、命令
client.js           Client：悬浮窗、历史页、/btw、Markdown、样式
cordis.patch.yml    bundle 默认配置
locale/             Plugin Manager 显示文案
test/               无浏览器自测
```

## 兼容性与已知限制

- 需要 DSH Web profile；Client 半依赖 `slots` / `locale` / `layout` / `commandUi`。
- 当前 turn 未落盘的部分不在上下文内。
- 默认发送完整上下文，长会话的输入 token 会显著增加；需要控制成本时把 `contextChars` 设为正数（用户消息仍会保留）。
- 旁问会额外消耗一次模型调用，并与主会话共享 provider 限流；默认完整上下文会放大这部分输入成本。
- 插件不设置输出上限；若 provider 自身仍截断，历史页会明确标记「已截断」。
- 带参数的 `/btw 问题` 会在 session 日志留下两条 log-only 事件（见上文）。
- 历史上限按会话计；清空/删除只影响本插件自己的数据。
- 替换已安装版本后，浏览器端新代码通常需要刷新页面；Host 代码变化需要重启 DSH。
