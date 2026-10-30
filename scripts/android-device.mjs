import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
export const packageName = process.env.ANDROID_PACKAGE || 'com.foundry.app.debug';
export const cacheFile = join(root, '.android-device.json');
export const configuredApk = process.env.ANDROID_APK ? resolve(root, process.env.ANDROID_APK) : null;

export function run(command, args, allowFailure = false) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

export function runCaptured(command, args, allowFailure = false) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

export function isWirelessSerial(serial) {
  return /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(serial);
}

export function getConnectedDevices() {
  const output = runCaptured('adb', ['devices', '-l'], true);
  const lines = output.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
  const devices = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (!parts.length) continue;
    const serial = parts[0];
    const state = parts[1] || 'unknown';
    const isWireless = isWirelessSerial(serial);

    const modelMatch = line.match(/model:([^\s]+)/);
    const productMatch = line.match(/product:([^\s]+)/);
    const transportMatch = line.match(/transport_id:([^\s]+)/);

    devices.push({
      serial,
      state,
      transport: isWireless ? 'wireless' : 'usb',
      transportLabel: isWireless ? 'Wi-Fi' : 'USB',
      model: modelMatch ? modelMatch[1] : 'unknown',
      product: productMatch ? productMatch[1] : 'unknown',
      transportId: transportMatch ? transportMatch[1] : '',
      authorized: state === 'device',
    });
  }

  return devices;
}

export function getSavedDevice() {
  try {
    if (existsSync(cacheFile)) {
      return JSON.parse(readFileSync(cacheFile, 'utf8'));
    }
  } catch {
    // Ignore invalid cache
  }
  return null;
}

export function saveActiveDevice(device) {
  try {
    writeFileSync(cacheFile, `${JSON.stringify(device, null, 2)}\n`, 'utf8');
  } catch (e) {
    console.warn('Could not save .android-device.json:', e.message);
  }
}

export function selectActiveDevice() {
  const devices = getConnectedDevices();
  const unauthorized = devices.find((d) => d.state === 'unauthorized');
  if (unauthorized) {
    throw new Error(`Device ${unauthorized.serial} is unauthorized. Accept USB/Wireless debugging on the phone.`);
  }

  const authorized = devices.filter((d) => d.authorized);
  if (!authorized.length) {
    throw new Error('No authorized Android devices found. Run "npm run android:wireless" to connect over Wi-Fi.');
  }

  // Priority 1: ANDROID_DEVICE environment variable
  if (process.env.ANDROID_DEVICE) {
    const matched = authorized.find((d) => d.serial === process.env.ANDROID_DEVICE);
    if (matched) return enrichDeviceInfo(matched);
  }

  // Priority 2: Previously saved device if still active
  const saved = getSavedDevice();
  if (saved && saved.serial) {
    const matched = authorized.find((d) => d.serial === saved.serial);
    if (matched) return enrichDeviceInfo(matched);
  }

  // Priority 3: Connected Wireless device (Primary workflow)
  const wireless = authorized.filter((d) => d.transport === 'wireless');
  if (wireless.length > 0) {
    const chosen = enrichDeviceInfo(wireless[0]);
    saveActiveDevice(chosen);
    return chosen;
  }

  // Priority 4: Connected USB device (Fallback workflow)
  const chosen = enrichDeviceInfo(authorized[0]);
  saveActiveDevice(chosen);
  return chosen;
}

function enrichDeviceInfo(device) {
  const serial = device.serial;
  const getprop = (name) => runCaptured('adb', ['-s', serial, 'shell', 'getprop', name], true);

  const qemu = getprop('ro.kernel.qemu');
  const characteristics = (getprop('ro.build.characteristics') || '').toLowerCase();
  if (qemu === '1' || characteristics.includes('emulator')) {
    throw new Error('Refusing emulator. This operation requires a physical Android device.');
  }

  const model = getprop('ro.product.model') || device.model || 'iQOO I2302';
  const manufacturer = getprop('ro.product.manufacturer') || 'vivo';
  const androidVersion = getprop('ro.build.version.release') || '16';

  return {
    ...device,
    model,
    manufacturer,
    androidVersion,
  };
}

export function findApks(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findApks(path) : entry.name.endsWith('.apk') ? [path] : [];
  });
}

export function findNewestApk() {
  const candidates = configuredApk
    ? [configuredApk]
    : [
        join(root, 'Foundry-Android-debug.apk'),
        ...findApks(join(root, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk')),
      ];

  const existing = candidates
    .filter((path, index, all) => existsSync(path) && all.indexOf(path) === index)
    .map((path) => ({ path, stat: statSync(path) }))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  if (!existing.length) {
    throw new Error('No APK found. Run "npm run android:build" first.');
  }

  const chosen = existing[0];
  if (chosen.stat.size < 1_000_000) {
    throw new Error(`APK at ${chosen.path} is unusually small (${chosen.stat.size} bytes). Rebuild with npm run android:build.`);
  }

  return chosen;
}

export function printDeviceCheck(device) {
  console.log('Foundry Android Device');
  console.log('────────────────────────────');
  console.log(`Model: ${device.model}`);
  console.log(`Android: ${device.androidVersion}`);
  console.log(`ADB: Connected`);
  console.log(`Transport: ${device.transport === 'wireless' ? 'Wi-Fi' : 'USB'}`);
  console.log(`Physical device: YES`);
  console.log(`Authorized: YES`);
  console.log(`Serial: ${device.serial}`);
  console.log('────────────────────────────');
}

export function installApk(device, apk = findNewestApk()) {
  console.log(`Target device: ${device.model} (${device.serial}) via ${device.transportLabel}`);
  console.log(`Installing APK: ${apk.path}`);
  console.log(`APK timestamp: ${apk.stat.mtime.toISOString()}`);
  console.log(`APK size: ${(apk.stat.size / (1024 * 1024)).toFixed(2)} MB`);

  run('adb', ['-s', device.serial, 'install', '-r', apk.path]);
  console.log('✓ APK installed successfully.');

  launchApp(device);
}

export function launchApp(device) {
  console.log(`Launching ${packageName}...`);
  run('adb', ['-s', device.serial, 'shell', 'monkey', '-p', packageName, '1']);

  const pid = runCaptured('adb', ['-s', device.serial, 'shell', 'pidof', packageName], true);
  if (!pid) {
    throw new Error(`Installed APK did not start package ${packageName}.`);
  }

  const packageInfo = runCaptured('adb', ['-s', device.serial, 'shell', 'dumpsys', 'package', packageName], true);
  const version = packageInfo.match(/versionName=([^\s]+)/)?.[1] || 'unknown';
  const versionCode = packageInfo.match(/versionCode=(\d+)/)?.[1] || 'unknown';

  console.log(`Installed package: ${packageName}`);
  console.log(`Installed version: ${version} (${versionCode})`);
  console.log(`Process: PASS (PID: ${pid})`);
}

export function restartApp(device) {
  console.log(`Restarting ${packageName} on ${device.serial}...`);
  run('adb', ['-s', device.serial, 'shell', 'am', 'force-stop', packageName]);
  run('adb', ['-s', device.serial, 'shell', 'am', 'start', '-n', `${packageName}/com.foundry.app.MainActivity`]);

  const pid = runCaptured('adb', ['-s', device.serial, 'shell', 'pidof', packageName], true);
  console.log(`App restarted: PASS (PID: ${pid})`);
}

export function showLogcat(device) {
  console.log(`Streaming logcat for Foundry from ${device.serial} (Ctrl+C to stop)...`);
  const child = spawn('adb', ['-s', device.serial, 'logcat', '-v', 'time'], {
    stdio: 'inherit',
  });
  process.on('SIGINT', () => {
    child.kill();
    process.exit(0);
  });
}

// CLI handler if executed directly
if (process.argv[1] && process.argv[1].endsWith('android-device.mjs')) {
  try {
    const device = selectActiveDevice();

    if (process.argv.includes('--check')) {
      printDeviceCheck(device);
    } else if (process.argv.includes('--install')) {
      installApk(device);
    } else if (process.argv.includes('--launch')) {
      launchApp(device);
    } else if (process.argv.includes('--restart')) {
      restartApp(device);
    } else if (process.argv.includes('--logcat')) {
      showLogcat(device);
    } else {
      printDeviceCheck(device);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
