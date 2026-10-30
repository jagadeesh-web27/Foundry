import { execSync } from 'child_process';

try {
  const xml = execSync('adb -s 192.168.5.178:5555 exec-out cat /sdcard/dump.xml', { encoding: 'utf8' });
  const regex = /text="([^"]*)"[^>]*bounds="\[([^\]]+)\]\[([^\]]+)\]"/g;
  let match;
  console.log('--- UI Nodes ---');
  while ((match = regex.exec(xml)) !== null) {
    if (match[1].trim()) {
      console.log(`Text: "${match[1]}" | Bounds: [${match[2]}][${match[3]}]`);
    }
  }
} catch (e) {
  console.error(e);
}
