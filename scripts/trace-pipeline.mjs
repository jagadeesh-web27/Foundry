import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const queries = [
  'What is React?',
  'Find my resume.',
  'How many PDF files do I have?',
  'Find my Word documents.',
  'Find my Excel files.',
  'Read my resume.',
  'What is my battery level?'
];

function runAdb(args) {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch {
    return '';
  }
}

function runCdp(action, param) {
  try {
    const args = ['scripts/cdp-query.mjs', action];
    if (param !== undefined) args.push(param);
    return execFileSync('node', args, { encoding: 'utf8', timeout: 35000 }).trim();
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== STARTING PIPELINE TRACE RUNNER ===');
  
  // Ensure forward is set
  const pid = runAdb(['shell', 'pidof', 'com.foundry.app.debug']).trim();
  if (!pid) {
    console.error('App is not running!');
    process.exit(1);
  }
  console.log(`App PID: ${pid}`);
  runAdb(['forward', 'tcp:9225', `localabstract:webview_devtools_remote_${pid}`]);

  const allTraces = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.log(`\n======================================================`);
    console.log(`RUNNING QUERY [${i + 1}/${queries.length}]: "${query}"`);
    console.log(`======================================================`);

    // Clear logcat buffer for clean per-query capture
    runAdb(['logcat', '-c']);

    // Get current state
    const beforeRaw = runCdp('latest');
    let beforeCount = 0;
    try {
      beforeCount = JSON.parse(beforeRaw)?.count ?? 0;
    } catch {}

    // Send query
    console.log(`[Step] Sending query via CDP...`);
    const sendResult = runCdp('send', query);
    console.log(`[Step] Send result:`, sendResult);

    // Wait for response
    const startTime = Date.now();
    let completed = false;
    let finalLatest = null;

    while (Date.now() - startTime < 130000) {
      await sleep(1500);
      const latestRaw = runCdp('latest');
      try {
        const state = JSON.parse(latestRaw);
        if (state && !state.isThinking && state.count > beforeCount) {
          // Double-check after a brief pause to ensure a second turn hasn't begun
          await sleep(2000);
          const verifyRaw = runCdp('latest');
          const verifyState = JSON.parse(verifyRaw);
          if (verifyState?.isThinking) {
            continue;
          }
          finalLatest = verifyState || state;
          completed = true;
          break;
        }
      } catch {}
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[Step] Completed in ${elapsedMs}ms: completed=${completed}`);

    // Grab logs
    const logcat = runAdb(['logcat', '-d']);
    const traceLines = logcat.split('\n').filter(l => l.includes('PIPELINE_TRACE') || l.includes('FoundryAndroidAI') || l.includes('AndroidFiles'));

    const traceData = {
      index: i + 1,
      query,
      elapsedMs,
      completed,
      uiMessage: finalLatest?.latestText ?? 'NO_UI_RESPONSE',
      logs: traceLines
    };

    allTraces.push(traceData);
    console.log(`[UI Final Answer]:\n${traceData.uiMessage}\n`);
    console.log(`[Captured Pipeline Trace Log Count]: ${traceLines.length}`);
    traceLines.forEach(l => console.log('  ' + l.trim()));
    
    // Brief settle time between queries
    await sleep(2000);
  }

  writeFileSync('artifacts/pipeline-trace-results.json', JSON.stringify(allTraces, null, 2), 'utf8');
  console.log('\nPipeline trace completed. Saved to artifacts/pipeline-trace-results.json');
}

main().catch(console.error);
