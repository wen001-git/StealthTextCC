> 目的：让用户和维护者正确运行、打包、分享并验证 StealthTextCC。　目标读者：试用者 / 接手维护的开发者。　如何阅读：首次使用看「安装与打开」；开发者看「本地构建与验收」；分享版本看「GitHub 产物」。

# StealthTextCC

StealthTextCC 是基于 Electron 的 macOS / Windows 浮层提词器，支持永远置顶、讲稿滚动、拖动、缩放、镜像和本地保存，并通过 `BrowserWindow.setContentProtection(true)` 尝试减少窗口被录屏或共享屏幕捕获。

> 录屏保护不是保密机制。Electron 明确提示：macOS 上采用 ScreenCaptureKit 的新式捕获仍可能抓到受保护窗口；Windows 的其他捕获路径也可能绕过。分享或演示前必须用实际录屏软件验证，不要输入密码、密钥等敏感信息。

## 快速开始

需要 Node.js 22.12 或更高版本。

```bash
cd /Users/Zhuanz/Claude/StealthTextCC
npm install
npm start
```

常用操作：

- Space：播放 / 暂停
- ↑ / ↓：调整滚动速度
- ← / →：调整字号
- Home：回到开头
- End：跳到底部并暂停
- Esc：暂停

本项目没有注册系统级全局快捷键，避免与其他应用冲突。

## 本地构建与验收

每次修改代码、依赖、运行逻辑或构建配置后执行：

```bash
npm test
npm run build:mac:arm64
npm run verify:mac:arm64
```

本机始终保留最新可用 App：

```text
dist/mac-arm64/StealthTextCC.app
```

`verify:mac:arm64` 会确认 App 是纯 arm64、版本与当前 `package.json` 一致、`app.asar` 中的 `main.js` 与当前源码哈希一致，且产物修改时间属于本轮构建。之后还要实际启动 App，检查窗口和主要交互。

Intel 及双架构独立构建：

```bash
npm run build:mac:x64       # dist/mac-x64/StealthTextCC.app
npm run build:mac:all       # 依次生成 arm64 和 x64 两个 App
```

这里的“双架构”是两个独立 App，不是单个 Universal App。最低系统版本为 macOS 12。

## 发布 ZIP

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:win:x64        # 应在 Windows 或 GitHub Actions 运行
```

版本 `0.2.0-beta.1` 的文件名为：

```text
StealthTextCC-0.2.0-beta.1-mac-arm64.zip
StealthTextCC-0.2.0-beta.1-mac-x64.zip
StealthTextCC-0.2.0-beta.1-win-x64.zip
```

普通 push 会由 GitHub Actions 构建并保存以上三个 artifacts；推送 `v*` 标签会创建 GitHub Release，并上传同一提交生成的三个 ZIP。

## 安装与打开

### macOS

当前版本未使用 Developer ID 签名，也未公证。首次打开时：

1. 解压对应架构的 ZIP。
2. 在 Finder 中右键 `StealthTextCC.app`，选择「打开」。
3. 再在系统弹窗中选择「打开」。
4. 如果没有该按钮，前往「系统设置 → 隐私与安全性」，确认允许打开。

这是 Gatekeeper 对未签名下载软件的提示，与“录屏保护是否有效”是两回事。右键打开只是允许 App 启动，不会增强录屏保护。

### Windows

解压 ZIP 后双击 `StealthTextCC.exe`。当前版本没有代码签名；若 Windows 显示未知发布者或 SmartScreen 提示，只应在确认文件来自本项目 Release 后选择继续。

## 录屏保护验证

自动测试覆盖启动、播放、App 自身截图和本地讲稿持久化，但无法证明第三方录屏软件看不到窗口。

至少用你实际要使用的软件录制 5 秒：画面包含 StealthTextCC 和另一个普通窗口，回放后确认 StealthTextCC 是否被排除。不同软件、版本、捕获源可能得出不同结果；不要根据 QuickTime 的结果推断 OBS、会议软件或 ScreenCaptureKit 软件也一定相同。

## 三个平台的边界

| 平台 | 当前实现 | 重要限制 |
|---|---|---|
| macOS | Electron `setContentProtection()` + 跨空间置顶 | ScreenCaptureKit 捕获可能绕过；必须逐软件实测 |
| Windows | Electron `setContentProtection()` | 系统截图、直接窗口捕获等路径可能绕过；跨虚拟桌面未实现 |
| Linux | 普通浮层 | 当前不提供录屏保护 |

物理采集卡、摄像头拍屏和其他硬件级采集不受窗口 API 保护。

## 安全与隐私

- 无账号、无云同步、无联网业务；讲稿保存在本机 `localStorage`。
- 渲染进程启用 `contextIsolation`，不启用 `nodeIntegration`。
- 录屏保护可关闭；关闭时界面会明确警告。
- `dist/` 被 Git 忽略，本地约 200 MB 的 App 不提交进仓库。

更多资料：`docs/DISTRIBUTION.md`、`docs/VERIFICATION.md`、`docs/PLATFORM-FEASIBILITY.md`。

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-08-09 | 更新 Electron 43 三平台构建、两个独立 Mac 架构包、GitHub artifacts/Release 与本地 arm64 强制验收；区分 Gatekeeper、签名/公证和录屏保护，并补充 ScreenCaptureKit 限制 |
| 2026-07-30 | 完整功能版首次实现并完成 4/4 自动化测试；改名为 StealthTextCC 以避免与另一 App 冲突 |
