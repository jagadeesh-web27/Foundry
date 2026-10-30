import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TEST_DIRECTORY = '/sdcard/FoundryTestData';
export const PACKAGE_NAME = process.env.ANDROID_PACKAGE || 'com.foundry.app.debug';

export interface AndroidDevice {
  serial: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  transport: 'usb' | 'wireless';
}

export interface InstalledApk {
  path: string;
  timestamp: Date;
  size: number;
}

function run(command: string, args: string[], allowFailure = false): string {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'pipe' : 'inherit'],
      timeout: 120_000,
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

export function adb(args: string[], allowFailure = false): string {
  return run('adb', args, allowFailure);
}

export function connectedPhysicalDevice(): AndroidDevice {
  // Auto-connect to cached wireless device if available
  try {
    const cachePath = join(process.cwd(), '.android-device.json');
    if (existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (cached.serial && /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(cached.serial)) {
        adb(['connect', cached.serial], true);
      }
    }
  } catch {}

  const lines = adb(['devices'], false)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries = lines.map((line) => line.split(/\s+/));
  const unauthorized = entries.filter(([serial, state]) => serial && state === 'unauthorized');
  if (unauthorized.length > 0) {
    throw new Error(`Android device ${unauthorized[0][0]} is unauthorized. Unlock the phone and accept the USB/wireless debugging prompt.`);
  }

  const connected = entries.filter(([serial, state]) => serial && state === 'device');

  if (connected.length === 0) {
    throw new Error('Expected at least one authorized physical Android device over ADB (Wi-Fi or USB); found 0. Run npm run android:wireless or check adb devices.');
  }

  let serial = '';
  if (process.env.ANDROID_DEVICE) {
    const matched = connected.find(([s]) => s === process.env.ANDROID_DEVICE);
    if (!matched) throw new Error(`Requested ANDROID_DEVICE "${process.env.ANDROID_DEVICE}" is not connected.`);
    serial = matched[0];
  } else {
    let cachedSerial = '';
    try {
      const cachePath = join(process.cwd(), '.android-device.json');
      if (existsSync(cachePath)) {
        cachedSerial = JSON.parse(readFileSync(cachePath, 'utf8')).serial || '';
      }
    } catch {}

    const matchedCache = cachedSerial && connected.find(([s]) => s === cachedSerial);
    if (matchedCache) {
      serial = matchedCache[0];
    } else {
      // Prefer Wireless (Primary)
      const wireless = connected.filter(([s]) => /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s));
      if (wireless.length > 0) {
        serial = wireless[0][0];
      } else {
        // Fallback to USB
        serial = connected[0][0];
      }
    }
  }

  const getprop = (name: string) => adb(['-s', serial, 'shell', 'getprop', name]);
  const qemu = getprop('ro.kernel.qemu');
  const characteristics = getprop('ro.build.characteristics').toLowerCase();
  if (qemu === '1' || characteristics.includes('emulator')) {
    throw new Error('Refusing an emulator. This suite requires a physical Android phone.');
  }

  adb(['-s', serial, 'shell', 'input', 'keyevent', '224'], true);
  adb(['-s', serial, 'shell', 'wm', 'dismiss-keyguard'], true);
  adb(['-s', serial, 'shell', 'svc', 'power', 'stayon', 'true'], true);

  return {
    serial,
    model: getprop('ro.product.model'),
    manufacturer: getprop('ro.product.manufacturer'),
    androidVersion: getprop('ro.build.version.release'),
    transport: /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(serial) ? 'wireless' : 'usb',
  };
}

export function deviceShell(device: AndroidDevice, command: string, allowFailure = false): string {
  return adb(['-s', device.serial, 'shell', command], allowFailure);
}

export function resetAppPermissions(device: AndroidDevice): void {
  for (const permission of ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.READ_MEDIA_AUDIO']) {
    deviceShell(device, `pm revoke ${PACKAGE_NAME} ${permission}`, true);
  }
}

function writePhoneFile(device: AndroidDevice, name: string, content: string): void {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  deviceShell(device, `echo ${encoded} | base64 -d > ${TEST_DIRECTORY}/${name}`);
}

export function provisionPhoneFixtures(device: AndroidDevice): void {
  deviceShell(device, `mkdir -p ${TEST_DIRECTORY}`);
  writePhoneFile(device, 'test-notes.txt', 'Foundry physical Android test notes.');
  writePhoneFile(device, 'test-document.docx', 'Foundry DOCX fixture marker.');
  writePhoneFile(device, 'test-spreadsheet.xlsx', 'Foundry XLSX fixture marker.');
  writePhoneFile(device, 'test-image.jpg', 'Foundry image fixture marker.');

  const pdf = '%PDF-1.4\n1 0 obj\n<< /Length 160 >>\nstream\nBT /F1 12 Tf 72 720 Td (Foundry Resume) Tj 0 -20 Td (Candidate: Wireless Android Tester) Tj 0 -20 Td (Known marker: PHYSICAL_RESUME_MARKER) Tj ET\nendstream\nendobj\n%%EOF\n';
  writePhoneFile(device, 'test-resume.pdf', pdf);
  writePhoneFile(device, 'test-document.pdf', '%PDF-1.4\n1 0 obj\n<< /Title (Foundry Physical Document) >>\nendobj\n%%EOF\n');
}

export function latestApk(): InstalledApk {
  const configured = process.env.ANDROID_APK;
  const candidates = configured
    ? [configured]
    : [
        join(process.cwd(), 'Foundry-Android-debug.apk'),
        join(process.cwd(), 'public', 'Foundry-Android-debug.apk'),
        ...findApks(join(process.cwd(), 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk')),
      ];
  const existing = candidates
    .filter((path, index, all) => all.indexOf(path) === index && existsSync(path))
    .map((path) => {
      const stats = statSync(path);
      return { path, timestamp: stats.mtime, size: stats.size };
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  if (existing.length === 0) throw new Error('No APK found. Build with npm run android:build before running Android E2E.');
  return existing[0];
}

function findApks(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? findApks(path) : entry.name.endsWith('.apk') ? [path] : [];
  });
}

export function installAndLaunch(device: AndroidDevice, apk = latestApk()): InstalledApk {
  adb(['-s', device.serial, 'install', '-r', apk.path]);
  deviceShell(device, `pm clear ${PACKAGE_NAME}`);
  deviceShell(device, `monkey -p ${PACKAGE_NAME} 1`);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const running = deviceShell(device, `pidof ${PACKAGE_NAME}`, true);
    if (running) return apk;
  }
  throw new Error(`Foundry package ${PACKAGE_NAME} did not start on ${device.serial}.`);
}

export function selectSafTestDirectory(device: AndroidDevice): void {
  const deadline = Date.now() + 30_000;
  let selectedDirectory = false;
  while (Date.now() < deadline) {
    const xml = dumpUi(device);
    const folder = findTextBounds(xml, 'FoundryTestData');
    if (folder) {
      tapBounds(device, folder);
      selectedDirectory = true;
      break;
    }
    // If not in root, tap the device root breadcrumb to navigate up
    const rootBreadcrumb = xml.match(/resource-id="com\.google\.android\.documentsui:id\/breadcrumb_text"[^>]*bounds="\[([^\]]+)\]\[([^\]]+)\]"/);
    if (rootBreadcrumb) {
      const point = centerOfBounds(rootBreadcrumb[1], rootBreadcrumb[2]);
      deviceShell(device, `input tap ${point.x} ${point.y}`);
    }
  }
  if (!selectedDirectory) throw new Error('SAF picker did not show the phone directory FoundryTestData.');

  const useFolderDeadline = Date.now() + 15_000;
  let tappedUseFolder = false;
  while (Date.now() < useFolderDeadline) {
    const xml = dumpUi(device);
    const useFolder = findTextBounds(xml, 'Use this folder') || findTextBounds(xml, 'USE THIS FOLDER');
    if (useFolder) {
      tapBounds(device, useFolder);
      tappedUseFolder = true;
      break;
    }
  }
  if (!tappedUseFolder) throw new Error('SAF picker did not expose the Use this folder action.');

  // Confirm Android permission dialog: "Allow Foundry to access folder?" -> "ALLOW"
  const allowDeadline = Date.now() + 15_000;
  while (Date.now() < allowDeadline) {
    const xml = dumpUi(device);
    const allow = xml.match(/text="(?:ALLOW|Allow)"[^>]*bounds="\[([^\]]+)\]\[([^\]]+)\]"/);
    if (allow) {
      const point = centerOfBounds(allow[1], allow[2]);
      deviceShell(device, `input tap ${point.x} ${point.y}`);
      return;
    }
  }
}

export function grantVisiblePermissionDialogs(device: AndroidDevice): number {
  let grantedDialogCount = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const xml = dumpUi(device);
    const allow = xml.match(/text="(?:Allow|While using the app)"[^>]*bounds="\[([^\]]+)\]\[([^\]]+)\]"/);
    if (!allow) return grantedDialogCount;
    const point = centerOfBounds(allow[1], allow[2]);
    deviceShell(device, `input tap ${point.x} ${point.y}`);
    grantedDialogCount++;
  }
  return grantedDialogCount;
}

export function dumpUi(device: AndroidDevice): string {
  try {
    deviceShell(device, 'uiautomator dump --compressed /sdcard/foundry-ui.xml', true);
    return adb(['-s', device.serial, 'exec-out', 'cat', '/sdcard/foundry-ui.xml'], true);
  } catch {
    return '';
  }
}

function centerOfBounds(first: string, second: string): { x: number; y: number } {
  const [x1, y1] = first.split(',').map(Number);
  const [x2, y2] = second.split(',').map(Number);
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
}

function findTextBounds(xml: string, text: string): [string, string] | null {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`text="${escaped}"[^>]*bounds="\\[([^\\]]+)\\]\\[([^\\]]+)\\]"`, 'i'));
  return match ? [match[1], match[2]] : null;
}

function tapBounds(device: AndroidDevice, bounds: [string, string]): void {
  const point = centerOfBounds(bounds[0], bounds[1]);
  deviceShell(device, `input tap ${point.x} ${point.y}`);
}

function screenSize(device: AndroidDevice): { width: number; height: number } {
  const match = deviceShell(device, 'wm size').match(/(\d+)x(\d+)/);
  if (!match) return { width: 1080, height: 2400 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function trySendViaCdp(device: AndroidDevice, query: string): boolean {
  try {
    deviceShell(device, `am start -n ${PACKAGE_NAME}/com.foundry.app.MainActivity`, true);
    const pid = deviceShell(device, `pidof ${PACKAGE_NAME}`, true).trim();
    if (!pid) return false;
    adb(['-s', device.serial, 'forward', 'tcp:9225', `localabstract:webview_devtools_remote_${pid}`], true);
    const out = execFileSync('node', ['scripts/cdp-query.mjs', 'send', query], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return out.includes('Clicked button') || out.includes('Submitted form');
  } catch {
    return false;
  }
}

interface CdpLatestState {
  isThinking: boolean;
  count: number;
  latestText: string;
}

function tryReadLatestViaCdp(): CdpLatestState | null {
  try {
    const raw = execFileSync('node', ['scripts/cdp-query.mjs', 'latest'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

function _tryReadViaCdp(): string {
  try {
    return execFileSync('node', ['scripts/cdp-query.mjs', 'read'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
  } catch {
    return '';
  }
}

export function sendQuery(device: AndroidDevice, query: string, expectedText: string[] = []): string {
  const { width } = screenSize(device);

  const initialLatest = tryReadLatestViaCdp();
  const initialCount = initialLatest?.count ?? 0;

  const sentViaCdp = trySendViaCdp(device, query);

  if (!sentViaCdp) {
    const xmlBefore = dumpUi(device);
    const chatTab = findTextBounds(xmlBefore, 'Chat');
    if (chatTab) {
      tapBounds(device, chatTab);
    }

    const xmlChat = dumpUi(device);
    const editMatch = xmlChat.match(/class="android\.widget\.EditText"[^>]*bounds="\[([^\]]+)\]\[([^\]]+)\]"/i);
    if (editMatch) {
      tapBounds(device, [editMatch[1], editMatch[2]]);
    } else {
      const inputBounds = findTextBounds(xmlChat, 'Ask anything') || findTextBounds(xmlChat, 'Ask');
      if (inputBounds) {
        tapBounds(device, inputBounds);
      } else {
        deviceShell(device, `input tap ${Math.round(width / 2)} 2090`);
      }
    }

    deviceShell(device, 'sleep 0.5', true);
    deviceShell(device, `input text ${query.trim().replace(/ /g, '%s')}`);
    deviceShell(device, 'sleep 0.5', true);

    const xmlAfter = dumpUi(device);
    const sendMatch = xmlAfter.match(/content-desc="Send query"[^>]*bounds="\[([^\]]+)\]\[([^\]]+)\]"/i);
    if (sendMatch && sendMatch[1] !== '0,0') {
      tapBounds(device, [sendMatch[1], sendMatch[2]]);
    } else {
      deviceShell(device, 'input tap 963 1223');
      deviceShell(device, 'input keyevent KEYCODE_ENTER');
    }
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    deviceShell(device, 'sleep 1', true);

    const latest = tryReadLatestViaCdp();
    if (latest && !latest.isThinking && latest.count > initialCount) {
      if (expectedText.length === 0 || expectedText.every((text) => latest.latestText.toLowerCase().includes(text.toLowerCase()))) {
        return latest.latestText;
      }
    }

    if (!sentViaCdp) {
      const xml = dumpUi(device);
      if (expectedText.every((text) => xml.toLowerCase().includes(text.toLowerCase()))) {
        return xml;
      }
    }
  }

  const finalLatest = tryReadLatestViaCdp();
  if (finalLatest && finalLatest.count > initialCount && finalLatest.latestText) {
    if (expectedText.length === 0 || expectedText.every((text) => finalLatest.latestText.toLowerCase().includes(text.toLowerCase()))) {
      return finalLatest.latestText;
    }
    return finalLatest.latestText;
  }
  const finalXml = dumpUi(device);
  if (expectedText.every((text) => finalXml.toLowerCase().includes(text.toLowerCase()))) return finalXml;
  throw new Error(`Timed out waiting for Android UI response containing: ${expectedText.join(', ')}`);
}

export function forceStopAndRelaunch(device: AndroidDevice): void {
  deviceShell(device, `am force-stop ${PACKAGE_NAME}`);
  deviceShell(device, `monkey -p ${PACKAGE_NAME} 1`);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const pid = deviceShell(device, `pidof ${PACKAGE_NAME}`, true).trim();
    if (pid) break;
  }
  deviceShell(device, 'sleep 1', true);
}

export function collectLogcat(device: AndroidDevice): string {
  const output = adb(['-s', device.serial, 'logcat', '-d', '-v', 'brief'], true);
  const relevant = output
    .split(/\r?\n/)
    .filter((line) => /Foundry|AndroidFiles|AndroidDeviceAdapter|AgentTool|Tool Registry|ContentResolver|MediaStore|RustWebView|Tauri/i.test(line))
    .join('\n');
  const directory = join(process.cwd(), 'artifacts', 'android');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `logcat-${Date.now()}.log`);
  writeFileSync(path, relevant ? `${relevant}\n` : 'No matching Foundry Android log lines were observed.\n', 'utf8');
  return path;
}

export function androidReport(results: Record<string, boolean>, transport = 'Wi-Fi'): string {
  const line = (name: string, value: boolean) => `${name}: ${value ? 'PASS' : 'FAIL'}`;
  return [
    'Android Physical Device Test',
    '============================',
    line('ADB connection', results.adbConnection),
    line('Physical Android device', results.physicalDevice),
    line('Emulator rejected', results.emulatorRejected),
    line('Device authorized', results.deviceAuthorized),
    `Transport: ${transport}`,
    '',
    'Only PASS results from this report are emitted after real-device assertions complete.',
  ].join('\n');
}

export function parseDeviceBattery(device: AndroidDevice): { level: number; charging: boolean } {
  const output = deviceShell(device, 'dumpsys battery');
  const level = Number(output.match(/level:\s*(\d+)/)?.[1] || -1);
  const status = Number(output.match(/status:\s*(\d+)/)?.[1] || 1);
  return { level, charging: status === 2 || status === 5 };
}
