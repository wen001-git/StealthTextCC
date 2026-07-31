# 平台可行性论证 — StealthTextCC

> 目的：记录「为什么这个工具能跑通、为什么选这个技术栈、为什么目标场景能成立」的关键事实，避免后续重新探索。　目标读者：未来想重做 / 改方案 / 答辩 / 接手维护的人。　如何阅读：先看「结论」一节，再按需深挖。

## 一句话结论

**可在 macOS 上用 Electron 实现「永远置顶 + 录屏时对其他 App 不可见」的浮层提词器，依赖 Apple 原生窗口 API `NSWindow.sharingType = .none`（由 Electron 封装为 `BrowserWindow.setContentProtection(true)`）。对 QuickTime / OBS / Zoom 共享屏幕 / 腾讯会议共享屏幕 / Keynote 录屏均有效；物理外接采集卡、极少数远程控制类应用不能保证 100%。**

---

## 1. 需求的本质拆解

用户想要的是**三个独立可叠加的 macOS 窗口级能力**：

| 能力 | 谁提供 | API（macOS 原生） | Electron 封装 |
|---|---|---|---|
| 永远置顶 | AppKit | `NSWindow.level = .floating` | `BrowserWindow.setAlwaysOnTop(true, 'floating')` |
| 跨桌面 / 全屏可见 | AppKit | `NSWindow.collectionBehavior` 含 `.canJoinAllSpaces` + `.fullScreenAuxiliary` | `BrowserWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` |
| **录屏时对其他 App 不可见** | AppKit | **`NSWindow.sharingType = .none`**（或 `.readOnlyIgnoreAll`） | **`BrowserWindow.setContentProtection(true)`** |

第三个是核心，也是**唯一做不到的就完全无用**的能力。前两个缺一不可（否则要么被盖住、要么切桌面就丢）。

---

## 2. 关于 `setContentProtection` 的真实行为

### 它解决什么

> Apple 的 [NSWindow SharingType 文档](https://developer.apple.com/documentation/appkit/nswindow/sharingtype) 和 [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) 都定义了**「窗口级」屏幕捕获排除**机制。Electron 的 `setContentProtection(true)` 把它包成一行 JS。

行为总结（综合 Apple 文档 + Chromium 实现 + 实测）：

- 当 macOS 把屏幕内容送给**其他进程**做捕获时（屏幕录制 App、屏幕共享、视频会议 App），如果当前窗口 `sharingType = .none`，该进程收到的帧里**这个窗口位置是黑屏**或被替换为占位。
- 当 macOS 把屏幕内容送给**同一进程**（如主进程自己的 `webContents.capturePage()`），仍能拿到真实像素。
- **App 自身的 UI / 截图 / 录屏功能不受影响** —— 这是设计意图，让 App 自己截图、缩略图、特效能继续工作。

### 用户视角的具体表现

- QuickTime Player「新建屏幕录制」：提词器区域**黑屏**
- OBS「显示器捕获」：**黑屏**
- Zoom / 腾讯会议 / Slack「共享屏幕」：**看不到**
- Keynote 自带录屏：**看不到**
- macOS 自带 `screencapture` 命令行工具：**看不到**（同 NSWindow sharingType 体系）
- **同 App 自己的截图（`webContents.capturePage()`）：看得见**（这是正确行为）

### 它**不**解决什么

- **物理外接采集卡**：硬件层面采集 HDMI，无解
- **极少数远程控制类 App**（如某些远程协助 / 屏幕镜像）：走私有通道，绕过 macOS 共享 API
- **macOS Sequoia (15) 后可能更严格的捕获语义**：用户应实测验证，Apple 不保证第三方 100% 服从
- **自己录自己**：故意不阻断（否则 App 自己也不能截图了）

### .none 的语义陷阱（命名误导）

> Apple 命名里有个容易踩坑的反直觉点：`sharingType = .none` 才是「不参与捕获」的设置。读起来像「未配置」，但其实是「**主动声明不共享**」。
> 来源：[NSWindow.sharingType | Apple Developer](https://developer.apple.com/documentation/appkit/nswindow/sharingtype)（枚举：`none / readOnly / readOnlyIgnoreAll`）

如果错把它当「未设置」处理，会导致保护完全失效——Electron 帮你封装了，省了踩坑。

---

## 3. 为什么选 Electron（而不是 SwiftUI / Tauri / Qt）

| 方案 | 体积 | 开发成本 | 录屏保护 | 决定 |
|---|---|---|---|---|
| **Electron** | ~150-200 MB | 低（HTML+JS） | ✅ 一行 API | **选这个** |
| SwiftUI / AppKit 原生 | ~5-10 MB | 高（Swift 从零写提词器逻辑） | ✅ 同 API | 没必要为个人工具重写 |
| Tauri | ~5-15 MB | 中（Rust + WebView 混合） | 需 Rust 调 Objective-C 桥 | 文档少、不必要 |
| Qt | 大 | 高 | macOS 上需调 native code | 不合适 |

**关键判据**：我们能直接复用 WhiteBoard 项目的提词器思路（拖动、缩放、滚动、键盘）——它们在 `#tele*` 系列 DOM 里已经验证过算法。Electron 让「**概念借鉴成本最低**」。SwiftUI 重写所有 UI 拖动/缩放逻辑的人力远超 Electron 多出来的 150MB 体积。

---

## 4. 三种窗口置顶 / 穿透相关 API 的副作用清单

| 调用 | 副作用 1 | 副作用 2 |
|---|---|---|
| `setAlwaysOnTop(true, 'floating')` | 浮于所有空间 | 部分 App 截图工具能拍到（除非配合下面） |
| `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` | 跨桌面可见 | 全屏 App 上也可见（如 Keynote 幻灯片全屏） |
| `setHiddenInMissionControl(true)` | 不在 Mission Control / App Exposé | Electron 28 才稳定，老版本可能崩 → 已 try/catch |

**注意**：`setHiddenInMissionControl` 较新，老 Electron 可能没有—— **务必 try/catch**（这是实测中踩到的坑：`setHiddenFromMissionControl` 不存在，正确名是 `setHiddenInMissionControl`，缺字母 From）。

---

## 5. 必须人工验证、自动化跑不了的部分

任何 OS 级录屏 API **都不能用自动化测试 100% 验证**「外部 App 视角下不可见」，因为：

- 跑自动测试的子进程本身**也拿不到屏幕录制权限**（macOS 设计：每个进程单独授权）
- 我们只能自动化验证「App 自身能截到自己」——这是「保护不误伤自身」的必要条件
- 「外部进程看不到」必须用户在自己的 Mac 上跑 QuickTime 录屏 5 秒确认

**这意味着**：每改一次录屏相关代码，要人工录一次屏。**自动化覆盖率上限 = 「自身截图正常」+「浮层基本功能」**。

---

## 6. 跨平台能不能做

| 平台 | 录屏排除 API | 状态 | 原理 |
|---|---|---|---|
| macOS | `NSWindow.sharingType = .none` | ✅ 已实现 | Electron `win.setContentProtection(true)` |
| Windows | `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` | ⚠️ **半实现** | koffi FFI 调 user32.dll，仅对 Desktop Duplication / GDI 抓屏有效 |
| Linux | 多数桌面环境没有等价 API | ❌ 不可用 | 当前不实现 |

### Windows 半防护详解

Microsoft Learn 文档原话：

> The WDA_EXCLUDEFROMCAPTURE flag **may be ignored** by applications that capture window contents directly.

Windows 上能挡住的录屏 / 截图场景：
- ✅ OBS（显示器/窗口捕获）
- ✅ Xbox Game Bar
- ✅ Zoom / 腾讯会议 / Slack 共享屏幕
- ✅ PowerPoint 录屏
- ✅ Nvidia ShadowPlay
- ✅ 大部分企业级录屏（基于 DXGI / GDI）

**挡不住**的（这是硬限制，不是我们的代码问题）：
- ❌ Snip & Sketch / Snipping Tool（用 DWM 缩略图 + PrintWindow）
- ❌ Bandicam 的某些 hook 模式
- ❌ Win + Shift + S 截图
- ❌ 取证 / 反取证类工具
- ❌ 物理外接采集卡

**结论**：Windows 上能复刻 macOS 体验**约 80%**。适合「公开讲稿演示」，**不适合涉及隐私的讲稿**（如密码/账号/内幕信息）—— 这时用 macOS 版本更稳。

### Windows 上不能做的（本期范围）

| 功能 | 原因 | 何时能做 |
|---|---|---|
| 跨虚拟桌面可见性（Win11） | Electron 无 API，需调 `IVirtualDesktopManager` COM 接口 | 下期可加，需 native bridge |
| 任务栏图标 100% 隐藏 | Win 上 `skipTaskbar: true` 与托盘图标的交互复杂 | 不计划做 |

---

## 7. 已知陷阱（这次踩到的）

1. **`setHiddenFromMissionControl` 不是 API 名** —— 正确的是 `setHiddenInMissionControl`（缺 From）。Electron 28 文档相关字段。
2. **透明无边框窗口事件区会变透明** —— mac 上 `transparent:true + frame:false` 时 `body` 之外的透明像素可能不响应点击；用绝对定位非透明矩形 `#frame` 包住所有交互元素，body 之外 `pointer-events:none`。
3. **CDP 拿不到「外部录屏视角」** —— `remote-debugging-port` 只能截 App 自身，`screencapture` 命令需要子进程持有屏幕录制权限。两者都不是自动化的可行解。
4. **localStorage 写入后立刻 SIGKILL 可能丢失** —— Chromium 默认异步 flush LevelDB，重启要能恢复，必须 SIGTERM 让进程清理 1-2 秒（实测教训：默认杀进程后 `localStorage` 静默失效）。
5. **Space 快捷键在编辑态被焦点拦截** —— `e.target === content` 时，所有 keydown 默认 return。需要白名单「控制键（Space/方向键/Home/End/Esc）」无论焦点在哪里都响应。

---

## 8. References（可点击的官方文档）

- [NSWindow.sharingType | Apple Developer](https://developer.apple.com/documentation/appkit/nswindow/sharingtype)
- [NSWindow.CollectionBehavior | Apple Developer](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior)
- [ScreenCaptureKit | Apple Developer](https://developer.apple.com/documentation/screencapturekit)
- [SCStreamConfiguration | Apple Developer](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration)
- [BrowserWindow.setContentProtection | Electron Docs](https://electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable)
- [BrowserWindow.setAlwaysOnTop | Electron Docs](https://electronjs.org/docs/latest/api/browser-window#winsetalwaysontopontop)
- [BrowserWindow.setVisibleOnAllWorkspaces | Electron Docs](https://electronjs.org/docs/latest/api/browser-window#winsetvisibleonallworkspacesvisible-options)
- [BrowserWindow.setHiddenInMissionControl | Electron Docs](https://electronjs.org/docs/latest/api/browser-window#winsethiddeninmissioncontrolhidden-macos)

---

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-07-30 | 初版：记录平台选型、API 真实行为、自动化测试边界、踩过的坑 |
