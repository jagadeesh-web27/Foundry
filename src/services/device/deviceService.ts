/**
 * Foundry Unified Device Service
 * Selects the active DeviceInterface adapter based on host platform and exposes unified access.
 */

import { DeviceInterface } from './deviceInterface';
import { WindowsDeviceAdapter } from './windowsDeviceAdapter';
import { AndroidDeviceAdapter } from './androidDeviceAdapter';
import { WebFallbackDeviceAdapter } from './webFallbackDeviceAdapter';

class DeviceServiceManager {
  private activeAdapter: DeviceInterface;

  constructor() {
    this.activeAdapter = this.detectAdapter();
  }

  private detectAdapter(): DeviceInterface {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    // 1. Tauri Android — MUST be checked before generic Tauri/Desktop.
    //    On Tauri Mobile, __TAURI_INTERNALS__ IS set, but the user-agent contains 'android'.
    //    If we don't check this first, Android gets routed to WindowsDeviceAdapter
    //    which calls Windows-only Rust commands that fail silently → empty data.
    if (isTauri && userAgent.includes('android')) {
      console.log('[DeviceService] Detected: Tauri Android — using AndroidDeviceAdapter');
      return new AndroidDeviceAdapter();
    }

    // 2. Tauri Desktop (Windows / macOS / Linux)
    if (isTauri) {
      console.log('[DeviceService] Detected: Tauri Desktop — using WindowsDeviceAdapter');
      return new WindowsDeviceAdapter();
    }

    // 3. Non-Tauri Android (e.g. plain browser on Android phone)
    if (userAgent.includes('android')) {
      console.log('[DeviceService] Detected: Browser Android — using AndroidDeviceAdapter');
      return new AndroidDeviceAdapter();
    }

    // 4. Fallback to Web / Test adapter
    console.log('[DeviceService] Detected: Web/Browser — using WebFallbackDeviceAdapter');
    return new WebFallbackDeviceAdapter();
  }

  public getAdapter(): DeviceInterface {
    return this.activeAdapter;
  }

  /**
   * For testing or dynamic switching
   */
  public setAdapter(adapter: DeviceInterface): void {
    this.activeAdapter = adapter;
  }
}

export const deviceService = new DeviceServiceManager();
