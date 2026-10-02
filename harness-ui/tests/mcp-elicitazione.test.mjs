/*
 * Elicitation MCP (owner 02/10/2026: «patch del kernel al desktop, poi la CLI»; mockup step-17 «server MCP che chiedono»).
 * Un server MCP può chiedere alla persona dati (modo `form`, schema piatto) o di aprire una pagina (modo `url`) durante una
 * chiamata d'attrezzo: `elicitation/create` (spec MCP; SDK `@modelcontextprotocol/client` v2: capacità nel costruttore,
 * `setRequestHandler('elicitation/create', …)`, risposta `{action: accept|decline|cancel, content?}`).
 * Ricerca nel registro 12: Claude Code 2.1.281 dichiara la capacità; Codex mostra form/url nel pannello domande e non apre
 * mai un URL da solo; Gemini CLI «Method not found» quando non la gestisce; Codex app-server #45621 rifiuta in automatico
 * (anti-modello). ⇒ la capacità si dichiara SOLO se qualcuno può rispondere; la richiesta e la chiusura sono eventi; il
 * contenuto si valida contro lo schema.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { connettiServerMcp } from '../src/mcp-client.mjs';
import { validaRichiestaElicitazione, validaRispostaElicitazione } from '../src/mcp-elicitation-contract.mjs';

function finto() {
  const visti = { costruttore: null, gestori: new Map() };
  class ClientFinto {
    constructor(info, opzioni) { visti.costruttore = { info, opzioni }; }
    setRequestHandler(metodo, gestore) { visti.gestori.set(metodo, gestore); }
    async connect() {}
    async close() {}
  }
  class TransportFinto { constructor() {} }
  return { visti, deps: { ClientCls: ClientFinto, TransportCls: TransportFinto } };
}

test('con chi risponde il client dichiara elicitation form+url e inoltra la richiesta; senza, non dichiara nulla', async () => {
  const con = finto();
  const ricevute = [];
  await connettiServerMcp({ comando: 'x' }, { ...con.deps, onElicitazione: async (parametri) => { ricevute.push(parametri); return { action: 'decline' }; } });
  assert.deepEqual(con.visti.costruttore.opzioni?.capabilities?.elicitation, { form: {}, url: {} });
  const gestore = con.visti.gestori.get('elicitation/create');
  assert.equal(typeof gestore, 'function');
  const esito = await gestore({ params: { mode: 'form', message: 'Title?', requestedSchema: { type: 'object', properties: { title: { type: 'string' } } } } });
  assert.deepEqual(esito, { action: 'decline' });
  assert.equal(ricevute[0].message, 'Title?');
  const senza = finto();
  await connettiServerMcp({ comando: 'x' }, senza.deps);
  assert.equal(senza.visti.costruttore.opzioni?.capabilities?.elicitation, undefined, 'Gemini #22249: mai dichiarare ciò che non si gestisce');
  assert.equal(senza.visti.gestori.has('elicitation/create'), false);
});

test('la richiesta form: schema piatto di primitivi; url: https con dominio e id; il resto è rifiutato', () => {
  const form = validaRichiestaElicitazione({ mode: 'form', message: 'Details for the PR', requestedSchema: { type: 'object', required: ['title'], properties: {
    title: { type: 'string', title: 'Title', maxLength: 80 }, draft: { type: 'boolean', default: true }, reviewers: { type: 'array', items: { type: 'string', enum: ['ana', 'bo'] } },
    priority: { type: 'string', enum: ['low', 'high'] }, count: { type: 'integer', minimum: 1 } } } });
  assert.equal(form.mode, 'form');
  assert.deepEqual(Object.keys(form.requestedSchema.properties), ['title', 'draft', 'reviewers', 'priority', 'count']);
  /* senza `mode` è un form (spec: retrocompatibile) */
  assert.equal(validaRichiestaElicitazione({ message: 'x', requestedSchema: { type: 'object', properties: {} } }).mode, 'form');
  const url = validaRichiestaElicitazione({ mode: 'url', message: 'Sign in to Linear', url: 'https://linear.app/oauth/authorize?x=1', elicitationId: 'e-1' });
  assert.deepEqual([url.mode, url.dominio, url.elicitationId], ['url', 'linear.app', 'e-1']);
  for (const male of [
    { mode: 'url', message: 'x', url: 'http://linear.app/', elicitationId: 'e' },
    { mode: 'url', message: 'x', url: 'javascript:alert(1)', elicitationId: 'e' },
    { mode: 'url', message: 'x', url: 'https://linear.app/' },
    { mode: 'form', message: 'x', requestedSchema: { type: 'object', properties: { a: { type: 'object', properties: {} } } } },
    { mode: 'form', message: 'x' },
    { mode: 'boh', message: 'x', requestedSchema: { type: 'object', properties: {} } },
    { mode: 'form', message: '', requestedSchema: { type: 'object', properties: {} } },
  ]) assert.throws(() => validaRichiestaElicitazione(male), (e) => e.code === 'ELICITATION_INVALID', JSON.stringify(male));
});

test('la risposta: accept porta il contenuto valido per lo schema; decline e cancel nessun contenuto', () => {
  const richiesta = validaRichiestaElicitazione({ mode: 'form', message: 'x', requestedSchema: { type: 'object', required: ['title'], properties: {
    title: { type: 'string' }, draft: { type: 'boolean' }, reviewers: { type: 'array', items: { type: 'string', enum: ['ana', 'bo'] } }, count: { type: 'integer' } } } });
  assert.deepEqual(validaRispostaElicitazione({ action: 'accept', content: { title: 'Fix', draft: false, reviewers: ['ana'], count: 2 } }, richiesta),
    { action: 'accept', content: { title: 'Fix', draft: false, reviewers: ['ana'], count: 2 } });
  assert.deepEqual(validaRispostaElicitazione({ action: 'decline' }, richiesta), { action: 'decline' });
  assert.deepEqual(validaRispostaElicitazione({ action: 'cancel' }, richiesta), { action: 'cancel' });
  for (const male of [
    { action: 'accept', content: { draft: true } },
    { action: 'accept', content: { title: 3 } },
    { action: 'accept', content: { title: 'x', reviewers: ['zed'] } },
    { action: 'accept', content: { title: 'x', count: 1.5 } },
    { action: 'accept', content: { title: 'x', extra: 1 } },
    { action: 'decline', content: { title: 'x' } },
    { action: 'maybe' },
  ]) assert.throws(() => validaRispostaElicitazione(male, richiesta), (e) => e.code === 'ELICITATION_ANSWER_INVALID', JSON.stringify(male));
  const url = validaRichiestaElicitazione({ mode: 'url', message: 'x', url: 'https://a.example/', elicitationId: 'e' });
  assert.deepEqual(validaRispostaElicitazione({ action: 'accept' }, url), { action: 'accept' }, 'url: accept senza contenuto');
  assert.throws(() => validaRispostaElicitazione({ action: 'accept', content: { a: 1 } }, url), (e) => e.code === 'ELICITATION_ANSWER_INVALID');
});

/* ─── il registro: la richiesta si lega alla sessione, la persona risponde, uno stop la chiude ─── */
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

function registroDiProva() {
  const giri = [];
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError('no'); return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'apri la PR' } }; },
    avviaSessioneFn(input) { let risolvi; const p = new Promise((r) => { risolvi = r; }); giri.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return p; } });
  return { registro, giri };
}
const MODULO = { mode: 'form', message: 'Details for the pull request', requestedSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, draft: { type: 'boolean' } } } };

test('MCP-ELICIT-REGISTRY: la richiesta diventa un evento della sessione, la risposta torna al server validata', async () => {
  const { registro, giri } = registroDiProva();
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(typeof giri[0].input.onElicitazioneMcp, 'function', 'con una persona la sessione può rispondere');
  const attesa = giri[0].input.onElicitazioneMcp({ server: 'github', parametri: MODULO });
  const richiesta = registro.esporta(sessionId).eventi.find((e) => e.type === 'McpElicitationRequested');
  assert.equal(richiesta.server, 'github');
  assert.equal(richiesta.mode, 'form');
  assert.equal(richiesta.message, 'Details for the pull request');
  assert.deepEqual(Object.keys(richiesta.requestedSchema.properties), ['title', 'draft']);
  assert.equal(typeof richiesta.requestId, 'string');
  const rifiuto = await registro.rispondiElicitazioneMcp(sessionId, richiesta.requestId, { action: 'accept', content: { draft: true } });
  assert.equal(rifiuto.code, 'ELICITATION_ANSWER_INVALID', 'un contenuto fuori schema non arriva al server');
  assert.deepEqual(await registro.rispondiElicitazioneMcp(sessionId, richiesta.requestId, { action: 'accept', content: { title: 'Fix login', draft: false } }), { ok: true });
  assert.deepEqual(await attesa, { action: 'accept', content: { title: 'Fix login', draft: false } });
  const chiusa = registro.esporta(sessionId).eventi.find((e) => e.type === 'McpElicitationResolved');
  assert.deepEqual([chiusa.requestId, chiusa.action, chiusa.da], [richiesta.requestId, 'accept', 'persona']);
  assert.equal(JSON.stringify(chiusa).includes('Fix login'), false, 'il contenuto va al server, non nella cronologia');
  assert.equal((await registro.rispondiElicitazioneMcp(sessionId, richiesta.requestId, { action: 'decline' })).code, 'ELICITATION_NOT_PENDING');
});

test('MCP-ELICIT-STOP-AND-HEADLESS: uno stop la chiude con cancel; una richiesta non valida è rifiutata; senza persona nessuna capacità', async () => {
  const { registro, giri } = registroDiProva();
  const { sessionId } = registro.avvia('task-vero');
  assert.deepEqual(await giri[0].input.onElicitazioneMcp({ server: 'x', parametri: { mode: 'url', message: 'm', url: 'http://insecure.example/' } }), { action: 'cancel' }, 'una richiesta non valida non arriva alla persona');
  const attesa = giri[0].input.onElicitazioneMcp({ server: 'linear', parametri: { mode: 'url', message: 'Sign in', url: 'https://linear.app/oauth', elicitationId: 'e-1' } });
  const richiesta = registro.esporta(sessionId).eventi.findLast((e) => e.type === 'McpElicitationRequested');
  assert.deepEqual([richiesta.mode, richiesta.dominio, richiesta.url], ['url', 'linear.app', 'https://linear.app/oauth']);
  registro.ferma(sessionId);
  assert.deepEqual(await attesa, { action: 'cancel' });
  const chiusa = registro.esporta(sessionId).eventi.findLast((e) => e.type === 'McpElicitationResolved');
  assert.deepEqual([chiusa.action, chiusa.motivo], ['cancel', 'fermato']);
  const senza = registroDiProva();
  senza.registro.avvia('task-vero', { senzaInterfaccia: true });
  assert.equal(senza.giri[0].input.onElicitazioneMcp, undefined, 'Gemini #22249: senza chi risponde la capacità non si dichiara');
});
