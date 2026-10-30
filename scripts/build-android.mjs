import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const startTime = Date.now();

const STAGES = {
  FRONTEND: '[1/5] Frontend build (TypeScript & Vite)',
  RUST_DEPS: '[2/5] Rust dependencies (Cargo compiling crates)',
  APP_LIB: '[3/5] app_lib compilation (Foundry native Rust core)',
  LINKING: '[4/5] Android linking (NDK ld.lld libapp_lib.so)',
  PACKAGING: '[5/5] APK packaging (Gradle DEX, packaging & signing)',
};

let currentStageIndex = 1;
let currentStage = STAGES.FRONTEND;

function setStage(index, stageName) {
  if (index > currentStageIndex) {
    currentStageIndex = index;
    currentStage = stageName;
    console.log(`\n\x1b[1;36m>>> ${stageName}\x1b[0m\n`);
  }
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

console.log('\x1b[1;32m========================================================\x1b[0m');
console.log('\x1b[1;32m     Foundry Android Build - Live Streaming Output      \x1b[0m');
console.log('\x1b[1;32m========================================================\x1b[0m\n');
console.log(`\x1b[1;36m>>> ${currentStage}\x1b[0m\n`);

let lastOutputTime = Date.now();

const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  if (now - lastOutputTime >= 10000) {
    const elapsed = formatElapsed(now - startTime);
    console.log(`\x1b[33m[Heartbeat] Process active: ${currentStage} (Elapsed: ${elapsed})\x1b[0m`);
    lastOutputTime = now;
  }
}, 5000);

const isWin = process.platform === 'win32';
const tauriCmd = isWin ? join(root, 'node_modules', '.bin', 'tauri.cmd') : join(root, 'node_modules', '.bin', 'tauri');

const runner = isWin ? 'cmd.exe' : tauriCmd;
const runnerArgs = isWin
  ? ['/c', tauriCmd, 'android', 'build', '-t', 'aarch64', '--apk', '--debug', '-v']
  : ['android', 'build', '-t', 'aarch64', '--apk', '--debug', '-v'];

const env = {
  ...process.env,
  CARGO_TERM_PROGRESS_WHEN: 'always',
  CARGO_TERM_PROGRESS_WIDTH: '80',
  CARGO_TERM_COLOR: 'always',
  FORCE_COLOR: '1',
};

const child = spawn(runner, runnerArgs, {
  cwd: root,
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

function handleLine(line, isError = false) {
  lastOutputTime = Date.now();
  const trimmed = line.trim();
  if (!trimmed) return;

  // Detect stage transitions
  if (/Compiling\s+app_lib/i.test(trimmed)) {
    setStage(3, STAGES.APP_LIB);
  } else if (/Compiling\s+[a-zA-Z0-9_-]+/i.test(trimmed) || /Downloaded|Downloading|Updating\s+crates/i.test(trimmed)) {
    setStage(2, STAGES.RUST_DEPS);
  } else if (/ld\.lld|linking|mergeProjectDexDebug|mergeLibDexDebug/i.test(trimmed)) {
    setStage(4, STAGES.LINKING);
  } else if (/packageArm64Debug|assembleArm64Debug|createArm64Debug/i.test(trimmed)) {
    setStage(5, STAGES.PACKAGING);
  }

  // Formatting and output
  if (/^>\s*Task\s+:app:/i.test(trimmed)) {
    console.log(`\x1b[35m[Gradle]\x1b[0m ${trimmed}`);
  } else if (/^Compiling\s+/i.test(trimmed)) {
    console.log(`\x1b[34m[Rust]\x1b[0m   ${trimmed}`);
  } else if (/^Running\s+/i.test(trimmed)) {
    console.log(`\x1b[90m[Rust]\x1b[0m   ${trimmed}`);
  } else if (isError) {
    console.error(`\x1b[31m${line}\x1b[0m`);
  } else {
    console.log(line);
  }
}

let stdoutBuf = '';
child.stdout.on('data', (chunk) => {
  stdoutBuf += chunk.toString();
  const lines = stdoutBuf.split(/\r?\n/);
  stdoutBuf = lines.pop() || '';
  for (const line of lines) {
    handleLine(line, false);
  }
});

let stderrBuf = '';
child.stderr.on('data', (chunk) => {
  stderrBuf += chunk.toString();
  const lines = stderrBuf.split(/\r?\n/);
  stderrBuf = lines.pop() || '';
  for (const line of lines) {
    handleLine(line, true);
  }
});

child.on('close', (code) => {
  clearInterval(heartbeatInterval);
  if (stdoutBuf.trim()) handleLine(stdoutBuf, false);
  if (stderrBuf.trim()) handleLine(stderrBuf, true);

  const totalTime = formatElapsed(Date.now() - startTime);

  if (code !== 0) {
    console.error(`\n\x1b[1;31mBuild failed with exit code ${code} (Duration: ${totalTime})\x1b[0m\n`);
    process.exit(code || 1);
  }

  console.log(`\n\x1b[1;32mBuild process completed in ${totalTime}. Synchronizing APK...\x1b[0m\n`);

  const syncRunner = spawn(process.execPath, [join(root, 'scripts', 'sync-android-apk.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });

  syncRunner.on('close', (syncCode) => {
    if (syncCode !== 0) {
      console.error(`\x1b[31mFailed to sync APK (exit code ${syncCode})\x1b[0m`);
      process.exit(syncCode || 1);
    }
    console.log('\n\x1b[1;32m========================================================\x1b[0m');
    console.log('\x1b[1;32m         Foundry Android Build Succeeded!               \x1b[0m');
    console.log('\x1b[1;32m========================================================\x1b[0m\n');
  });
});
