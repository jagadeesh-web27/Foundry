import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { audioRecorder } from '@/services/voice/audioRecorder';
import { accessibilityEngine } from '@/services/accessibility/accessibilityEngine';
import { developerEngine } from '@/services/developer/developerEngine';
import { productivityEngine } from '@/services/productivity/productivityEngine';
import { memoryEngine } from '@/services/memory/memoryEngine';
import { toolRegistry } from '@/services/tools/toolRegistry';

describe('Foundry Voice & Speech Input Architecture', () => {
  it('encodes Float32 samples into valid 16kHz 16-bit mono PCM WAV buffer', () => {
    // 16000 samples = 1 second of audio at 16kHz
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i++) {
      // 440 Hz sine wave
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    // Call private encodeWav via any cast to test encoding correctness
    const wavBytes: Uint8Array = (audioRecorder as any).encodeWav(samples, sampleRate);

    // Verify WAV header
    expect(wavBytes.length).toBe(44 + sampleRate * 2); // 44 byte header + 16-bit (2 bytes per sample)

    const textDecoder = new TextDecoder();
    const riff = textDecoder.decode(wavBytes.slice(0, 4));
    expect(riff).toBe('RIFF');

    const wave = textDecoder.decode(wavBytes.slice(8, 12));
    expect(wave).toBe('WAVE');

    const fmt = textDecoder.decode(wavBytes.slice(12, 16));
    expect(fmt).toBe('fmt ');

    const data = textDecoder.decode(wavBytes.slice(36, 40));
    expect(data).toBe('data');

    // Check DataView fields
    const view = new DataView(wavBytes.buffer);
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(1); // Mono channel
    expect(view.getUint32(24, true)).toBe(16000); // 16000 Hz
    expect(view.getUint16(34, true)).toBe(16); // 16 bits per sample
  });
});

describe('Foundry Accessibility Engine & WCAG 2.2 Analysis', () => {
  it('accurately calculates contrast ratio for black on white', () => {
    const res = accessibilityEngine.calculateContrast('#000000', '#ffffff');
    expect(res.ratio).toBe(21);
    expect(res.aaNormal).toBe(true);
    expect(res.aaaNormal).toBe(true);
  });

  it('fails low contrast colors for WCAG AA normal text', () => {
    // Light gray text on white
    const res = accessibilityEngine.calculateContrast('#cccccc', '#ffffff');
    expect(res.ratio).toBeLessThan(4.5);
    expect(res.aaNormal).toBe(false);
  });

  it('audits HTML snippets for missing alt text and button labels', () => {
    const badHtml = `
      <div>
        <img src="avatar.png" />
        <button></button>
        <input type="text" id="username" />
      </div>
    `;

    const report = accessibilityEngine.auditHtml(badHtml);
    expect(report.passed).toBe(false);
    expect(report.violationCount).toBeGreaterThanOrEqual(3);

    const ruleIds = report.violations.map((v) => v.id);
    expect(ruleIds).toContain('missing-alt');
    expect(ruleIds).toContain('empty-button');
    expect(ruleIds).toContain('missing-input-label');
  });

  it('passes accessible HTML adhering to WCAG guidelines', () => {
    const accessibleHtml = `
      <main>
        <h1>Foundry Assistant</h1>
        <img src="logo.png" alt="Foundry Company Logo" />
        <label for="search-box">Search files</label>
        <input type="text" id="search-box" />
        <button type="submit">Execute Query</button>
      </main>
    `;

    const report = accessibilityEngine.auditHtml(accessibleHtml);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.violationCount).toBe(0);
  });
});

describe('Foundry Developer Engine', () => {
  it('diagnoses common development and build issues', async () => {
    const portError = 'Error: listen EADDRINUSE: address already in use :::3000';
    const portDiag = await developerEngine.explainBuildError(portError);
    expect(portDiag.errorType).toBe('Port Conflict (EADDRINUSE)');
    expect(portDiag.suggestedFix).toContain('3000');

    const tsError = "error TS2322: Type 'string' is not assignable to type 'number'";
    const tsDiag = await developerEngine.explainBuildError(tsError);
    expect(tsDiag.errorType).toBe('TypeScript Type Error');

    const rustError = 'error[E0382]: use of moved value: `stream`';
    const rustDiag = await developerEngine.explainBuildError(rustError);
    expect(rustDiag.errorType).toBe('Rust Borrow Checker Error (E0382)');
  });
});

describe('Foundry Productivity Engine & Tasks', () => {
  it('creates, lists, and updates task statuses', async () => {
    const task = await productivityEngine.createTask({
      title: 'Finish Accessibility Audit for Client',
      priority: 'high',
      dueDate: '2026-10-01',
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('high');

    const updated = await productivityEngine.updateTaskStatus(task.id, 'done');
    expect(updated).toBe(true);

    const list = await productivityEngine.listTasks();
    const found = list.find((t) => t.id === task.id);
    expect(found?.status).toBe('done');

    // Clean up
    await productivityEngine.deleteTask(task.id);
  });

  it('generates a morning daily briefing with real device status', async () => {
    const briefing = await productivityEngine.getDailyBriefing();
    expect(briefing.date).toBeDefined();
    expect(briefing.systemSummary).toBeDefined();
    expect(Array.isArray(briefing.tasksDueToday)).toBe(true);
    expect(Array.isArray(briefing.recentFilesModified)).toBe(true);
  });
});

describe('Foundry Memory Engine (5 Tiers)', () => {
  it('stores and selectively recalls personal preferences and project memories', async () => {
    await memoryEngine.save({
      key: 'user_preferred_theme',
      tier: 'preference',
      content: 'User prefers high-contrast dark mode with keyboard shortcuts',
      confidence: 1.0,
    });

    const recalled = await memoryEngine.recall('theme preferences');
    expect(recalled.length).toBeGreaterThan(0);
    expect(recalled[0].key).toBe('user_preferred_theme');

    const context = await memoryEngine.getRelevantContext('What theme should I render?');
    expect(context).toContain('high-contrast dark mode');
  });
});

describe('Foundry Central Tool Registry', () => {
  it('registers tools with input schemas, categories, and permission levels', () => {
    const tools = toolRegistry.getAllTools();
    expect(tools.length).toBeGreaterThan(0);

    const openAppTool = toolRegistry.getTool('openApplication');
    expect(openAppTool).toBeDefined();
    expect(openAppTool?.permissionLevel).toBe('ACTION');
    expect(openAppTool?.category).toBe('applications');

    const sysInfoTool = toolRegistry.getTool('getSystemInfo');
    expect(sysInfoTool).toBeDefined();
    expect(sysInfoTool?.permissionLevel).toBe('READ');

    const searchFilesTool = toolRegistry.getTool('searchFiles');
    expect(searchFilesTool).toBeDefined();
    expect(searchFilesTool?.permissionLevel).toBe('READ');
  });
});
