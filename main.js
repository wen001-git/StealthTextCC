// main.js — StealthTextCC 主进程（macOS / Windows / Linux 通用）
//
// 录屏隐身能力按平台分：
//   macOS : BrowserWindow.setContentProtection(true)              ← 完整
//           NSWindow.sharingType = .none
//           对 QuickTime / OBS / Zoom 共享屏幕 / Keynote 录屏均有效
//   Windows: SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) ← 半防护
//           通过 koffi 调 user32.dll
//           对 OBS / Xbox Game Bar / Zoom / PowerPoint 录屏有效
//           对 PrintWindow 类（Snip & Sketch、Bandicam 某些模式）无效 —— 这是 Win API 设计局限
//   Linux : 无对应保护，仅作为普通浮层
//
// 全部 UI 行为在 index.html（渲染进程）；本文件只做窗口/菜单/IPC/热键/分平台保护。

'use strict';

const { app, BrowserWindow, Menu, ipcMain, screen, shell } = require('electron');
const path = require('node:path');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_DEV = !app.isPackaged;

// ----- Windows 录屏保护：koffi 桥接 user32.dll -----
//   只在 Windows 上 require。koffi 是 mac/linux/win 通用 FFI，但只在 win 分支调用，
//   失败兜底返回 false（保护关闭），UI 用 platform 提示用户限制。
let koffiSetAffinity = null;
let WDA_EXCLUDEFROMCAPTURE = 0x11; // 官方常量（Win10 1607+）
let WDA_NONE = 0x00;
let winAffinityLogged = false;
if (IS_WIN) {
  try {
    // 仅在 win 上 require，mac/linux 启动时不会尝试加载
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    koffiSetAffinity = user32.func(
      'int __stdcall SetWindowDisplayAffinity(void* hWnd, uint32 dwAffinity)'
    );
  } catch (e) {
    console.error('[Win] koffi/user32 加载失败，录屏保护不可用:', e.message);
    koffiSetAffinity = null;
  }
}

function setScreenCaptureProtection(window, enabled) {
  if (!window) return false;
  if (IS_MAC) {
    try { window.setContentProtection(enabled); return true; }
    catch (e) { console.error('[Mac] setContentProtection 失败:', e); return false; }
  }
  if (IS_WIN) {
    if (!koffiSetAffinity) {
      if (!winAffinityLogged) {
        console.warn('[Win] SetWindowDisplayAffinity 不可用 —— koffi 加载失败');
        winAffinityLogged = true;
      }
      return false;
    }
    try {
      const hwnd = window.getNativeWindowHandle(); // Buffer (HWND on Windows)
      const r = koffiSetAffinity(hwnd, enabled ? WDA_EXCLUDEFROMCAPTURE : WDA_NONE);
      return r !== 0;
    } catch (e) {
      console.error('[Win] SetWindowDisplayAffinity 失败:', e);
      return false;
    }
  }
  // Linux：当前无保护，未来如要支持可用 X11 属性 + 合成器扩展
  return false;
}

// 在 app.ready 之前调用 setName 改 macOS / Windows 注册的应用名 / 单实例锁 ID，
// 避免和已存在的 "StealthText"（CodeX 开发的）冲突。
// productName 改了 Info.plist 的 CFBundleName，但运行时 app.getName() 仍
// 取自 package.json 的 name 字段——所以这里也强制覆盖。
// 注意：不要在这里调用 app.setPath('userData', ...)，
// 否则会覆盖 Chromium 的 --user-data-dir 命令行参数，影响测试隔离。
app.setName('StealthTextCC');

// 单实例锁——第二次启动时聚焦已有窗口而不是再开一个
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let win = null;
// 录屏保护可关：默认 true；用户能通过菜单临时关闭（极少数场景需要录到它）
let contentProtected = true;

function clampToDisplay(win) {
  // 把窗口拉回当前显示器内，避免拖到屏外看不到
  try {
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const work = display.workArea;
    const w = Math.min(bounds.width, work.width);
    const h = Math.min(bounds.height, work.height);
    const x = Math.max(work.x, Math.min(bounds.x, work.x + work.width - w));
    const y = Math.max(work.y, Math.min(bounds.y, work.y + work.height - h));
    if (x !== bounds.x || y !== bounds.y || w !== bounds.width || h !== bounds.height) {
      win.setBounds({ x, y, width: w, height: h });
    }
  } catch (_) { /* 取不到就跳过 */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 280,
    minWidth: 320,
    minHeight: 160,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    skipTaskbar: IS_MAC ? true : false, // Win 上保留任务栏图标以便用户找到窗口
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false, // 滚到非激活也别限帧
    },
  });

  // ★ 核心：录屏时此窗口内容对其他 App 不可见（macOS / Windows 分支处理）
  // 用户本人（主屏幕）仍能看到
  setScreenCaptureProtection(win, contentProtected);

  // 跨桌面空间 —— 仅 macOS 支持
  if (IS_MAC) {
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (_) {}
    // 不在 Mission Control 出现
    try { win.setHiddenInMissionControl(true); } catch (_) { /* 旧版 Electron 无此 API */ }
  }
  // Windows 跨虚拟桌面：Electron 无 API，需要 native COM 桥；本期未做
  // 浮于所有空间之上（含全屏 App）—— 跨平台都支持
  win.setAlwaysOnTop(true, 'floating');

  win.loadFile('index.html');

  win.once('ready-to-show', () => {
    win.show();
    // 默认放到屏幕底部中间（贴近摄像头）—— 用户可拖到任何位置
    try {
      const display = screen.getPrimaryDisplay();
      const work = display.workArea;
      const w = 720, h = 280;
      win.setPosition(
        Math.round(work.x + (work.width - w) / 2),
        Math.round(work.y + work.height - h - 80)
      );
    } catch (_) { /* 显示器信息拿不到就保持默认位置 */ }
    clampToDisplay(win);
  });

  // 显示器变化时自动拉回可见区
  screen.on('display-removed', () => clampToDisplay(win));
  screen.on('display-metrics-changed', () => clampToDisplay(win));

  // 外部链接用默认浏览器打开，不在 App 内跳
  win.webContents.setWindowOpenHandler(function (details) {
    const url = details && details.url ? details.url : '';
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 阻止导航到其他页面
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

function buildMenu() {
  const aot = win ? win.isAlwaysOnTop() : true;

  // 录屏保护菜单的 tooltip —— 跨平台如实说明限制
  const captureProtectionLabel = IS_WIN
    ? '录屏时不可见（OBS / Game Bar / 视频会议有效；Win+Shift+S、Snip & Sketch 等可能绕过）'
    : IS_MAC
      ? '录屏时对其他 App 不可见'
      : '录屏时不可见（Linux 暂不支持保护）';

  const template = [
    ...(IS_MAC ? [{
      label: 'StealthTextCC',
      submenu: [
        { role: 'about', label: '关于 StealthTextCC' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 StealthTextCC' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 StealthTextCC' },
      ],
    }] : []),
    {
      label: '提词器',
      submenu: [
        {
          label: '永远置顶',
          type: 'checkbox',
          checked: aot,
          click: (item) => toggleAlwaysOnTop(item.checked),
        },
        {
          label: captureProtectionLabel,
          type: 'checkbox',
          checked: contentProtected,
          click: (item) => {
            contentProtected = item.checked;
            if (win) setScreenCaptureProtection(win, contentProtected);
          },
        },
        { type: 'separator' },
        {
          label: '显示/隐藏窗口',
          click: () => {
            if (!win) return;
            if (IS_MAC) {
              if (win.isMinimized()) { win.restore(); win.focus(); }
              else if (win.isVisible()) win.minimize();
              else { win.show(); win.focus(); }
            } else {
              if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
            }
          },
        },
        {
          label: '重置位置到屏幕中央',
          click: () => {
            if (!win) return;
            const d = screen.getPrimaryDisplay().workArea;
            const [w, h] = win.getSize();
            win.setPosition(
              Math.round(d.x + (d.width - w) / 2),
              Math.round(d.y + (d.height - h) / 2)
            );
            clampToDisplay(win);
          },
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载页面' },
        ...(IS_DEV ? [{ role: 'toggleDevTools', label: '开发者工具' }] : []),
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function toggleAlwaysOnTop(force) {
  if (!win) return;
  const next = typeof force === 'boolean' ? force : !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  win.webContents.send('aot-changed', next);
  buildMenu(); // 刷新菜单勾选
}

// ---------- IPC ----------
ipcMain.on('win-move', (_e, dx, dy) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + Math.round(dx), y + Math.round(dy));
});
ipcMain.on('win-resize', (_e, dx, dy) => {
  if (!win) return;
  const [w, h] = win.getSize();
  const nw = Math.max(320, Math.min(1600, w + Math.round(dx)));
  const nh = Math.max(160, Math.min(900, h + Math.round(dy)));
  win.setSize(nw, nh);
  clampToDisplay(win);
});
ipcMain.on('toggle-aot', () => toggleAlwaysOnTop());
ipcMain.on('get-aot', (e) => {
  e.returnValue = win ? win.isAlwaysOnTop() : true;
});
// 录屏保护切换（窗口内按钮）
ipcMain.on('toggle-capture-protection', () => {
  contentProtected = !contentProtected;
  if (win) setScreenCaptureProtection(win, contentProtected);
  win.webContents.send('capture-protection-changed', contentProtected);
  buildMenu();
});
// 获取当前录屏保护状态
ipcMain.on('get-capture-protection', (e) => {
  e.returnValue = contentProtected;
});
// 隐藏/恢复窗口
// macOS：最小化到 Dock（用户可点 Dock 图标恢复）
// Windows/Linux：隐藏窗口（任务栏图标可恢复）
ipcMain.on('toggle-visible', () => {
  if (!win) return;
  if (IS_MAC) {
    if (win.isMinimized()) { win.restore(); win.focus(); }
    else if (win.isVisible()) win.minimize();
    else { win.show(); win.focus(); }
  } else {
    if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
  }
});
ipcMain.on('quit', () => {
  // 正常退出；若 2 秒内没完成（macOS 某些情况下会出现），强制终止进程
  const forceTimer = setTimeout(() => {
    console.warn('[Main] app.quit() 未在 2 秒内完成，强制退出');
    app.exit(0);
  }, 2000);

  app.once('will-quit', () => clearTimeout(forceTimer));
  app.quit();
});
ipcMain.on('center', () => {
  if (!win) return;
  const d = screen.getPrimaryDisplay().workArea;
  const [w, h] = win.getSize();
  win.setPosition(
    Math.round(d.x + (d.width - w) / 2),
    Math.round(d.y + (d.height - h) / 2)
  );
  clampToDisplay(win);
});
// 渲染层想知道当前平台能力（用于顶栏提示文案）
ipcMain.on('get-platform', (e) => {
  e.returnValue = {
    platform: process.platform,
    captureProtectionLabel: IS_WIN
      ? '录屏时不可见（OBS / Game Bar / 视频会议有效；Win+Shift+S、Snip & Sketch 等可能绕过）'
      : IS_MAC
        ? '录屏时对其他 App 不可见'
        : '录屏时不可见（Linux 暂不支持保护）',
    captureProtectionHalfEffective: IS_WIN,
  };
});

// ---------- App 生命周期 ----------
app.whenReady().then(() => {
  // 在 Dock 显示图标，方便隐藏后通过 Dock 恢复；不再追求完全隐身
  createWindow();
  buildMenu();

  // 本 App 不使用全局快捷键，避免与其他 App 冲突
});

app.on('second-instance', () => {
  if (win) {
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  // 单窗口浮层工具：窗口关了就是用户想退出，macOS 也不例外
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (win) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }
});

// will-quit：无需清理（不再使用 globalShortcut）
