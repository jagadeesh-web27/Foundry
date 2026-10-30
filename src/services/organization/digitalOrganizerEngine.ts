/**
 * Foundry Digital Organizer Engine
 * Solves computer clutter: Duplicate files, large forgotten files, and chaotic Downloads.
 * Follows strict two-phase workflow: Analyze -> Propose Plan -> User Reviews & Confirms.
 * NEVER silently moves or deletes files.
 */

import { db, CleanupProposal, CleanupProposalItem } from '@/services/db/database';
import { computerService } from '@/services/native/computerService';
import { formatBytes } from '@/services/agent/tools';
import { IndexedFile } from '@/types/file';

export interface DuplicateGroup {
  sizeBytes: number;
  sizeFormatted: string;
  files: { name: string; path: string; modifiedAt?: string }[];
  wastedBytes: number;
}

export interface DownloadsBreakdown {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  categories: {
    name: string;
    count: number;
    sizeBytes: number;
    sizeFormatted: string;
    extensions: string[];
  }[];
}

export class DigitalOrganizerEngine {
  /**
   * Identifies candidate duplicate files based on identical byte sizes and matching extensions
   */
  async findDuplicateFiles(): Promise<{
    groups: DuplicateGroup[];
    totalDuplicateCount: number;
    totalWastedBytes: number;
    totalWastedFormatted: string;
  }> {
    let files: IndexedFile[] = [];
    try {
      if (computerService.isTauriEnvironment()) {
        files = await computerService.searchFilesLive({ limit: 500 });
      } else {
        files = await db.getAllIndexedFiles();
      }
    } catch {
      files = await db.getAllIndexedFiles();
    }

    // Group files by size (> 10KB to avoid empty or trivial files)
    const sizeMap = new Map<number, IndexedFile[]>();
    for (const file of files) {
      if (!file.size || file.size < 10240) continue;
      const existing = sizeMap.get(file.size) || [];
      existing.push(file);
      sizeMap.set(file.size, existing);
    }

    const groups: DuplicateGroup[] = [];
    let totalWastedBytes = 0;
    let totalDuplicateCount = 0;

    for (const [size, candidates] of sizeMap.entries()) {
      if (candidates.length > 1) {
        // Additional filter: check if extensions match
        const extGroups = new Map<string, IndexedFile[]>();
        for (const c of candidates) {
          const ext = c.extension.toLowerCase();
          const extList = extGroups.get(ext) || [];
          extList.push(c);
          extGroups.set(ext, extList);
        }

        for (const [, extCandidates] of extGroups.entries()) {
          if (extCandidates.length > 1) {
            const wasted = (extCandidates.length - 1) * size;
            totalWastedBytes += wasted;
            totalDuplicateCount += extCandidates.length - 1;

            groups.push({
              sizeBytes: size,
              sizeFormatted: formatBytes(size),
              files: extCandidates.map((f) => ({ name: f.name, path: f.path, modifiedAt: f.modifiedAt })),
              wastedBytes: wasted,
            });
          }
        }
      }
    }

    groups.sort((a, b) => b.wastedBytes - a.wastedBytes);

    return {
      groups: groups.slice(0, 20),
      totalDuplicateCount,
      totalWastedBytes,
      totalWastedFormatted: formatBytes(totalWastedBytes),
    };
  }

  /**
   * Scans for large files (> 100MB by default) consuming significant drive space
   */
  async findLargeFiles(minSizeBytes: number = 100 * 1024 * 1024): Promise<{
    files: { name: string; path: string; sizeBytes: number; sizeFormatted: string; modifiedAt?: string }[];
    totalBytes: number;
    totalFormatted: string;
  }> {
    let files: IndexedFile[] = [];
    try {
      if (computerService.isTauriEnvironment()) {
        files = await computerService.searchFilesLive({
          sortBy: 'size',
          sortOrder: 'desc',
          limit: 30,
        });
      } else {
        files = await db.getAllIndexedFiles();
      }
    } catch {
      files = await db.getAllIndexedFiles();
    }

    const filtered = files
      .filter((f) => (f.size || 0) >= minSizeBytes)
      .sort((a, b) => (b.size || 0) - (a.size || 0));

    const totalBytes = filtered.reduce((acc, f) => acc + (f.size || 0), 0);

    return {
      files: filtered.slice(0, 25).map((f) => ({
        name: f.name,
        path: f.path,
        sizeBytes: f.size || 0,
        sizeFormatted: formatBytes(f.size || 0),
        modifiedAt: f.modifiedAt,
      })),
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
    };
  }

  /**
   * Classifies files located in Downloads into intuitive categories
   */
  async classifyDownloads(): Promise<DownloadsBreakdown> {
    let files: IndexedFile[] = [];
    try {
      if (computerService.isTauriEnvironment()) {
        files = await computerService.searchFilesLive({ scopePath: 'Downloads', limit: 200 });
      } else {
        const all = await db.getAllIndexedFiles();
        files = all.filter((f) => f.path.toLowerCase().includes('downloads'));
      }
    } catch {
      const all = await db.getAllIndexedFiles();
      files = all.filter((f) => f.path.toLowerCase().includes('downloads'));
    }

    const catDefs = [
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt', 'csv'] },
      { name: 'Installers', extensions: ['exe', 'msi', 'dmg', 'pkg', 'iso'] },
      { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'] },
      { name: 'Videos', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a'] },
      { name: 'Code', extensions: ['js', 'ts', 'py', 'json', 'html', 'css', 'rs', 'cpp'] },
    ];

    const categoryStats = catDefs.map((def) => {
      const matched = files.filter((f) => def.extensions.includes(f.extension.toLowerCase()));
      const sizeBytes = matched.reduce((acc, f) => acc + (f.size || 0), 0);
      return {
        name: def.name,
        count: matched.length,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        extensions: def.extensions,
      };
    });

    const totalSizeBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);

    return {
      totalFiles: files.length,
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes),
      categories: categoryStats.filter((c) => c.count > 0),
    };
  }

  /**
   * Generates a proposed organization plan for cluttered Downloads.
   * Does NOT move any files until explicitly confirmed by the user.
   */
  async proposeDownloadsOrganization(): Promise<CleanupProposal> {
    let files: IndexedFile[] = [];
    try {
      if (computerService.isTauriEnvironment()) {
        files = await computerService.searchFilesLive({ scopePath: 'Downloads', limit: 100 });
      } else {
        const all = await db.getAllIndexedFiles();
        files = all.filter((f) => f.path.toLowerCase().includes('downloads'));
      }
    } catch {
      const all = await db.getAllIndexedFiles();
      files = all.filter((f) => f.path.toLowerCase().includes('downloads'));
    }

    const items: CleanupProposalItem[] = [];
    let totalBytes = 0;

    for (const f of files) {
      const ext = f.extension.toLowerCase();
      let targetSubfolder = 'Other';

      if (['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt'].includes(ext)) {
        targetSubfolder = 'Documents';
      } else if (['exe', 'msi'].includes(ext)) {
        targetSubfolder = 'Installers';
      } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        targetSubfolder = 'Archives';
      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
        targetSubfolder = 'Images';
      } else if (['mp4', 'mkv', 'mov', 'avi'].includes(ext)) {
        targetSubfolder = 'Videos';
      }

      // Propose destination path inside structured subfolder
      const parentDir = f.path.substring(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/')));
      const targetPath = `${parentDir}\\${targetSubfolder}\\${f.name}`;

      items.push({
        sourcePath: f.path,
        targetPath,
        fileName: f.name,
        sizeBytes: f.size || 0,
        category: targetSubfolder,
        action: 'move',
      });

      totalBytes += f.size || 0;
    }

    const proposal: CleanupProposal = {
      id: `prop_${Date.now()}`,
      type: 'downloads_organization',
      title: 'Organize Downloads Folder',
      description: `Propose moving ${items.length} files (${formatBytes(totalBytes)}) into structured subfolders: Documents, Installers, Archives, Images, and Videos.`,
      items: items.slice(0, 50),
      totalBytes,
      status: 'proposed',
      createdAt: new Date().toISOString(),
    };

    await db.saveCleanupProposal(proposal);
    return proposal;
  }
}

export const digitalOrganizerEngine = new DigitalOrganizerEngine();
