/** User-facing names for internal tool identifiers shown as badges on answers. */
const TOOL_LABELS: Record<string, string> = {
  searchFiles: 'Searched files',
  searchFolders: 'Searched folders',
  countFiles: 'Counted files',
  readFile: 'Read file',
  openFile: 'Opened file',
  revealFile: 'Showed in folder',
  getFileMetadata: 'File details',
  getBatteryInformation: 'Battery',
  getDiskInformation: 'Storage',
  getSystemInfo: 'System info',
  getNetworkInformation: 'Network',
  getRunningApplications: 'Running apps',
  getApplicationDetails: 'App details',
  openApplication: 'Open app',
};

export function toolLabel(tool: string): string {
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  // Fallback: "getWhatAmIForgetting" -> "What am I forgetting", "search_calendar" -> "Search calendar"
  const words = tool
    .replace(/^(get|run|do)(?=[A-Z])/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
