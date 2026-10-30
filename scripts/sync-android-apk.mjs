import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputRoot = join(root, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk');
const candidates = [];

function scan(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name.endsWith('.apk')) candidates.push(path);
  }
}

scan(outputRoot);
if (!candidates.length) throw new Error('No APK found in the Tauri Android Gradle output.');
const source = candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
const sourceStat = statSync(source);
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const rootApk = join(root, 'Foundry-Android-debug.apk');
cpSync(source, rootApk);
const metadata = {
  productName: 'Foundry Android',
  version: tauriConfig.version,
  apkPath: '/Foundry-Android-debug.apk',
  sourcePath: source,
  builtAt: sourceStat.mtime.toISOString(),
  sizeBytes: sourceStat.size,
};
writeFileSync(join(root, 'public', 'android-build.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Synchronized APK: ${rootApk}`);
console.log(`Built: ${metadata.builtAt}`);
console.log(`Size: ${metadata.sizeBytes} bytes`);
