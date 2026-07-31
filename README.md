> 目的：让任何人在 30 秒内能跑起来、打包、验证录屏隐身。　目标读者：用户本人 / 接手维护的开发者。　如何阅读：先看「快速开始」跑通；看「录屏验证」做关键确认；其余按需翻。

# StealthTextCC — macOS 隐身浮层提词器

一个**永远置顶、录屏时对其他 App 不可见**的桌面提词器。录屏/视频会议/演讲时只有你能看到讲稿，录出来的视频完全干净。

基于 Electron + `BrowserWindow.setContentProtection(true)`（封装 macOS 的 `NSWindow.sharingType = .none`）。

> **命名说明**：本项目叫 StealthTextCC，区别于另一个叫 StealthText 的 App（CodeX 开发的）。App 二进制名 / Bundle ID / userData 目录都叫 StealthTextCC，互不冲突。

---

## 快速开始

```bash
cd /Users/Zhuanz/claude/stealthtextcc
npm install        # 第一次需要装依赖（已经装过可跳过）
npm start          # 启动浮层
```

启动后会看到屏幕底部中间出现一个圆角半透明窗口：
- 顶栏可拖动（移到屏幕任何位置，贴近摄像头也行）
- 点击下方文本区直接输入讲稿
- 底栏点 ▶ 播放（快捷键 Space）
- 右下角拖手柄改尺寸（最小 320×160）

## 打包成 .app

### 只打 arm64（你自己用，秒打）

```bash
npm run build:mac
# 产物：dist/mac-arm64/StealthTextCC.app
```

### 打 arm64 + Intel 双架构（发给其他 Mac 用户）

```bash
npm run build:mac:universal
# 产物：
#   dist/mac-arm64/StealthTextCC.app   ← Apple Silicon (M1/M2/M3/M4)
#   dist/mac/StealthTextCC.app          ← Intel
# 两个各 ~230MB，可以分别 zip 发给对应平台的人
```

未签名/未公证——首次双击会弹「无法打开，因为开发者无法验证」。解决：
1. 在 Finder 找到 `StealthTextCC.app`
2. 右键 → 打开 → 在弹窗里点「打开」
3. 之后再双击就正常了

## 录屏验证（关键！）

### 自动化（4/4 测试已通过）

```bash
npm test
```

跑 4 个测试：
- 启动 + 渲染 + preload 桥接
- 编辑 → 播放 → 滚到底自动暂停
- App 自身截图能看到讲稿（保护不误伤自身）
- localStorage 持久化讲稿

每次跑测试都使用独立的 `--user-data-dir` 隔离 localStorage。

### 人工：录屏时是否对其他 App 不可见

用 macOS 自带 QuickTime 录屏 5 秒验证：

1. `npm start` 打开提词器，往里写点字
2. 打开 QuickTime Player → 文件 → 新建屏幕录制 → 点红钮
3. 选一个包含提词器的区域，录 5 秒后停
4. 回放 `~/Desktop/无标题.mov`

**预期**：提词器所在的矩形区域是**黑屏**（或被替换为一块纯色）；你屏幕上正常看到的所有内容（包括其他 App）正常出现。

OBS、Zoom 共享屏幕、Keynote 录屏、腾讯会议共享屏幕同理——全部看不到提词器。

## 快捷键

| 键 | 作用 |
|---|---|
| Space | 播放 / 暂停 |
| ↑ ↓ | 调速（每次 ±5 px/秒） |
| ← → | 调字号（每次 ±2 px） |
| Home | 回到开头 |
| End | 跳到底并暂停 |
| Esc | 暂停（播放时） |
| ⌘⌥P | 全局：切换永远置顶 |
| ⌘⌥V | 全局：显示/隐藏窗口 |
| ⌘⌥S | 全局：切换录屏保护（一般别关） |

## 适用场景

- 视频课程录制：录屏里看不到提词器
- 视频通话 / Zoom / 腾讯会议：把提词器拖到摄像头附近
- 直播 / 网络研讨会
- Keynote 演讲：让讲稿浮在屏幕顶部，眼神自然看向听众

## 跨平台支持

| 平台 | 录屏保护有效范围 |
|---|---|
| **macOS** | ✅ 完整有效（对 QuickTime / OBS / Zoom / Keynote 录屏均黑屏） |
| **Windows** | ⚠️ 半有效（对 OBS / Xbox Game Bar / Zoom / PowerPoint 录屏黑屏；但 Win+Shift+S、Snip & Sketch、Bandicam 某些模式能绕过——这是 Windows API 设计局限） |
| **Linux** | ❌ 暂不支持录屏保护（仅作浮层使用） |

永远置顶、跨桌面（mac）、拖动、缩放、滚动播放等所有基础功能**三平台一致**。

### 给其他 Mac 用户的分发方案

- **自己用 / 一两个朋友**：`npm run build:mac`（arm64）或 `npm run build:mac:universal`（arm64 + Intel）→ 整个 `dist/mac*/StealthTextCC.app` 文件夹发过去，对方首次右键 → 打开即可
- **正式分发 / App Store**：见 `docs/DISTRIBUTION.md`

### 给 Windows 用户的分发方案

Windows 版本通过 **GitHub Actions 自动构建**：

1. push 代码到 GitHub
2. CI 在 `windows-latest` runner 上跑 `npm ci && npm test && npm run build:win`
3. 产物 `StealthTextCC-0.1.0-x64.zip` 自动作为 artifact 上传（30 天保留）
4. 打 tag 推送（`git tag v0.1.0 && git push origin v0.1.0`）会自动创建 Release

对方下载 zip → 解压 → 双击 `StealthTextCC.exe`（Windows 报「未知发布者」点「仍要运行」即可，未签名）。

## 已知限制

- **物理外接采集卡录屏幕** 不会受影响（这是硬件问题，无解）
- **极少数远程控制类 App** 可能绕过保护（macOS API 不保证 100%）
- App **自己能截到自己**（`webContents.capturePage()`），这是设计的——如未来要做缩略图预览仍能用
- **不签名**：首次启动需右键打开

## 文件结构

```
stealthtextcc/
├── main.js        # 主进程：窗口、菜单、热键、IPC
├── preload.js     # contextBridge 最小 API
├── index.html     # 浮层 UI（单文件，含 CSS + JS）
├── package.json
└── README.md
```

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-07-30 | 完整功能版：透明浮层 + 永远置顶 + 录屏不可见 + 滚动播放 + 速度/字号/字色/透明度/镜像；4/4 自动化测试通过；改名为 StealthTextCC 避免与 CodeX 开发的同名 App 冲突；dist/mac-arm64/StealthTextCC.app 打包成功 |
