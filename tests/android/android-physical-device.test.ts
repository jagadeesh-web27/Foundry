import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AndroidDevice,
  collectLogcat,
  connectedPhysicalDevice,
  deviceShell,
  dumpUi,
  forceStopAndRelaunch,
  grantVisiblePermissionDialogs,
  installAndLaunch,
  latestApk,
  PACKAGE_NAME,
  parseDeviceBattery,
  provisionPhoneFixtures,
  resetAppPermissions,
  selectSafTestDirectory,
  sendQuery,
} from './android-test-utils';

let device: AndroidDevice;
let installedApk: ReturnType<typeof installAndLaunch>;
let logcatPath = '';

beforeAll(() => {
  device = connectedPhysicalDevice();
  provisionPhoneFixtures(device);
  if (process.env.ANDROID_REINSTALL === 'true') {
    resetAppPermissions(device);
    installedApk = installAndLaunch(device);
    grantVisiblePermissionDialogs(device);
    selectSafTestDirectory(device);
  } else {
    const running = deviceShell(device, `pidof ${PACKAGE_NAME}`, true);
    if (!running) {
      installedApk = installAndLaunch(device);
      grantVisiblePermissionDialogs(device);
      selectSafTestDirectory(device);
    } else {
      installedApk = latestApk();
    }
  }
});

afterAll(() => {
  if (device) logcatPath = collectLogcat(device);
  if (installedApk) {
    console.log(`APK installed: ${installedApk.path}`);
    console.log(`APK timestamp: ${installedApk.timestamp.toISOString()}`);
    console.log(`APK size: ${installedApk.size} bytes`);
  }
  if (logcatPath) console.log(`ADB logcat: ${logcatPath}`);
}, 30_000);

describe('Android physical device files', { timeout: 300_000 }, () => {
  it('Files: discovers real PDF, DOCX, and XLSX fixtures through the agent loop', { timeout: 120_000 }, () => {
    const pdfUi = sendQuery(device, 'Find my PDF files.', ['test-document.pdf', 'test-resume.pdf']);
    expect(pdfUi).not.toContain('LAPTOP_ONLY_TEST.pdf');

    const docxUi = sendQuery(device, 'Find my Word files.', ['test-document.docx']);
    expect(docxUi).not.toContain('LAPTOP_ONLY_TEST.pdf');

    const xlsxUi = sendQuery(device, 'Find my Excel files.', ['test-spreadsheet.xlsx']);
    expect(xlsxUi).not.toContain('LAPTOP_ONLY_TEST.pdf');
  });

  it('Files: counts actual phone PDFs and reads the controlled resume marker', { timeout: 240_000 }, () => {
    const countUi = sendQuery(device, 'How many PDF files do I have?', ['2']);
    expect(countUi).toContain('2');

    const resumeUi = sendQuery(device, 'Find my resume.', ['test-resume.pdf']);
    expect(resumeUi).toContain('test-resume.pdf');

    const summaryUi = sendQuery(device, 'Find my resume and summarize it.', ['PHYSICAL_RESUME_MARKER']);
    expect(summaryUi).toContain('PHYSICAL_RESUME_MARKER');
  });

  it('Files: keeps the test scope on the phone and excludes laptop-only data', () => {
    const ui = sendQuery(device, 'Find my latest PDF.', ['test-resume.pdf']);
    expect(ui).not.toContain('LAPTOP_ONLY_TEST.pdf');
    expect(ui).not.toContain('D:\\Foundry');
  });

  it('Files: retains access after an app restart', { timeout: 120_000 }, () => {
    sendQuery(device, 'Find my PDF files.', ['test-resume.pdf']);
    forceStopAndRelaunch(device);
    expect(grantVisiblePermissionDialogs(device)).toBe(0);
    const ui = sendQuery(device, 'Find my PDF files.', ['test-resume.pdf']);
    expect(ui).toContain('content://');
  });
});

describe('Android physical device metadata', { timeout: 120_000 }, () => {
  it('AI: answers a general question through the phone-local model', { timeout: 120_000 }, () => {
    const ui = sendQuery(device, 'What is React?', ['React']);
    expect(ui).not.toContain('Desktop PC Local AI');
    expect(ui).not.toContain('Ollama');
    expect(ui).not.toContain('model is not yet implemented');
  });

  it('Metadata: returns Android system data through the agent loop', () => {
    const ui = sendQuery(device, 'What is my CPU?', ['Android']);
    expect(ui).not.toContain('Microsoft Windows');
    expect(ui).not.toContain('DESKTOP-FOUNDRY');
  });

  it('Metadata: returns phone storage and network data, not laptop data', () => {
    const storageUi = sendQuery(device, 'How much storage do I have?', ['storage']);
    const networkUi = sendQuery(device, 'What is my network status?', ['network']);
    expect(`${storageUi}\n${networkUi}`).not.toContain('C:');
    expect(`${storageUi}\n${networkUi}`).not.toContain('D:');
    expect(`${storageUi}\n${networkUi}`).not.toContain('DESKTOP-FOUNDRY');
  });

  it('Metadata: obtains battery state from the physical phone transport', () => {
    const battery = parseDeviceBattery(device);
    expect(battery.level).toBeGreaterThanOrEqual(0);
    expect(battery.level).toBeLessThanOrEqual(100);
    const ui = sendQuery(device, 'What is my battery level?', [`${battery.level}%`]);
    expect(ui).toContain(`${battery.level}%`);
  });
});

describe('Android physical device permissions and transport', { timeout: 90_000 }, () => {
  it('Permissions: completes a real permission prompt before file access', () => {
    const ui = dumpUi(device);
    expect(ui).not.toContain('Permission controller unavailable');
    expect(sendQuery(device, 'Find my notes.', ['test-notes.txt'])).toContain('test-notes.txt');
  });

  it('Transport: uses the physical phone as the system under test (Wi-Fi or USB)', () => {
    expect(['wireless', 'usb']).toContain(device.transport);
  });
});
