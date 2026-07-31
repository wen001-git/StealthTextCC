// preload.js — 渲染进程暴露最小 API
// 走 contextBridge，不用 nodeIntegration 也不需要开 node。

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 主进程同步的「当前置顶状态」，渲染进程初始化时一次性拿
  getAlwaysOnTop: () => ipcRenderer.sendSync('get-aot'),
  // 切换置顶（菜单/热键触发）
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-aot'),
  // 移动 / 缩放窗口（标题栏/手柄拖动时由主进程改 BrowserWindow 位置）
  moveBy: (dx, dy) => ipcRenderer.send('win-move', dx, dy),
  resizeBy: (dx, dy) => ipcRenderer.send('win-resize', dx, dy),
  // 置顶状态变化（菜单/热键）→ 渲染进程更新 UI 状态点
  onAlwaysOnTopChanged: (cb) => ipcRenderer.on('aot-changed', (_e, v) => cb(v)),
  // 居中
  center: () => ipcRenderer.send('center'),
  // 退出
  quit: () => ipcRenderer.send('quit'),
  // 平台能力（用于顶栏提示文案；mac/win/linux 各自说明）
  getPlatform: () => ipcRenderer.sendSync('get-platform'),
});
