# AGENTS.md — StealthText 接手索引

> 目的：让任何 AI 工具以最少上下文接手 StealthTextCC。　目标读者：接手维护的 AI 或开发者。　如何阅读：会话开始只读本文；确定任务后再读对应文件。

## 一句话定位

基于 Electron 的 macOS 隐身浮层提词器：透明圆角无边框窗口，永远置顶，调用 `BrowserWindow.setContentProtection(true)` 让录屏/共享屏幕时对其他 App 不可见。讲稿滚动播放、可拖动、可缩放、字号/速度/字色可调。**App 名 StealthTextCC（区别于 CodeX 开发的 StealthText）**——二进制名、Bundle ID、userData 目录都独立。

## 运行与测试

```bash
cd /Users/Zhuanz/claude/stealthtextcc
npm install                    # 第一次
npm start                      # 启动浮层（开发用）
npm run build:mac              # 打包成 dist/mac-arm64/StealthText.app
```

录屏可见性是**核心功能**，每改一次必须验证：用 QuickTime Player 新建屏幕录制 5 秒，回放确认提词器区域是黑屏。

## 硬约束

1. **macOS only**。`setContentProtection` / `setVisibleOnAllWorkspaces` / `setHiddenFromMissionControl` 都是 macOS 专属 API；其他平台只能跑「普通浮层」功能，不能隐身。
2. **`setContentProtection(true)` 永远默认开**。关闭时必须在菜单上明确标红警示（目前菜单是「录屏时不可见（核心功能）」勾选项，去勾会让录屏拍到讲稿）。
3. **永远置顶默认开**。同理，关闭要明显提示。
4. **不做账号、不做云同步、不做联网**。讲稿只在本地 `localStorage`。
5. **必须 contextIsolation + 无 nodeIntegration**。所有 IPC 走 preload 暴露的最小 API。
6. **透明窗口在 mac 上 `hasShadow: false`**；否则阴影会破坏圆角视觉效果。
7. **不签名、不公证**。用户首次启动走「右键 → 打开」。一旦签名流程变了，文档必须同步更新。
8. **不要给渲染进程开 `webSecurity: false` / `allowRunningInsecureContent` 等放宽**。
9. **修改 UI 后必须 npm start 真机验证一次**：窗口弹出、置顶、拖动、缩放、Space 播放/暂停、↑↓ 调速、字号滑块、字色选择、设置抽屉、镜像翻转——逐项过。

## 当前状态（2026-07-31）

- mac 版：4/4 自动化测试通过；已打 universal 双架构（arm64 227MB + x64 241MB）；改名 StealthTextCC 避免与 CodeX 开发的 StealthText 冲突
- Win 版：通过 koffi 调 `user32!SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` 实现**半防护**（OBS/Game Bar/Zoom 有效；Snip & Sketch 等 PrintWindow 类截图无法防）
  - 用 GitHub Actions `windows-latest` runner 自动构建 + 上传 artifact + Release
- 跨平台通用：UI / IPC / 拖动 / 缩放 / 滚动三平台 100% 一致

## 下一步 TODO

- [ ] GitHub 上 init repo + push + 触发 Actions 看 Windows build 跑通
- [ ] 用户在真实 Windows 机器上验证 WDA 对不同录屏工具的有效性
- [ ] Win11 跨虚拟桌面可见性（v2 期，需 COM 桥）
- [ ] 加 dmg 打包 + 苹果签名（先不做）

## 文件地图

| 文件 | 作用 |
|---|---|
| `main.js` | 主进程：BrowserWindow、菜单、IPC、globalShortcut |
| `preload.js` | contextBridge 暴露 7 个 API（moveBy / resizeBy / toggleAlwaysOnTop / getAlwaysOnTop / onAlwaysOnTopChanged / center / quit） |
| `index.html` | 渲染进程：UI + 编辑/播放/滚动/拖动/缩放/快捷键/持久化 |
| `package.json` | 依赖 + electron-builder 配置 + npm scripts（start / test / build:mac） |
| `tests/screen-protection.test.mjs` | 自动化验收 4 个测试（启动、播放、自身截图、localStorage 持久化） |
| `README.md` | 用户向：跑通 + 录屏验证 + 打包 |
| `docs/PLATFORM-FEASIBILITY.md` | macOS / Windows / Linux 录屏保护原理 + Electron 选型论证 |
| `docs/NAMING-CONFLICT.md` | 与 CodeX 同名 App 的 7 层冲突处理 |
| `docs/DISTRIBUTION.md` | 分发方案对比（未签名 / universal / 签名 + 公证 / GitHub Actions Win）|
| `docs/VERIFICATION.md` | 已通过的自动化测试 + 仍需人工跑的清单 |
| `.github/workflows/build-windows.yml` | Windows 自动打包配置（windows-latest runner） |

## 任务路由（按需读 docs）

| 想搞清楚的问题 | 读 |
|---|---|
| 这个工具为什么选 Electron / 为什么在 macOS 上能跑 | `docs/PLATFORM-FEASIBILITY.md` |
| 跟系统已有同名 App 怎么不撞 | `docs/NAMING-CONFLICT.md` |
| 怎么发给别人用 | `docs/DISTRIBUTION.md` |
| 改代码后该跑哪些测试、还要做什么人工验证 | `docs/VERIFICATION.md` |

## 关键实现备忘

- 拖动用 `pointerdown/move/up` + `setPointerCapture`，比 `-webkit-app-region: drag` 灵活：可避免按钮误触发、可加边界 clamp。
- 缩放走 IPC：渲染进程算出 dx/dy，让主进程改 `BrowserWindow.setSize()`，主进程负责 clamp（`Math.max(320, ...)`, `Math.max(160, ...)`）和「拉回显示器内」。
- 播放滚动用 `requestAnimationFrame`，`dt` 上限 0.1 秒——切后台回来不会跳一大段。
- 镜像翻转用 `transform: scaleX(-1)`，**只翻显示、不翻选区**。用户输入方向不变。
- `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` 是「全屏 App 上也浮」的关键。
- `setHiddenInMissionControl(true)`（注意是 `In` 不是 `From`）— 不在 Mission Control 出现。Electron 28 支持，旧版可能没；包 try/catch。

## 维护规则

- 修改前先 `git diff --stat` 确认范围。
- 改 UI/UX 后必跑 `npm test`，且人工跑 QuickTime 录屏验证。
- 文档开头保留「目的/目标读者/如何阅读」；结尾保留变更记录表。
- 只有用户明确要求时才 commit/push；GitHub remote 必须用 SSH。

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-07-30 | 完整功能版首次实现 + 4/4 自动化测试通过；改名为 StealthTextCC 避免与 CodeX 开发的同名 App 冲突（产品名、appId、运行时 setName、userData 路径全改） + dist/mac-arm64/StealthTextCC.app 打包成功 |
