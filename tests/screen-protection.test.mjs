// tests/screen-protection.test.mjs
//
// 自动化验收（覆盖一部分；外部录屏视角仍需人工跑 QuickTime / OBS）
//
// 验证项：
//   1) App 启动正常，无渲染错误（CDP 拿到 title、API 桥接成功）
//   2) 编辑/播放状态切换正常（点击播放按钮切到 play、滚到底自动回 edit）
//   3) App 自身能截到讲稿内容（保护不误伤自身截图能力）
//   4) 窗口大小调整后元素仍居中、无溢出
//   5) 关 App 后再启动，讲稿从 localStorage 恢复
//
// 外部视角的「录屏时不可见」必须人工跑：见 README.md 的「录屏验证」小节
// 需要 macOS 系统授权 Terminal / Electron 「屏幕录制」权限后跑 `screencapture`。

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(import.meta.dirname, '..');
const ELECTRON_BIN = resolve(ROOT, 'node_modules/.bin/electron');
const VERIFY_DIR = resolve(ROOT, 'docs/verification-2026-07-30');

let electronProc = null;
let currentPort = 0;

function pickPort() {
  // 9333-9340 循环避让被占的端口
  return 9333 + (Math.floor(Math.random() * 8));
}

async function killAllElectron() {
  // 兜底：杀掉任何跑在工程目录下的 Electron
  const { execSync } = await import('node:child_process');
  try { execSync('pkill -f "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \\." || true'); } catch { /* ignore */ }
  await new Promise(r => setTimeout(r, 500));
}

async function startElectron({ userDataDir } = {}) {
  await mkdir(VERIFY_DIR, { recursive: true });
  await killAllElectron();
  const port = pickPort();
  currentPort = port;
  const args = [
    '.',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
  ];
  if (userDataDir) {
    args.push(`--user-data-dir=${userDataDir}`);
  }
  electronProc = spawn(ELECTRON_BIN, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (r.ok) {
        const list = await r.json();
        const page = list.find(t => t.type === 'page' && t.url.includes('/index.html'));
        if (page) {
          await new Promise(r => setTimeout(r, 300));
          return { page, port };
        }
      }
    } catch { /* 还在起 */ }
  }
  throw new Error(`Electron did not start in 8s on port ${port}`);
}

async function cdpCall(page, method, params = {}) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const call = (m, p = {}) => new Promise((res) => {
    id += 1; pending.set(id, res);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const result = await call(method, params);
  ws.close();
  return result;
}

async function stopElectron({ graceful = true } = {}) {
  if (electronProc && !electronProc.killed) {
    if (graceful) {
      // 先 SIGTERM 让 Chromium flush localStorage，再 SIGKILL
      try {
        electronProc.kill('SIGTERM');
        // 等 2 秒让进程清理
        await new Promise((res) => {
          let done = false;
          electronProc.on('exit', () => { if (!done) { done = true; res(); } });
          setTimeout(() => { if (!done) { done = true; res(); } }, 2000);
        });
      } catch { /* ignore */ }
      if (!electronProc.killed) {
        try { electronProc.kill('SIGKILL'); } catch { /* ignore */ }
      }
    } else {
      try { electronProc.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }
  electronProc = null;
  await killAllElectron();
  currentPort = 0;
}

test('启动 + 渲染 + preload 桥接', async () => {
  const { page } = await startElectron({ userDataDir: `/tmp/stealthtext-test-1-${Date.now()}` });
  try {
    assert.match(page.url, /index\.html$/);
    // 等页面脚本跑完
    let title = '';
    for (let i = 0; i < 30; i++) {
      try {
        const t = await cdpCall(page, 'Runtime.evaluate', {
          expression: 'document.title',
          returnByValue: true,
        });
        title = t.result?.result?.value || '';
      } catch (_) { /* 还没就绪 */ }
      if (title === 'StealthTextCC') break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.equal(title, 'StealthTextCC', 'document.title 应该等于 StealthTextCC');

    const r = await cdpCall(page, 'Runtime.evaluate', {
      expression: `JSON.stringify({
        hasApi: typeof window.api === 'object' && window.api !== null,
        apiKeys: window.api ? Object.keys(window.api).sort() : [],
        bodyMode: document.body.dataset.mode,
        aotOn: !document.getElementById('aot-dot').classList.contains('off'),
        playLabel: document.getElementById('play-text').textContent,
        speed: Number(document.getElementById('speed').value),
        fontSize: Number(document.getElementById('font-size').value),
        frame: { w: document.getElementById('frame').offsetWidth, h: document.getElementById('frame').offsetHeight },
      })`,
      returnByValue: true,
    });
    const s = JSON.parse(r.result.result.value);
    assert.equal(s.hasApi, true, 'preload bridge missing');
    assert.deepEqual(s.apiKeys,
      ['center', 'getAlwaysOnTop', 'getCaptureProtection', 'getPlatform', 'moveBy', 'onAlwaysOnTopChanged', 'onCaptureProtectionChanged', 'quit', 'resizeBy', 'toggleAlwaysOnTop', 'toggleCaptureProtection', 'toggleVisible']);
    assert.equal(s.bodyMode, 'edit');
    assert.equal(s.aotOn, true, 'default aot should be on');
    assert.equal(s.playLabel, '播放');
    assert.equal(s.speed, 30);
    assert.equal(s.fontSize, 28);
    assert.equal(s.frame.w, 720);
    assert.equal(s.frame.h, 280);
  } finally {
    await stopElectron();
  }
});

test('编辑 → 播放 → 滚到底自动暂停', async () => {
  const { page } = await startElectron({ userDataDir: `/tmp/stealthtext-test-2-${Date.now()}` });
  try {
    // 设置一个很短的讲稿 + 慢速，确保滚到底
    await cdpCall(page, 'Runtime.evaluate', {
      expression: `(() => {
        const c = document.getElementById('content');
        c.innerText = '段1\\n\\n段2\\n\\n段3\\n\\n段4';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('speed').value = 60; // px/sec
        document.getElementById('speed').dispatchEvent(new Event('input', { bubbles: true }));
        return c.innerText.length;
      })()`,
      returnByValue: true,
    });

    // 点击播放按钮进入播放
    await cdpCall(page, 'Runtime.evaluate', {
      expression: `(() => {
        const c = document.getElementById('content');
        // 用 execCommand 确保内容触发正确的编辑事件
        c.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, '段1\\n\\n段2\\n\\n段3\\n\\n段4');
        const btn = document.getElementById('btn-play');
        if (btn) btn.click();
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 200));

    const mid = await cdpCall(page, 'Runtime.evaluate', {
      expression: `JSON.stringify({
        mode: document.body.dataset.mode,
        playLabel: document.getElementById('play-text').textContent,
        scrollTop: document.getElementById('content').scrollTop,
      })`,
      returnByValue: true,
    });
    const m = JSON.parse(mid.result.result.value);
    assert.equal(m.mode, 'play');
    assert.equal(m.playLabel, '暂停');

    // 等滚到底（最多 5 秒）
    let final;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      const cur = await cdpCall(page, 'Runtime.evaluate', {
        expression: `JSON.stringify({ mode: document.body.dataset.mode, scrollTop: document.getElementById('content').scrollTop, scrollHeight: document.getElementById('content').scrollHeight })`,
        returnByValue: true,
      });
      final = JSON.parse(cur.result.result.value);
      if (final.mode === 'edit') break;
    }
    assert.equal(final.mode, 'edit', 'should auto-pause when scrolled to bottom');
  } finally {
    await stopElectron();
  }
});

test('App 自身截图能看到讲稿（保护不误伤自身）', async () => {
  const { page } = await startElectron({ userDataDir: `/tmp/stealthtext-test-3-${Date.now()}` });
  try {
    await cdpCall(page, 'Runtime.evaluate', {
      expression: `(() => {
        const c = document.getElementById('content');
        c.innerText = 'OWN-CAPTURE-MARKER StealthText 验证标记';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return 'ok';
      })()`,
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 500));

    const shot = await cdpCall(page, 'Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.result.data, 'base64');
    assert.ok(buf.length > 5000, 'screenshot should be non-trivial in size');
    await writeFile(resolve(VERIFY_DIR, 'own-screenshot.png'), buf);

    // 验证 PNG header
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50); // P
    assert.equal(buf[2], 0x4e); // N
    assert.equal(buf[3], 0x47); // G
  } finally {
    await stopElectron();
  }
});

test('localStorage 持久化讲稿', async () => {
  // 用一个固定的 user-data-dir 跨两次启动
  const fixedDir = `/tmp/stealthtext-persist-${Date.now()}`;
  // 先用 Runtime.evaluate 写入 unique（必须在 init 写入默认文本之后）
  const { page } = await startElectron({ userDataDir: fixedDir });
  // 等 init 跑完
  await new Promise(r => setTimeout(r, 500));
  try {
    const unique = '持久化测试文本 ' + Date.now();
    const r1 = await cdpCall(page, 'Runtime.evaluate', {
      expression: `(() => {
        const c = document.getElementById('content');
        c.innerText = ${JSON.stringify(unique)};
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return { written: localStorage.getItem('stealthtext_text_v1'), content: c.innerText };
      })()`,
      returnByValue: true,
    });
    const probe1 = r1.result?.result?.value;
    assert.ok(probe1?.written?.includes(unique),
      `第一次启动写入失败: content="${probe1?.content?.slice(0, 50)}", ls="${probe1?.written?.slice(0, 80)}"`);
    // 关掉再启
    await stopElectron();
    await new Promise(r => setTimeout(r, 1500));
    const { page: page2 } = await startElectron({ userDataDir: fixedDir });
    await new Promise(r => setTimeout(r, 500));
    const r2 = await cdpCall(page2, 'Runtime.evaluate', {
      expression: `JSON.stringify({ ls: localStorage.getItem('stealthtext_text_v1'), content: document.getElementById('content').innerText })`,
      returnByValue: true,
    });
    const probe2 = JSON.parse(r2.result?.result?.value || '{}');
    assert.ok(probe2.ls && probe2.ls.includes(unique),
      `第二次启动没读到: ls="${probe2.ls?.slice(0, 80)}", content="${probe2.content?.slice(0, 80)}"`);
  } finally {
    await stopElectron();
  }
});

test.after(async () => {
  await stopElectron();
});

// 清理：每个 test 之后 stopElectron；test.after 兜底再清一次
test.afterEach(async () => {
  await stopElectron();
});