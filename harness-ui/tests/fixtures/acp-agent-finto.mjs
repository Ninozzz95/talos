// P-L · processo di prova; nessuna rete e nessun modello reale.
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';

const [modo, diario] = process.argv.slice(2);
const scrivi = messaggio => {
  const m = { jsonrpc: '2.0', ...messaggio };
  annota({ direzione: 'agente', messaggio: m });
  process.stdout.write(`${JSON.stringify(m)}\n`);
};
const annota = dato => appendFileSync(diario, `${JSON.stringify(dato)}\n`);
const aggiorna = update => scrivi({ method: 'session/update', params: { sessionId: 'prova', update } });
let promptId;
annota({ pid: process.pid, cwd: process.cwd(), ambiente: Object.keys(process.env),
  dichiarata: process.env.PL_CHIAVE_DICHIARATA === 'segreto-finto-pl',
  vietata: Boolean(process.env.PL_CHIAVE_VIETATA || process.env.NODE_OPTIONS) });
process.stderr.write('stderr-finto-con-segreto-finto-pl\n');
createInterface({ input: process.stdin }).on('line', linea => {
  const m = JSON.parse(linea);
  annota(m);
  if (m.method === 'initialize') {
    if (modo === 'handshake-fermo') return;
    scrivi({ id: m.id, result: { protocolVersion: modo === 'versione' ? 999 : 1,
      agentCapabilities: {}, authMethods: [], agentInfo: { name: 'agente-finto', title: 'Agente di prova', version: '1.0.0' } } });
  } else if (m.method === 'session/new') {
    scrivi({ id: m.id, result: { sessionId: 'prova' } });
  } else if (m.method === 'session/prompt') {
    promptId = m.id;
    if (modo === 'permesso' || modo === 'permesso-senza-rifiuto') {
      scrivi({ id: 'permesso-1', method: 'session/request_permission', params: {
        sessionId: 'prova', toolCall: { toolCallId: 'azione-1' }, options: [
          { optionId: 'si', name: 'Consenti', kind: 'allow_once' },
          ...(modo === 'permesso' ? [{ optionId: 'no', name: 'Rifiuta', kind: 'reject_once' }] : []),
        ],
      } });
      return;
    }
    if (modo === 'rpc-fs') {
      scrivi({ id: 'fs-1', method: 'fs/read_text_file', params: { sessionId: 'prova', path: '/vietato' } });
      return;
    }
    if (modo === 'sessione-estranea') {
      scrivi({ method: 'session/update', params: { sessionId: 'altra', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Intruso' } } } });
      return;
    }
    if (modo === 'malformato') { process.stdout.write('non-json\n'); return; }
    if (modo === 'forma-invalida') { process.stdout.write('{"jsonrpc":"9.9","result":false}\n'); return; }
    if (modo === 'errore') { scrivi({ id: m.id, error: { code: -32603, message: 'segreto-finto-pl' } }); return; }
    aggiorna({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: modo === 'segreti' ? 'segreto-' : 'Prima ' } });
    if (modo === 'muore') { process.exit(7); }
    if (modo === 'stop' || modo === 'ignora-stop') return;
    aggiorna({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: modo === 'segreti' ? 'finto-pl' : 'dopo.' } });
    aggiorna({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Riflessione.' } });
    aggiorna({ sessionUpdate: 'tool_call', toolCallId: 'azione-1', title: 'Lettura', kind: 'read', status: 'in_progress' });
    aggiorna({ sessionUpdate: 'tool_call_update', toolCallId: 'azione-1', status: 'completed' });
    scrivi({ id: m.id, result: { stopReason: ['max_tokens', 'refusal'].includes(modo) ? modo : 'end_turn' } });
  } else if (m.method === 'session/cancel') {
    if (modo !== 'ignora-stop') scrivi({ id: promptId, result: { stopReason: 'cancelled' } });
  } else if (m.id === 'permesso-1' || m.id === 'fs-1') {
    aggiorna({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Operazione rifiutata.' } });
    scrivi({ id: promptId, result: { stopReason: 'end_turn' } });
  }
}).on('close', () => { if (modo !== 'ignora-stop') process.exit(0); });
if (modo === 'ignora-stop') setInterval(() => {}, 1000);
