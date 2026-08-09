import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { extractFile } from '@electron/asar';

const [expectedArch, appArgument] = process.argv.slice(2);
assert.ok(expectedArch && appArgument, '用法: node scripts/verify-mac-app.mjs <arm64|x86_64> <app-path>');

const projectRoot = process.cwd();
const appPath = path.resolve(projectRoot, appArgument);
const executable = path.join(appPath, 'Contents', 'MacOS', 'StealthTextCC');
const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');

assert.ok(existsSync(executable), `缺少 App 主程序: ${executable}`);
assert.ok(existsSync(asarPath), `缺少 app.asar: ${asarPath}`);

const actualArch = execFileSync('lipo', ['-archs', executable], { encoding: 'utf8' }).trim();
assert.equal(actualArch, expectedArch, `架构不匹配: 期望 ${expectedArch}，实际 ${actualArch}`);

const sourceMain = readFileSync(path.join(projectRoot, 'main.js'));
const bundledMain = extractFile(asarPath, 'main.js');
const sourcePackage = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const bundledPackage = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

assert.equal(sha256(bundledMain), sha256(sourceMain), 'App 内 main.js 不是当前源码');
assert.equal(bundledPackage.version, sourcePackage.version, 'App 内版本号不是当前版本');

const builtAt = statSync(appPath).mtime.toISOString();
console.log(`验证通过: ${appPath}`);
console.log(`架构: ${actualArch}`);
console.log(`版本: ${bundledPackage.version}`);
console.log(`App 修改时间: ${builtAt}`);
console.log(`main.js SHA-256: ${sha256(bundledMain)}`);
