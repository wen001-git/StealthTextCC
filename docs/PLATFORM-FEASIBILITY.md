> 目的：记录 StealthTextCC 的三平台能力、技术选型和录屏保护边界。　目标读者：维护者 / 评估技术可行性的人。　如何阅读：先看「结论」，再按平台查看限制；不要把 API 请求等同于绝对防捕获。

# 平台可行性论证

## 结论

Electron 可以可靠提供透明浮层、置顶、滚动和本地讲稿；macOS 与 Windows 也能通过 `BrowserWindow.setContentProtection(true)` 请求系统排除窗口。但它不是跨所有录屏软件的安全保证：Electron 文档明确指出 macOS 上新的 ScreenCaptureKit 捕获仍可能抓到受保护窗口，Windows 也存在其他可绕过路径。

## 能力拆分

| 能力 | macOS | Windows | Linux |
|---|---|---|---|
| 永远置顶 | `setAlwaysOnTop()` | `setAlwaysOnTop()` | 依窗口管理器而定 |
| 跨全屏/空间 | `setVisibleOnAllWorkspaces()` | 本期未实现跨虚拟桌面 | 依桌面环境而定 |
| 录屏保护 | `setContentProtection()` | `setContentProtection()` | Electron 当前不支持 |
| 拖动、缩放、滚动、镜像、本地保存 | 已实现 | 已实现 | 基础能力可运行 |

这些能力彼此独立。Gatekeeper 是否允许 App 启动、App 是否经过代码签名，以及录屏软件是否遵守窗口保护，是三个不同问题。

## macOS 录屏保护

Electron 在 macOS 上通过窗口共享属性实现 `setContentProtection()`。传统捕获路径可能把窗口排除或替换，但 Electron 官方 API 文档同时给出重要警告：使用 ScreenCaptureKit 的新式应用仍可能捕获受保护窗口。

因此只能得出以下结论：

- 保护默认开启，并对一部分系统/应用捕获路径有效。
- 不能笼统宣称 QuickTime、OBS、Zoom、Keynote 或“所有 ScreenCaptureKit 软件”一定看不到。
- 软件版本、选择的捕获源和 macOS 版本都可能影响结果，必须逐个实测。
- `webContents.capturePage()` 能截到本 App 自身并不代表外部录屏保护失效；它只证明 App 自身渲染正常。
- 物理采集卡、摄像头拍屏与其他硬件路径无法阻止。

## Windows 录屏保护

Electron 43 在 Windows 上直接提供 `setContentProtection()`，内部使用 Windows 的显示亲和性机制。本项目不再引入 Koffi，也不再手写 `user32.dll` FFI。

Windows 保护属于尽力而为：常见捕获路径可能遵守 `WDA_EXCLUDEFROMCAPTURE`，但系统截图、直接窗口捕获、注入/Hook、取证软件或硬件采集可能绕过。不能用某一个录屏工具的结果替代所有工具验证。

Windows 11 跨虚拟桌面可见性本期仍未实现；若后续需要，可能要单独使用系统 COM 接口。

## 为什么使用 Electron

| 方案 | UI 复用 | 窗口保护接入 | 代价 |
|---|---|---|---|
| Electron | 直接复用 HTML/CSS/JS | macOS/Windows 均有统一 API | 包体较大 |
| AppKit/Swift | 需重写 UI | 原生能力完整 | 开发成本高 |
| Tauri | 可复用部分 Web UI | 需额外原生桥接 | 维护面更大 |
| Qt | 需重写/适配 | 需平台原生处理 | 不符合当前规模 |

当前 Electron 43.3.0 配合 electron-builder 26.15.3，可由同一提交生成 macOS arm64、macOS Intel x64 和 Windows x64 三个独立 ZIP，符合小范围试用目标。

## 自动化与人工验证边界

自动化可以验证：

- Electron 启动并加载当前页面。
- preload 最小 API、编辑、播放、自动暂停正常。
- App 自身截图正常。
- 讲稿在正常退出后可从 `localStorage` 恢复。
- 本地 App 架构、版本、源码哈希和构建时间正确。

自动化不能证明所有外部录屏软件都无法捕获窗口。每次修改录屏保护实现或升级 Electron 后，必须用目标软件人工录制至少 5 秒并查看回放。

## 已知实现陷阱

1. 正确 API 是 `setHiddenInMissionControl()`，不是 `setHiddenFromMissionControl()`。
2. 透明无边框窗口需要明确交互区域，并在 macOS 禁用阴影以保持圆角。
3. `Page.captureScreenshot` 是 App 自身视角，不能替代外部录屏验证。
4. 强制杀死 Electron 可能让 Chromium 来不及刷新 `localStorage`；测试应通过 App 退出路径关闭。
5. 测试讲稿必须保证存在滚动区，不能依赖不同 runner 的默认字体和窗口布局。

## 官方资料

- [Electron BrowserWindow.setContentProtection](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable)
- [Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Apple NSWindow sharingType](https://developer.apple.com/documentation/appkit/nswindow/sharingtype)
- [Microsoft SetWindowDisplayAffinity](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [Electron BrowserWindow.setVisibleOnAllWorkspaces](https://www.electronjs.org/docs/latest/api/browser-window#winsetvisibleonallworkspacesvisible-options)

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-08-09 | 按 Electron 43 的统一 API 重写三平台边界，删除 Koffi 方案和具体软件必然有效的断言，并补充 ScreenCaptureKit 可能绕过的官方限制 |
| 2026-07-30 | 初版：记录平台选型、窗口 API、自动化边界和实现陷阱 |
