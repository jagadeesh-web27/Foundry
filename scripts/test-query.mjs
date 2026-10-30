import { execSync } from 'child_process';

const query = process.argv[2] || 'What is React?';

function adb(cmd) {
  return execSync(`adb -s 192.168.5.178:5555 ${cmd}`, { encoding: 'utf8' });
}

function dumpUi() {
  adb('shell uiautomator dump /sdcard/dump.xml');
  return adb('exec-out cat /sdcard/dump.xml');
}

console.log(`Sending query: "${query}"`);

// Focus input: bounds are [44,2026][1036,2153], center ~ 540, 2090
adb('shell input tap 540 2090');
adb('shell sleep 0.5');

// Clear existing text if any and type new text
// In Android, sending text with spaces requires %s
const encoded = query.replace(/ /g, '%s');
adb(`shell input text "${encoded}"`);
adb('shell sleep 0.5');

// Tap send button: bounds are [918,2046][1009,2136], center ~ 963, 2091
adb('shell input tap 963 2091');

console.log('Query sent, waiting for response...');

let lastResponse = '';
const startTime = Date.now();
while (Date.now() - startTime < 30000) {
  adb('shell sleep 1.5');
  const xml = dumpUi();
  const textMatches = [...xml.matchAll(/text="([^"]+)"/g)].map(m => m[1]);
  // Find messages after the user query
  const queryIdx = textMatches.lastIndexOf(query);
  if (queryIdx !== -1 && queryIdx < textMatches.length - 1) {
    const candidate = textMatches[queryIdx + 1];
    if (candidate && !candidate.includes('Copy response') && !candidate.includes('Regenerate') && candidate.length > 5) {
      lastResponse = candidate;
      console.log(`\n[RESPONSE RECEIVED]:\n${candidate}\n`);
      break;
    }
  }
}

if (!lastResponse) {
  console.log('No response received within timeout. Full texts:');
  const xml = dumpUi();
  const texts = [...xml.matchAll(/text="([^"]+)"/g)].map(m => m[1]);
  console.log(texts.slice(-10));
}
