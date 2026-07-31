# 命名冲突处理 — StealthTextCC vs StealthText

> 目的：记录「用户的 Mac 上已有同名 App（CodeX 开发的 StealthText）」这一事实下，我们如何避免冲突的所有层面。　目标读者：未来想给同类重名 App 适配的人 / 接手分发的人。　如何阅读：先看「冲突面清单」，再按需深入。

## 冲突面清单（必看）

macOS 上有「重名 App」时，以下 6 层任何一层撞车都会出问题：

| # | 层 | 旧（StealthText） | 新（StealthTextCC） |
|---|---|---|---|
| 1 | .app 文件名 | `StealthText.app` | `StealthTextCC.app` |
| 2 | `Info.plist` 内 `CFBundleName` | `StealthText` | `StealthTextCC` |
| 3 | `Info.plist` 内 `CFBundleDisplayName` | `StealthText` | `StealthTextCC` |
| 4 | `Info.plist` 内 `CFBundleIdentifier` | `com.stealthtext.app` | `com.stealthtextcc.app` |
| 5 | 运行时 `app.getName()` / 单实例锁 ID | `stealthtext` (来自 package.json name) | `StealthTextCC`（main.js 启动时 `app.setName()` 强制覆盖）|
| 6 | userData 路径（localStorage / IndexedDB） | `~/Library/Application Support/StealthText` | `~/Library/Application Support/StealthTextCC` |
| 7 | 菜单第一项（macOS 自动用应用名填充） | StealthText | StealthTextCC |

**只改 layer 1-4（package.json 的 productName + appId）不够** —— macOS 单实例锁、运行时 `app.getName()`、菜单名还是会用 package.json 的 `name` 字段，**必须**在 main.js 启动时 `app.setName()` 强制覆盖。

---

## 具体改动位置

### 1. `package.json`

```json
{
  "name": "stealthtextcc",
  "build": {
    "appId": "com.stealthtextcc.app",
    "productName": "StealthTextCC"
  }
}
```

### 2. `main.js` 必须在 app.whenReady 之前

```js
'use strict';
// 在 app.ready 之前调用 setName 改 macOS 注册的应用名 / 单实例锁 ID，
// 避免和已存在的 "StealthText"（CodeX 开发的）冲突。
app.setName('StealthTextCC');
app.setPath('userData', require('node:os').homedir() + '/Library/Application Support/StealthTextCC');

// 单实例锁——第二次启动时聚焦已有窗口而不是再开一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
```

如果 `app.setName()` 写在 `app.whenReady().then()` 里就晚了——单实例锁和菜单第一项已经读取了旧 `name`。

### 3. 菜单

mac 顶部菜单第一项的 label 也得跟着改：

```js
{
  label: 'StealthTextCC',  // 不是 'StealthText'，否则 menu 第一项会撞名
  submenu: [
    { role: 'about', label: '关于 StealthTextCC' },
    ...
    { role: 'quit', label: '退出 StealthTextCC' },
  ],
},
```

---

## localStorage key 改不改？

**保持原值**（`stealthtext_text_v1` / `stealthtext_state_v1`）。

理由：
- key 是字符串，不是路径，**理论上**同 mac 上两个不同 App 的 localStorage 互相不可见（每个 App 是独立 origin / 独立 userData 目录）——所以 key 重名不互相串数据
- 改 key 会让已有用户的数据读不到（迁移很麻烦）
- 如果未来真要支持迁移，再单独写一段升级代码

唯一例外：如果两个 App 的 userData 目录被设成同一个——理论上不会（macOS 用 bundle id 区分），但保险起见也手动 `app.setPath('userData', ...)` 强制独立。

---

## 验证方法

打包后用 `PlistBuddy` 看 `.app` 的 Info.plist：

```bash
/usr/libexec/PlistBuddy -c "Print :CFBundleName" dist/mac-arm64/StealthTextCC.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" dist/mac-arm64/StealthTextCC.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" dist/mac-arm64/StealthTextCC.app/Contents/Info.plist
```

期望：都显示 `StealthTextCC` / `com.stealthtextcc.app`。

启动后看进程名：`pgrep -lf "StealthTextCC.app/Contents/MacOS/StealthTextCC"` 应当匹配。**不应该**匹配 `StealthText`。

---

## 已知不足

如果对方电脑上已经装了一个**靠 Apple Developer ID 签名**的 StealthText，而我们这个是**未签名**的，LaunchServices 偶尔会优先调起签名的那个——这是 macOS 的 LaunchServices 行为，与我们的代码无关。

如果真遇到，可以：
- 加签名（参考 `docs/DISTRIBUTION.md`）
- 或在对方机器上手动 `右键 → 打开 → 打开` StealthTextCC.app

---

## 这次踩到的坑：不要在主进程调 `app.setPath('userData', ...)`

> 教训来源：测试时 `--user-data-dir=` 命令行参数被默默忽略了。

最初我加了：
```js
app.setPath('userData', require('node:os').homedir() + '/Library/Application Support/StealthTextCC');
```

想着「把 userData 强制指到 StealthTextCC 子目录，避免和 StealthText 撞」。

**问题**：这行在 `app.whenReady()` 之前调用，会**强制覆盖 Chromium 默认的 userData 路径解析**——结果命令行传的 `--user-data-dir=/tmp/xxx` 也被忽略。所有测试都写到同一目录，互相串数据。

**只调 `app.setName('StealthTextCC')` 就够了**：Electron 会自动用 name 派生 userData 路径（`~/Library/Application Support/StealthTextCC/`），与 `StealthText` 不冲突。

**如果将来真的需要改 userData 路径**，要小心：
1. 必须放在 `app.whenReady()` 之后
2. 与命令行 `--user-data-dir` 互斥——要么命令行给、要么代码给
3. 测试 / 调试时记得兼容

---

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-07-30 | 初版：记录 7 层命名冲突面 + 必需的双写位置（package.json + main.js setName）+ localStorage key 不改的理由 |
