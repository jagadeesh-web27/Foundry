import { findNewestApk, installApk, launchApp, printDeviceCheck, restartApp, selectActiveDevice, showLogcat } from './android-device.mjs';

const device = selectActiveDevice();
const apk = findNewestApk();

console.log(`ADB: PASS (${device.serial})`);
console.log(`Physical device: PASS (${device.model}, Android ${device.androidVersion})`);
console.log(`Transport: ${device.transportLabel}`);
console.log(`APK: ${apk.path}`);
console.log(`APK timestamp: ${apk.stat.mtime.toISOString()}`);
console.log(`APK size: ${apk.stat.size} bytes`);

if (process.argv.includes('--install')) {
  installApk(device, apk);
} else if (process.argv.includes('--launch')) {
  launchApp(device);
} else if (process.argv.includes('--restart')) {
  restartApp(device);
} else if (process.argv.includes('--logcat')) {
  showLogcat(device);
} else if (process.argv.includes('--check')) {
  printDeviceCheck(device);
}
