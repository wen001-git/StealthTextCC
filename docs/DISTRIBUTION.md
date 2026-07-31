# 分发方案 — 如何发给其他 Mac 用户

> 目的：记录把 StealthTextCC 发给其他 Mac 用户的几种方式及其取舍。　目标读者：未来想正式分发的人 / 决定走哪条路的人。　如何阅读：先看「决策树」，再按需看路径细节。

## 决策树

```
对方是什么人？
├─ mac 用户 + 内部小范围
│   ├─ 路 1：直接发 .app 文件夹（zip / AirDrop）
│   └─ 路 2：打 universal（arm64 + x64）+ 内部分发链接
│
├─ Windows 用户
│   └─ 路 4：GitHub Actions 自动构建 + Release（本期新增）
│
└─ 公开发布 / 上架 App Store
    └─ 路 3：苹果开发者账号 + 签名 + 公证 + dmg
```

---

## 路 1：直接发 .app 文件夹（最简单）

```bash
# 1. 打包
npm run build:mac
# 产出：dist/mac-arm64/StealthTextCC.app（约 226MB）

# 2. 打包成 zip（保留可执行位）
cd dist/mac-arm64
zip -r StealthTextCC.app.zip StealthTextCC.app

# 3. 通过 AirDrop / 微信文件 / U盘发过去
```

对方收到后：

1. 解压 zip
2. 打开 Finder 找到 `StealthTextCC.app`
3. **右键 → 打开 → 在弹窗中点「打开」**（首次需要，给 macOS 授权未签名应用）
4. 之后双击正常

**限制**：只支持与你自己 CPU 架构相同的 Mac（M 系列打 M 系列）。

---

## 路 2：打 universal / 双架构

```bash
npm run build:mac:universal
# 产物：
#   dist/mac-arm64/StealthTextCC.app   ← Apple Silicon (M1/M2/M3/M4)，~227MB
#   dist/mac/StealthTextCC.app          ← Intel，~241MB
```

Electron 二进制需要从 GitHub 下载：
- 第一次会有 100+ MB 的 Electron x64 二进制下载（5-15 分钟，看网络）
- 下载到 `~/Library/Caches/electron-builder/`，**首次后秒打**
- 如果下载中途报错（timeout / zip 损坏），electron-builder 会自动重试一次

对方根据自己 Mac 选对应文件：
- Apple Silicon（M1/M2/M3/M4）→ 用 arm64 版
- Intel Mac → 用 x64 版
- 看不清 → 「系统设置 → 通用 → 关于本机 → 芯片」

**仍未签名**，对方首次仍需「右键 → 打开」。

---

## 路 3：正式签名 + 公证 + DMG（最复杂，最用户友好）

### 前置条件

- Apple Developer 账号：**$99 USD/年**（[注册](https://developer.apple.com/programs/enroll/)）
- 在 Xcode → Settings → Accounts 登录
- 生成 **Developer ID Application** 证书（不是「Apple Development」证书）
- 生成 **App-specific password**（用于 notarize API）

### 修改 `package.json`

```json
"mac": {
  "target": ["dmg"],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "identity": "Developer ID Application: 你的名字 (TEAMID)",
  "notarize": {
    "teamId": "TEAMID",
    "appleId": "你的AppleID@example.com",
    "appleIdPassword": "app-specific-password"
  }
}
```

### 打包

```bash
CSC_KEY_PASSWORD='xxx' \
  CSC_LINK='~/DeveloperCertificates.p12' \
  npm run build:mac
```

输出 `dist/StealthTextCC-0.1.0.dmg`，对方下载双击拖到 /Applications 就完事，**无需**「仍要打开」。

### DMG 体积

universal 双架构 + DMG 通常 **250-280 MB**（Electron 二进制 ~95 MB × 2 + Frameworks）。可以接受。

## 路 4：Windows 版自动构建（GitHub Actions）

适用场景：发给 Windows 用户，已经把代码 push 到 GitHub。

### 步骤

1. **首次配置**：
   ```bash
   cd /Users/Zhuanz/claude/stealthtextcc
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin git@github.com:YOUR_USER/StealthTextCC.git
   git push -u origin main
   ```

2. **触发 build**：push 触发 `.github/workflows/build-windows.yml`
   - workflow 自动跑：`npm ci` → `npm test` → `npm run build:win`
   - 在 `windows-latest` runner 上产出 `dist/StealthTextCC-0.1.0-x64.zip`
   - 上传为 GitHub Actions artifact（保留 30 天）

3. **下载产物**：在 GitHub 上点这次 push 的 Actions run → 滚到 Artifacts → 下载 `StealthTextCC-windows-x64`

4. **正式发版**：打 tag 触发自动 Release
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   此时 workflow 跑完会把 zip 上传到对应 tag 的 GitHub Release。

5. **对方使用**：
   - 下载 zip → 解压 → 双击 `StealthTextCC.exe`
   - Windows 弹「未知发布者」→「仍要运行」

### 已知限制

- **未签名**：对方首次需要点「仍要运行」（一次后记住）
- **zsh / bash 工具链**：Windows runner 自带 PowerShell，Node 22 预装，无需额外配置
- **koffi 文件**：electron-builder 默认会把 `dependencies` 打包；已显式加了 `node_modules/koffi/**` 进 `files`
- **冷启动慢**：第一次 build 5-10 分钟（要下 Electron Windows 二进制 + koffi native）；后续 2-4 分钟
- **WDA 局限**：见 `docs/PLATFORM-FEASIBILITY.md` 第 6 节

### 如果用户报「koffi 加载失败」

可能原因：用户 Win 版本 < Win10 1607（没有 WDA API）或 user32.dll 损坏。
- 让用户升级到 Win10 1607+
- 或在 main.js 的 `setScreenCaptureProtection` 里把 `koffiSetAffinity == null` 的分支改成「永远 close」，让 UI 显式提示「本机不支持录屏保护」

---

## 关于 App Store / Mac App Store

不走这条路。

理由：

- App Store 上架需通过 Apple 审核，**含「录屏时隐藏」功能的工具**很可能被打回（Apple 不喜欢「欺骗用户/录屏伙伴」的工具）
- 沙盒 + 沙盒 IPC 限制多，与 Electron 默认配置不兼容
- 审核周期 1-3 周，发布风险高
- **只推荐**走 Developer ID + 直接分发

---

## 已知坑汇总

| 坑 | 触发条件 | 解决 |
|---|---|---|
| 对方双击提示「无法打开，因为开发者无法验证」 | 未签名 | 第一次右键打开 |
| 对方打开后窗口不显示 / 不在 dock | macOS 上 Electron 默认 `app.dock.hide()` 看不到图标 | 启动后看屏幕底部中间；菜单栏第一项是 app 名 |
| 在 Intel Mac 上打不开 | 我们打了 arm64 only | 走路 2 universal |
| 在 Apple Silicon 上启动慢 | 没 Rosetta 兼容包 | Electron 已原生支持 arm64，无需 Rosetta |
| 录屏保护没生效 | 对方 macOS 权限 / 系统版本（Sequoia 后可能行为变化） | 用户跑 QuickTime 录屏 5 秒验证 |

---

## 我会怎么做（如果是我）

假设你只是**发给一小撮人用**：

1. **打 universal 双架构（路 2）**——这样兼容所有 Mac
2. **不签名**——让对方「右键打开」一次
3. **zip 压缩发文件 / 放内网下载链接**——不走公网就无需签名

如果**公开发布给不认识的人**：

1. 走路 3（签名 + 公证），但**先评估你的真实需求**是不是大到值得花 $99/年
2. 认真准备使用说明、FAQ、隐私声明（Apple notarize 审核会看）

---

## 变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-07-30 | 初版：决策树 + 三条路径 + 各路径的成本 / 限制 |
