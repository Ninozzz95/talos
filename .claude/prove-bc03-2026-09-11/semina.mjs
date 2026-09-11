/**
 * BC-03 — semina uno store di sessioni ISOLATO (mai il 4174) con una famiglia vera:
 * madre + due figlie (una conclusa, una interrotta dal riavvio) + una nipote a profondità 2
 * + una sessione SOLITARIA senza deleghe (per la foto dello stato vuoto).
 * Le due figlie scrivono ENTRAMBE `condiviso.md`: è il caso D3, la collisione.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE = process.argv[2];
const CARTELLA = process.argv[3];
rmSync(STORE, { recursive: true, force: true });
mkdirSync(STORE, { recursive: true });
mkdirSync(CARTELLA, { recursive: true });

const SCHEMA = 1;
function scrivi(sessionId, { padreId = null, profonditaDelega = 0, consegnaCorta, avviataAlle, scrive = [], conclusa = true, chiamate = 0 }) {
  let seq = 0;
  const ev = (type, extra = {}) => ({ type, _sequenza: ++seq, ...extra });
  const righe = [
    {
      tipo: 'intestazione', schema: SCHEMA, sessionId,
      taskId: padreId ? `delega:${padreId}` : 'libero:bc03',
      cartella: CARTELLA,
      task: { consegna: `Sei una sessione di lavoro autonoma.\nCompito: ${consegnaCorta}`, consegnaCorta },
      comandoProva: null, forkDa: null, avviataAlle,
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId, profonditaDelega, provider: 'cloud', runtimeId: null,
      modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true,
    },
    ev('RunStarted', { threadId: sessionId, runId: 'r1' }),
  ];
  /* ⛔ `ToolCallResult`, non `ToolCallStart`: `analizzaEvidenzaDelega` (subagent-orchestrator.mjs:67)
     conta SOLO i risultati — una semina col solo Start dava «0 chiamate» e sembrava un difetto della
     scheda, mentre era la semina a misurare l'evento sbagliato. */
  for (let i = 0; i < chiamate; i += 1) righe.push(ev('ToolCallResult', { toolCallId: `t${i}`, content: 'ok' }));
  for (const percorso of scrive) righe.push(ev('StateDelta', { delta: [{ op: 'add', path: `/file/${percorso}`, value: {} }] }));
  if (conclusa) righe.push(ev('RunFinished', { threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } }));
  writeFileSync(join(STORE, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FIGLIA_A = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const FIGLIA_B = 'cccccccc-3333-4333-8333-cccccccccccc';
const NIPOTE = 'dddddddd-4444-4444-8444-dddddddddddd';
const SOLITARIA = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

scrivi(MADRE, { consegnaCorta: 'Paper tecnico in due parti', avviataAlle: '2026-09-11T09:00:00.000Z' });
scrivi(FIGLIA_A, { padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Scrivi la PARTE 1 di un paper tecnico', avviataAlle: '2026-09-11T09:01:00.000Z', scrive: ['parte-1.md', 'condiviso.md'], chiamate: 7 });
scrivi(FIGLIA_B, { padreId: MADRE, profonditaDelega: 1, consegnaCorta: 'Scrivi la PARTE 2 di un paper tecnico', avviataAlle: '2026-09-11T09:02:00.000Z', scrive: ['condiviso.md'], conclusa: false, chiamate: 3 });
scrivi(NIPOTE, { padreId: FIGLIA_A, profonditaDelega: 2, consegnaCorta: 'Rileggi la bibliografia', avviataAlle: '2026-09-11T09:03:00.000Z', scrive: ['bibliografia.md'] });
scrivi(SOLITARIA, { consegnaCorta: 'Sessione senza nessuna delega', avviataAlle: '2026-09-11T09:04:00.000Z' });

console.log(JSON.stringify({ STORE, CARTELLA, MADRE, FIGLIA_A, FIGLIA_B, NIPOTE, SOLITARIA }, null, 2));
