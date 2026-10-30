import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownText } from '@/components/chat/MarkdownText';
import { toolLabel } from '@/components/chat/toolLabels';
import { pickAndroidUserStorage } from '@/services/device/androidDeviceAdapter';
import type { DiskInfo } from '@/services/native/computerService';

const md = (text: string) => renderToStaticMarkup(React.createElement(MarkdownText, { text }));

describe('MarkdownText renders model answers safely', () => {
  it('renders bold, lists and code', () => {
    expect(md('Battery level: **100%** (charging).')).toContain('<strong>100%</strong>');
    expect(md('- one\n- two')).toMatch(/<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
    expect(md('1. first\n2. second')).toMatch(/<ol[^>]*><li>first<\/li><li>second<\/li><\/ol>/);
    expect(md('```\nconst x = 1;\n```')).toContain('const x = 1;');
  });

  it('keeps underscores and asterisks inside words (file names, identifiers)', () => {
    expect(md('Known marker: PHYSICAL_RESUME_MARKER')).toContain('PHYSICAL_RESUME_MARKER');
    expect(md('Found my_resume_2026.pdf')).toContain('my_resume_2026.pdf');
    expect(md('2*3*4 = 24')).toContain('2*3*4');
    expect(md('this is _italic_ text')).toContain('<em>italic</em>');
  });

  it('never injects raw HTML from the model', () => {
    const html = md('<img src=x onerror=alert(1)> **ok**');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('tool labels are human readable', () => {
  it('maps known tools and humanizes unknown ones', () => {
    expect(toolLabel('getBatteryInformation')).toBe('Battery');
    expect(toolLabel('searchFiles')).toBe('Searched files');
    expect(toolLabel('getWhatAmIForgetting')).toBe('What am i forgetting');
    expect(toolLabel('search_calendar')).toBe('Search calendar');
  });
});

describe('Android storage picks the user-data volume', () => {
  const d = (drive: string, totalGb: number, freeGb: number): DiskInfo => ({
    drive,
    volumeName: drive,
    totalBytes: totalGb * 1024 ** 3,
    totalFormatted: `${totalGb} GB`,
    freeBytes: freeGb * 1024 ** 3,
    freeFormatted: `${freeGb} GB`,
    usedBytes: (totalGb - freeGb) * 1024 ** 3,
    usedFormatted: `${totalGb - freeGb} GB`,
    percentageUsed: totalGb ? ((totalGb - freeGb) / totalGb) * 100 : 0,
    percentageFree: totalGb ? (freeGb / totalGb) * 100 : 0,
    fileSystem: 'f2fs',
  });

  it('ignores system images and empty mounts (real list from a vivo I2302)', () => {
    const disks = [d('/', 4.22, 0), d('/mnt/user/0/emulated', 0, 0), d('/vendor', 1.97, 0), d('/product', 1.61, 0), d('/data', 225.88, 165.98), d('/storage/emulated', 225.88, 165.98), d('/apex/com.android.art', 0.04, 0)];
    const picked = pickAndroidUserStorage(disks);
    expect(picked?.drive).toBe('Phone storage');
    expect(picked?.totalFormatted).toBe('225.88 GB');
    expect(picked?.freeFormatted).toBe('165.98 GB');
  });

  it('returns null when nothing usable is reported', () => {
    expect(pickAndroidUserStorage([d('/config', 0, 0)])).toBeNull();
  });
});
