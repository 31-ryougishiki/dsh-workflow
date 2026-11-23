# DSH Workflow Builder · 流程编排

把反复使用的 **环境信息、模型配置、任务配置** 保存下来，按需组合成完整 Prompt，一次性交给 DSH 执行。

例如：选择「GPU 服务器 A」+「模型 B 的推理参数」+「吞吐与延迟测试」，只改这次的并发数和输出目录，点击 **交给 DSH 执行**。DSH 会拿到整套上下文，利用当前会话已有的工具和权限连接服务器、规划任务、执行并报告结果。

## 功能

- 默认三段式起点：环境信息 → 模型配置 → 任务配置；也能添加任意步骤。
- 每个步骤可以保存多个独立命名的预设。例如在「环境信息」中切换「服务器 A」和「服务器 B」，在「模型配置」中选择精度参数。
- 展开步骤即可选择该步骤的预设，修改内容后可以只用于本次流程，也可以另存一个预设或更新所选预设。
- 步骤复制、上移、下移、删除；整套流程保存、打开、另存副本、删除。
- Prompt 的每个步骤只包含步骤标题和正文。旧版单独填写的补充内容仍可在编辑器中查阅，如需发送可将其复制到正文。
- 完整 Prompt 预览；一次提交到打开面板时所在的 DSH 会话。
- 配置存在本机文件中，跨浏览器可用；原子替换、上一版备份、保存版本冲突检查。

这是 **Prompt 配置与组合插件**。配置段的顺序用于组织上下文，由 DSH 阅读全部配置后执行任务；它不是逐节点强制调度或自动重试引擎。模型配置描述任务使用的模型，不切换 DSH 自身的模型。

## 安装

适配 DSH Web **0.2.2-rc.1**，Node.js 22.19+。使用 DSH 的 client module factory、`conversation.input.dock` 槽位和会话提交接口；这些接口可能随 DSH 预发行版变化。

### 本地源码安装（推荐）

```powershell
git clone https://github.com/31-ryougishiki/dsh-workflow.git
cd dsh-workflow
npm ci
npm run build
npm test
npm run install:local
```

安装脚本只在现有 `~/.dsh/profiles/web/node_modules/dsh-workflow-builder` 建立本地目录链接，并备份、追加 `cordis.patch.yml`。不安装或升级 profile 内其他依赖。DSH 启用 HMR 时会自动加载；刷新页面，仍无入口时重启 DSH。安装后请保留源码目录，链接依赖其实际位置。

其他 profile 可指定目录（路径可包含空格或中文）：

```powershell
node scripts/install.js --profile-dir "C:\path with spaces\profile"
```

也可通过 DSH 的插件管理安装本地包：

```powershell
dsh plugin --profile web add "link:C:/path/to/dsh-workflow"
```

本地安装脚本的 patch 与 DSH bundle 安装 **二选一**，不要重复挂载。同一包从本地脚本切换为 bundle 时，先移除 `cordis.patch.yml` 中 `id: workflow-builder` 的 insert 段。如果 pnpm 报 `ERR_PNPM_UNEXPECTED_STORE`，可使用上面的 `npm run install:local`，无需重装整个 DSH profile。

### 开始使用

1. 在 DSH 选择或新建一个会话，选好工作目录、模型和权限。
2. 点击输入区域的 **流程编排**。
3. 在「环境信息」填写第一台服务器的信息，在 **预设名称** 填「服务器 A」，点击 **另存为新预设**。修改服务器信息，把预设名称改为「服务器 B」，再次另存。
4. 以后展开「环境信息」，在 **此步骤的预设** 中切换 A 或 B。模型和任务也可以分别保存多组预设。点击 **保存流程** 会记住各步骤的选择和本次修改。
5. 点击 **预览** 核对完整内容，再点 **交给 DSH 执行**。
6. 收起面板，在 DSH 会话查看执行进度、授权请求和结果。

如果会话已有任务，流程通过 DSH 的正常队列追加。按钮显示已接收仅代表 DSH 接收了整套 Prompt，不代表服务器任务已经完成。收起面板不停止执行；“停止等待”只取消插件等待，远端已接受的请求和服务器已执行的操作不会因此撤销。停止执行请使用 DSH 会话里的停止功能。

编辑草稿在面板收起时保留，但刷新页面、切换导致组件卸载或退出 DSH 前应保存流程。配置保存失败会显示错误，草稿仍在；遇到版本冲突请刷新配置库后重试，刷新配置库不替换当前草稿。更新模板后，已有流程里的副本保留旧内容，需要时重新选择模板。

## 推荐填写方式

| 配置段 | 内容示例 |
| --- | --- |
| 环境信息 | SSH 主机别名、远端工作目录、Conda 环境、GPU 数量、驱动 / CUDA、数据路径、现有凭据引用 |
| 模型配置 | 模型名称或路径、版本、训练 / 推理框架、精度、并行方式、批大小、上下文长度、启动参数 |
| 任务配置 | 目标、数据集、具体操作、参数组合、输出目录、验收指标、资源和时间限制 |

环境配置填写现有 SSH 别名或凭据引用。配置库是普通本机 JSON，不存放明文密码、私钥或 API Key。插件不建立额外 SSH 通道、不读取凭据，不提升 DSH 权限；服务器执行能力来自 DSH 当前会话已有的工具和授权。

## 数据和卸载

升级后，旧模板会按原步骤名称归组，已关联模板的旧流程沿用该模板所在的组。旧版没有独立预设名，因此最初显示旧模板的名称，可修改预设名称并点击 **更新所选预设**。新建自定义步骤各自拥有独立的预设库。从左侧 **可复用步骤** 添加同一个步骤，或复制流程内的步骤，可以继续使用它已有的预设。

默认数据目录：

```text
~/.dsh/workflow-builder/library.json
~/.dsh/workflow-builder/library.json.bak
```

所有 profile 默认共享这一份配置库。要隔离某个 profile，可在它的插件 entry 下配置 `config.dataDir` 为独立目录。每类最多 100 条配置，每个流程最多 32 段；单段内容字段最多 12000 字，流程总内容约 55000 字。超过限制会明确拒绝，避免静默截断。

主文件损坏时读取上一份备份并提示；两份都不可用时拒绝覆盖。跨窗口以 revision 检查冲突，跨进程通过独占 `.lock` 防止并发覆盖。如果进程异常退出留下 `.lock`，应先关闭所有使用该目录的 DSH 进程，再移除残留锁文件。备份完整数据时保存整个数据目录。

卸载本地安装版：移除 profile patch 中的 `workflow-builder` insert 段，并移除对应的 `node_modules/dsh-workflow-builder` **目录链接本身**；不删除源码目录和用户数据。通过 DSH bundle 安装的版本可使用 `dsh plugin --profile web remove dsh-workflow-builder`。

## 开发与验证

```powershell
npm ci
npm run build
npm test
npm run preview
npm pack
```

`npm run preview` 启动随机 loopback 端口的隔离界面，配置只在浏览器内存中，提交使用假会话，不访问真实账号或服务器。`npm test` 使用 Node 内建测试器、假 DSH 会话和 JSDOM；`artifacts/` 存放被忽略的测试数据。提交前运行构建，以保持 `lib/client.js` 与源码一致。

| 目录 | 内容 |
| --- | --- |
| `src/client.js`、`src/style.js` | 编辑器与界面样式 |
| `lib/model.js` | 配置校验、模板副本和完整 Prompt 组装 |
| `lib/store.js`、`lib/index.js` | 本机配置库、DSH 已鉴权的 owner-only Fetch 路由 |
| `lib/submit.js` | 整套流程提交、取消检查与会话引用释放 |
| `lib/client.js` | 构建后的 DSH 客户端 factory |
| `test/` | 配置、持久化、边界、取消、安装和前端交互回归 |

已经验证本机 DSH 0.2.2-rc.1 能发现客户端包、加载配置库路由；离线测试覆盖整套提交、失败不重试、取消后不发送、配置复用、保存重载及备份恢复。没有在真实服务器执行训练或基准任务，离线通过不代表某台服务器、模型或 SSH 配置可用。

接口参考：[DSH 槽位文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/slots.md)。实现以安装版本的类型声明和接口为准。
