> 目的：定义每轮修改、CI 和发布前必须通过的验收。　目标读者：维护者 / 发布试用版的人。　如何阅读：先根据修改类型选择流程；任一强制项失败时停止提交和推送。

# 验证清单

## 修改类型与强制流程

代码、依赖、运行逻辑或构建配置修改：

```text
修改一项
→ npm test
→ npm run build:mac:arm64
→ npm run verify:mac:arm64
→ 启动打包后的 App
→ 独立 commit
→ push
→ 检查 GitHub Actions
```

纯文档修改只需检查目标 diff 和 `git diff --check`；如果同时包含代码或配置修改，仍执行完整流程。

## 自动化测试

```bash
npm test
```

| 测试 | 覆盖 |
|---|---|
| 启动 + 渲染 + preload 桥接 | Electron 启动、页面标题、隔离的 preload API |
| 编辑 → 播放 → 滚到底自动暂停 | 保证可滚动内容、播放状态、真实循环到末尾后暂停 |
| App 自身截图 | 渲染内容不被保护逻辑误伤 |
| `localStorage` 持久化 | 写入、通过 App 正常退出、重启后读回 |

测试使用独立临时 user-data 目录和调试端口；失败输出会在 CI annotation 中保留 Electron 日志。

## 本地 arm64 App 强制验收

```bash
npm run build:mac:arm64
npm run verify:mac:arm64
```

预期产物：`dist/mac-arm64/StealthTextCC.app`。

校验脚本必须确认：

- App 修改时间属于当前轮次。
- `Contents/MacOS/StealthTextCC` 是纯 arm64。
- `Info.plist` / App 版本等于当前 `package.json`。
- `app.asar` 内 `main.js` 的 SHA-256 等于当前源码。

随后实际启动打包后的 App，至少检查：

- 窗口正常显示，页面来自 App 内 `app.asar/index.html`。
- 置顶、拖动、缩放、播放/暂停和自动滚动。
- 设置抽屉、字号/速度/字色、镜像。
- 关闭后重启能读取本地讲稿。

任一项失败，不提交、不推送；修复后从测试重新开始。

## 录屏保护人工验证

自动化不能证明外部录屏软件一定看不到窗口。修改 `setContentProtection()` 相关代码或升级 Electron 后：

1. 启动本轮打包的 arm64 App。
2. 输入明显的测试文字。
3. 用目标录屏/会议软件选定实际会用的捕获源。
4. 同时录到 StealthTextCC 和一个普通窗口至少 5 秒。
5. 回放确认 StealthTextCC 是否被排除，记录软件版本、macOS 版本和捕获源。

QuickTime、OBS、会议软件、浏览器录屏插件应分别验证，不能互相推断。ScreenCaptureKit 软件可能仍能捕获受保护窗口；若能看到，属于已知技术边界，不得继续宣称该组合受保护。

## GitHub Actions 验收

普通 push 应有两个构建 job 全绿，并产生：

```text
StealthTextCC-<version>-mac-arm64.zip
StealthTextCC-<version>-mac-x64.zip
StealthTextCC-<version>-win-x64.zip
```

`v*` 标签还应成功创建 Release并上传同名三个 ZIP。三个文件必须来自同一 commit。

## 发布前清单

- [ ] `npm test` 4/4 通过
- [ ] `npm audit` 无 high / critical
- [ ] 本地 arm64 App 重新生成并通过脚本校验
- [ ] 本地 App 实际启动及主要交互通过
- [ ] 目标录屏软件完成 5 秒人工验证
- [ ] main 分支 Actions 两个 job 全绿、三个 artifacts 齐全
- [ ] tag Release 三个 ZIP 齐全
- [ ] 从 Release 下载 arm64 ZIP，解压、校验并启动
- [ ] Intel 与 Windows 在朋友真机确认前标记 prerelease

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-08-09 | 增加每轮本地 arm64 构建、架构/源码/时间校验、启动冒烟、CI 三产物和 Release 回下载验收；删除不存在的全局快捷键检查 |
| 2026-07-30 | 初版：4 项自动化测试、人工录屏和交互清单 |
