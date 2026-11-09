// Un aiutante MCP finto su stdio, per le prove di `aiutante-mcp.mjs`: risponde a initialize e a tools/call, mai allo schermo vero.
// `tools/call` con name 'ambiente' torna le chiavi d'ambiente che ha ricevuto; 'eco' torna gli argomenti; 'lento' non risponde mai.
let resto = '';
process.stdin.setEncoding('utf8');
const manda = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
process.stdin.on('data', (d) => {
  resto += d;
  for (let i = resto.indexOf('\n'); i >= 0; i = resto.indexOf('\n')) {
    const m = JSON.parse(resto.slice(0, i)); resto = resto.slice(i + 1);
    if (m.method === 'initialize') manda({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'finto', version: '0' } } });
    else if (m.method === 'tools/call') {
      const n = m.params?.name;
      if (n === 'lento') continue;
      if (n === 'ambiente') manda({ jsonrpc: '2.0', id: m.id, result: { content: [], structuredContent: { chiavi: Object.keys(process.env) } } });
      else manda({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'image', data: 'QUJD', mimeType: 'image/png' }], structuredContent: { nome: n, argomenti: m.params?.arguments ?? null } } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
