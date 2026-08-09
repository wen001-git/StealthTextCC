> 目的：让任何 AI 工具以最少上下文接手 StealthTextCC。　目标读者：接手维护的 AI 或开发者。　如何阅读：会话开始只读本文；确定任务后再按文件地图读取对应文档。

# AGENTS.md — StealthTextCC 接手索引

## 一句话定位

基于 Electron 的 macOS / Windows 浮层提词器：透明无边框、永远置顶、讲稿滚动、拖动、缩放、镜像和本地保存；默认调用 `BrowserWindow.setContentProtection(true)`，但录屏保护可能被 ScreenCaptureKit 或其他捕获路径绕过，必须逐软件实测。App 名、Bundle ID 与 userData 均独立于另一个 StealthText。

## 运行、测试与构建

```bash
cd /Users/Zhuanz/Claude/StealthTextCC
npm install
npm start
npm test
npm run build:mac:arm64
npm run verify:mac:arm64
```

最新本地 Apple Silicon App 固定为：`dist/mac-arm64/StealthTextCC.app`。

代码、依赖、运行逻辑或构建配置每修改一项，固定执行：相关测试 → 重建 arm64 App → 校验架构/版本/源码/时间 → 实际启动 → 独立 commit → push → 检查 Actions。纯文档修改无需重打包。

## 硬约束

1. `setContentProtection(true)` 与永远置顶默认开启；关闭时 UI 必须明确警告。
2. 不宣称任一录屏软件一定无法捕获；macOS ScreenCaptureKit 和 Windows 其他路径可能绕过。
3. 修改录屏保护实现或升级 Electron 后，必须用目标录屏软件人工验证 5 秒。
4. 无账号、云同步或联网业务；讲稿只在本地 `localStorage`。
5. 保持 `contextIsolation: true`、`nodeIntegration: false`；IPC 只经 preload 最小 API。
6. 透明窗口在 macOS 上保持 `hasShadow: false`。
7. 当前不签名、不公证；首次启动按 Finder「右键 → 打开」，不得建议关闭 quarantine。
8. 不开启 `webSecurity: false` 或 `allowRunningInsecureContent`。
9. `dist/` 必须保持 Git 忽略，不提交构建产物。
10. Mac 保留 arm64 / Intel x64 两个独立包，不改成 Universal App；最低 macOS 12。

## 当前状态（2026-08-09）

- 版本：`0.2.0-beta.1`；Electron 43.3.0，electron-builder 26.15.3，Node.js >= 22.12。
- 自动化：4/4 跨平台测试；本地 arm64 App 可构建、校验并启动。
- macOS：arm64 / Intel x64 两个独立 App 和 ZIP；不签名、不公证。
- Windows：删除 Koffi，统一使用 Electron `setContentProtection()`；生成 x64 ZIP。
- CI：`.github/workflows/build-desktop.yml` 普通 push 构建三个 artifacts，`v*` 标签自动创建 Release。
- 安全边界：录屏保护是尽力而为，不适合密码、密钥或其他高敏感内容。

## 下一步 TODO

- [ ] 确认 main 分支最新 macOS / Windows Actions 均通过且三个 artifacts 齐全。
- [ ] 完成目标 macOS 录屏软件的人工 5 秒验证并记录结果。
- [ ] 推送 `v0.2.0-beta.1`，检查 prerelease 和三个 ZIP。
- [ ] 从 Release 下载 arm64 ZIP，在本机解压、校验并启动。
- [ ] 由朋友在真实 Intel Mac 与 Windows x64 机器验证启动、交互和录屏边界。
- [ ] Win11 跨虚拟桌面可见性留待后续版本。
- [ ] Developer ID 签名、公证、正式图标和安装器留待正式发布。

## 文件地图

| 文件 | 作用 |
|---|---|
| `main.js` | BrowserWindow、菜单、IPC、平台录屏保护 |
| `preload.js` | contextBridge 最小 API |
| `index.html` | UI、编辑/播放/滚动/拖动/缩放/快捷键/持久化 |
| `package.json` | 依赖、三平台打包配置和 npm scripts |
| `scripts/verify-mac-app.mjs` | 本地 Mac App 架构、版本、源码与时间校验 |
| `scripts/run-ci-command.mjs` | 跨平台 CI 命令包装与失败 annotation |
| `tests/screen-protection.test.mjs` | 4 项 Electron 集成测试 |
| `.github/workflows/build-desktop.yml` | 三平台 artifacts 与 tag Release |
| `docs/DISTRIBUTION.md` | 分享、首次打开、签名与 Release |
| `docs/PLATFORM-FEASIBILITY.md` | 平台能力和录屏保护边界 |
| `docs/VERIFICATION.md` | 每轮和发布前验收 |
| `docs/NAMING-CONFLICT.md` | 与另一个 StealthText 的隔离方式 |

## 关键实现备忘

- 拖动使用 pointer 事件与主进程 IPC；缩放由主进程限制最小尺寸并拉回显示器。
- 播放使用 `requestAnimationFrame`，`dt` 上限 0.1 秒，避免切回前台时跳跃。
- 镜像只翻显示；用户输入方向不变。
- macOS 使用 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`。
- 正确 API 是 `setHiddenInMissionControl(true)`，保留 try/catch。
- 本项目不注册系统级全局快捷键。

## 维护规则

- 修改前看 `git status` / `git diff`，保留用户的无关改动。
- 按修改风险运行最小高信号测试；代码/配置仍必须完成本地 arm64 全链路验收。
- 文档开头保留目的/目标读者/如何阅读，结尾保留最新在上的变更记录。
- 只有用户明确要求时 commit/push；远端必须使用 SSH。

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-08-09 | 更新 Electron 43、无 Koffi 的统一保护、三平台 CI、两个独立 Mac 架构包、本地 arm64 强制验收和 beta 发布 TODO；修正录屏保护能力边界 |
| 2026-07-30 | 完整功能版首次实现、4/4 自动化测试和 StealthTextCC 独立命名 |
