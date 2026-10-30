import { describe, expect, it } from 'vitest';
import { androidReport, connectedPhysicalDevice } from './android-test-utils';

describe('Foundry physical Android device', () => {
  it('requires an authorized physical phone over ADB (Wi-Fi or USB)', () => {
    const device = connectedPhysicalDevice();
    expect(['wireless', 'usb']).toContain(device.transport);
    expect(device.model).not.toBe('');
    expect(device.androidVersion).not.toBe('');

    const transportLabel = device.transport === 'wireless' ? 'Wi-Fi' : 'USB';

    console.log([
      'Foundry Android Device',
      '────────────────────────────',
      `Model: ${device.model}`,
      `Android: ${device.androidVersion}`,
      'ADB: Connected',
      `Transport: ${transportLabel}`,
      'Physical device: YES',
      'Authorized: YES',
      `Serial: ${device.serial}`,
      '────────────────────────────',
    ].join('\n'));

    console.log(androidReport({
      adbConnection: true,
      physicalDevice: true,
      emulatorRejected: true,
      deviceAuthorized: true,
    }, transportLabel));
  }, 30_000);
});
