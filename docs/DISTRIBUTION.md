> 目的：说明 StealthTextCC 的本地构建、GitHub 分发、首次打开和未来签名方案。　目标读者：维护者 / 准备把试用版发给朋友的人。　如何阅读：先按接收者架构选择 ZIP，再看对应系统的首次打开说明。

# 分发方案

## 当前选择

本轮发布 `0.2.0-beta.1` 熟人试用版：

- Mac 分成 Apple Silicon arm64 与 Intel x64 两个独立 ZIP，不合并 Universal App。
- Windows 提供 x64 ZIP。
- 三个 ZIP 由同一 Git 提交在 GitHub Actions 构建。
- macOS 最低版本为 12。
- 本轮不做 Developer ID 签名、公证、DMG、正式图标或安装器。
- Windows 与 Intel 版本经朋友真机验证前保持 prerelease。

## 本地 Mac 构建

```bash
npm run build:mac:arm64   # dist/mac-arm64/StealthTextCC.app
npm run build:mac:x64     # dist/mac-x64/StealthTextCC.app
npm run build:mac:all     # 依次生成以上两个 App
```

每次代码、依赖、运行逻辑或构建配置修改后，必须重新执行 arm64 构建和校验：

```bash
npm test
npm run build:mac:arm64
npm run verify:mac:arm64
```

纯文档修改无需重新打包。`dist/` 保持 Git 忽略。

## GitHub Actions 产物

工作流文件：`.github/workflows/build-desktop.yml`。

普通 push 会运行 macOS 与 Windows 两个 job：

1. 安装锁定依赖并运行 4 项自动测试。
2. macOS runner 构建 arm64 ZIP 和 Intel x64 ZIP。
3. Windows runner 构建 Windows x64 ZIP。
4. 上传三个 Actions artifacts。

版本 `0.2.0-beta.1` 的文件名固定为：

```text
StealthTextCC-0.2.0-beta.1-mac-arm64.zip
StealthTextCC-0.2.0-beta.1-mac-x64.zip
StealthTextCC-0.2.0-beta.1-win-x64.zip
```

推送 `v*` 标签时，release job 会下载同一 workflow 的三个 artifacts，创建 GitHub Release 并上传三个 ZIP。带连字符的版本标签（例如 `v0.2.0-beta.1`）会创建 prerelease。

## 发给朋友

### macOS

1. Apple Silicon 用户下载 `mac-arm64.zip`；Intel 用户下载 `mac-x64.zip`。
2. 解压后在 Finder 中右键 `StealthTextCC.app` →「打开」→ 再确认「打开」。
3. 若按钮未出现，去「系统设置 → 隐私与安全性」检查允许打开提示。
4. 打开后用对方实际使用的录屏或会议软件做 5 秒验证。

不要让接收者执行关闭 quarantine 的命令。右键打开保留了 macOS 的明确用户确认流程。

### Windows

1. 下载 `win-x64.zip` 并完整解压。
2. 双击 `StealthTextCC.exe`。
3. 当前版本未签名；只在确认文件来自项目 Release 后处理未知发布者或 SmartScreen 提示。
4. 用实际录屏/共享软件验证窗口是否被排除。

## 三个容易混淆的概念

| 概念 | 解决的问题 | 当前状态 |
|---|---|---|
| Gatekeeper / SmartScreen | 操作系统是否允许未知发布者的 App 启动 | 未签名试用版会提示，按系统 UI 明确确认 |
| 代码签名与公证 | 证明发布者身份并降低启动拦截 | 本轮未做 |
| `setContentProtection()` | 请求系统在屏幕捕获时排除窗口 | 已默认开启，但可能被部分捕获路径绕过 |

签名和公证不会让录屏保护更强；右键打开也不会改变捕获行为。

## 录屏保护限制

- macOS：Electron 文档明确说明，使用 ScreenCaptureKit 的新式捕获软件仍可能抓到受保护窗口。
- Windows：Electron 使用 `WDA_EXCLUDEFROMCAPTURE`，但系统截图、直接窗口捕获或其他技术路径可能绕过。
- 所有平台：物理采集卡、摄像头拍屏等硬件路径无法阻止。
- 因此本 App 不适合展示密码、密钥、账号或其他高敏感内容。

## 未来正式分发

如果要公开发布给陌生用户，应另行完成：

- Apple Developer ID Application 签名、公证与安装镜像。
- Windows 代码签名。
- 正式图标、隐私说明、版本升级策略及更广泛真机兼容测试。

这些事项不在 `0.2.0-beta.1` 范围内。

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-08-09 | 改为三平台 ZIP 与两个独立 Mac 架构包的真实流程；删除 Koffi 和旧 universal 说明；区分系统启动安全策略、签名公证与录屏保护 |
| 2026-07-30 | 初版：记录内部分享、签名公证和 Windows 自动构建方案 |
