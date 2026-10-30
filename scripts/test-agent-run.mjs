// Test dynamicAgent.run via CDP in the running WebView
const query = process.argv[2] || 'What is my battery level?';

const res = await fetch('http://127.0.0.1:9225/json');
const targets = await res.json();
const page = targets.find(t => t.type === 'page');
if (!page) {
  console.error('No page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `
        (async () => {
          try {
            // Find AppContext or agent
            const mod = await import('/src/services/agent/dynamicAgent.ts');
            const aiMod = await import('/src/services/ai/aiService.ts');
            const agent = mod.dynamicAgent;
            const aiService = new aiMod.AIService({
              provider: 'android_local',
              endpoint: 'android-local://',
              model: 'foundry-android-local-model'
            });
            agent.aiService = aiService;
            const res = await agent.run(${JSON.stringify(query)}, {
              indexedFiles: [],
              indexedFolders: [],
              openFile: async () => false,
              revealFile: async () => false
            });
            return { success: true, res };
          } catch (e) {
            return { success: false, error: e.message || String(e), stack: e.stack };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    }
  }));
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.id === 1) {
    if (msg.result?.exceptionDetails) {
      console.error('Exception:', JSON.stringify(msg.result.exceptionDetails, null, 2));
    } else {
      console.log('Agent Result:\n', JSON.stringify(msg.result?.result?.value, null, 2));
    }
    ws.close();
    process.exit(0);
  }
});
