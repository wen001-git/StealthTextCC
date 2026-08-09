import { spawnSync } from 'node:child_process';
import process from 'node:process';

const tasks = {
  test: ['test'],
  'dist:mac:all': ['run', 'dist:mac:all'],
  'dist:win:x64': ['run', 'dist:win:x64'],
};

const task = process.argv[2];
if (!tasks[task]) {
  console.error(`未知 CI 任务: ${task || '(空)'}`);
  process.exit(2);
}

const result = spawnSync('npm', tasks[task], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 20 * 1024 * 1024,
  shell: process.platform === 'win32',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const exitCode = result.status ?? 1;
if (exitCode !== 0) {
  const diagnostic = [result.stdout, result.stderr, result.error?.stack]
    .filter(Boolean)
    .join('\n')
    .slice(-12_000)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error(`::error title=${task} failed::${diagnostic}`);
}

process.exit(exitCode);
