/*
 * 23/10/2026 sera — revisione 13 della CLI sul motore della compattazione (kernel 9c37fdb8f, candidato 474a88668). Cinque difetti, tutti
 *   sul percorso di chi incolla un messaggio troppo grande. I casi sono quelli della CLI (`pdrv13.mjs p2/p1att/cenot/ceatt3`, `drv12
 *   ce-ovf`): un fornitore che conta i messaggi come la stima, gli schemi come la stima e una CORNICE fissa in più (6.000, ZK3-06), e
 *   rifiuta oltre la sua finestra coi numeri. Ogni prova ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaToken, stimaTokenConversazione as stimaConversazione } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { nomeDellaRichiestaSalvata } from '../src/kernel/richieste-vecchie.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

const prosa = (n) => 'Answer words. '.repeat(Math.ceil(n / 14)).slice(0, n);
const log = (n) => '2026-10-22 12:00:00 INFO pasted build log line with some words '.repeat(Math.ceil(n / 62)).slice(0, n);
/* la consegna del giro è l'ultima richiesta della persona, come la passa il registro (il kernel non la aggiunge una seconda volta) */
const consegnaDi = (lista) => { const u = [...(lista ?? [])].reverse().find((m) => m?.role === 'user'); return typeof u?.content === 'string' ? u.content : 'x'; };
const testoDi = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p?.type === 'text' ? p.text : '')).join('') : '');
const rifiuto = (massimo, chiesti) => new Response(JSON.stringify({ error: { message: `This model's maximum context length is ${massimo} tokens. However, you requested ${chiesti} tokens. Please reduce the length of the messages.` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
/* il fornitore della CLI: messaggi e schemi come la stima, più una cornice fissa (`cornice`) che la stima non vede */
function fornitore(finestraVera, { cornice = 0, falliscaDopo = null } = {}) {
  const conti = { richieste: 0, rifiutate: 0, riassunti: 0, mandati: [], corpi: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      conti.corpi.push(corpo);
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.richieste += 1;
    conti.corpi.push(corpo);
    /* `falliscaDopo`: dalla richiesta N in poi un errore che NON è «contesto pieno» (il giro fallisce per altro) */
    if (falliscaDopo !== null && conti.richieste > falliscaDopo) return new Response(JSON.stringify({ error: { message: 'invalid request: unsupported parameter' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const n = (corpo.messages ?? []).reduce((k, m) => k + stimaToken(testoDi(m.content)) + (m.tool_calls ?? []).reduce((j, c) => j + stimaToken(c.function?.arguments ?? ''), 0), 0)
      + compattazione.stimaDegliAttrezzi(corpo.tools) + cornice;
    conti.mandati.push(n);
    if (n > finestraVera) { conti.rifiutate += 1; return rifiuto(finestraVera, n); }
    /* dopo un rifiuto, la prima risposta chiama un attrezzo (così il giro ha una seconda richiesta, per `falliscaDopo`) */
    const conAttrezzo = falliscaDopo !== null && conti.richieste === falliscaDopo;
    const messaggio = conAttrezzo ? { role: 'assistant', content: '', tool_calls: [{ id: 'e1', type: 'function', function: { name: 'elenca', arguments: '{}' } }] } : { role: 'assistant', content: 'fatto' };
    return Response.json({ choices: [{ index: 0, message: messaggio, finish_reason: conAttrezzo ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
/* la storia di `p2.json`: quattro domande con risposte da 6.000 caratteri, poi un log incollato. Il sistema del desktop è più corto di quello
   della CLI: per lo stesso caso («con la cornice non entra») il log è di 60.000 caratteri invece di 44.000 */
const storiaP2 = (incollato = 60_000) => [
  { role: 'system', content: 'You are a coding agent.' },
  ...[1, 2, 3, 4].flatMap((i) => [{ role: 'user', content: `domanda ${i}` }, { role: 'assistant', content: prosa(6_000) }]),
  { role: 'user', content: `here is a huge log ${log(incollato)}` },
];

async function attrezziDelGiro(t) {
  let stimati = null;
  const cartella = cartellaDiProva('talos-r13-schemi-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [{ role: 'user', content: 'ciao' }],
    contestoDelProgetto: 'Project files:\n', permessi: 'Full access',
    fetchDiRete: async (_u, o) => { stimati ??= compattazione.stimaDegliAttrezzi(corpoSenzaMarcatori(o.body).tools); return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } }); } });
  return stimati;
}
function cartelle(t) {
  const cartella = cartellaDiProva('talos-r13-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const incollati = join(cartella, '.incollati');
  mkdirSync(incollati, { recursive: true });
  return { cartella, incollati };
}
async function giro(t, { rete, messaggiIniziali, ...resto }) {
  const { cartella, incollati } = cartelle(t);
  const eventi = [];
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: consegnaDi(messaggiIniziali) }, messaggiIniziali,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access', cartellaIncollati: incollati,
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione')) eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, incollati, nonEntra: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'non-entra'),
    applicati: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true), annullati: eventi.filter((e) => e.tipo === 'compattazione-annullata') };
}
const racconta = (r, rete) => JSON.stringify({ mandati: rete.conti.mandati, riassunti: rete.conti.riassunti, errore: r.errore ? [r.errore.code, r.errore.message?.slice(0, 160)] : null,
  eventi: r.eventi.map((e) => [e.tipo, e.motivo ?? null, e.compattato ?? null, e.ripiego ?? null]) });

test('R13-1-A — p2: cornice +6.000 che la stima non vede, finestra ignota, un log di ~15.000 token che con la cornice non entra: dopo il primo accorciamento è «troppo grande» (non «non entra»), niente pagato, la frase somma oltre la finestra e il riassunto senza modello del giro fallito si annulla; AL CONTRARIO un log che accorciata la storia entra, passa', async (t) => {
  const attrezzi = await attrezziDelGiro(t);
  const rete = fornitore(24_000, { cornice: 6_000 });
  const r = await giro(t, { rete, messaggiIniziali: storiaP2(), scartoMisurato: attrezzi + 6_000, stimaAttrezziMisurati: attrezzi });
  assert.equal(r.errore?.code, 'REQUEST_TOO_LARGE', racconta(r, rete));
  assert.equal(r.nonEntra.length, 0, `niente «non entra»: è il messaggio ${racconta(r, rete)}`);
  assert.equal(rete.conti.riassunti, 0, 'niente pagato');
  const d = r.errore.dati;
  assert.ok(d.tokensRichiesta + d.tokensCornice + (d.riserva ?? 0) > 24_000, `la frase somma OLTRE la finestra: ${JSON.stringify(d)}`);
  assert.ok(Number.isSafeInteger(d.riserva) && d.riserva > 0, 'la riserva è un intero, nei dati');
  assert.equal(r.errore.chiave, 'server.run.requestTooLargeReply', 'e la frase la dice');
  assert.ok(r.applicati.length >= 1, `premessa: il primo rifiuto ha accorciato senza modello ${racconta(r, rete)}`);
  assert.deepEqual(r.annullati.map((e) => e.at), r.applicati.map((e) => e.record.at), 'ogni riassunto gratuito del giro fallito si annulla');
  assert.equal((r.errore.recordDiCompattazione ?? []).length, 0, 'e non arriva al registro');
  // AL CONTRARIO: un log da 44.000 caratteri non entra con la storia intera, ma entra accorciata — e il giro riesce
  const reteBis = fornitore(24_000, { cornice: 6_000 });
  const bis = await giro(t, { rete: reteBis, messaggiIniziali: storiaP2(44_000), scartoMisurato: attrezzi + 6_000, stimaAttrezziMisurati: attrezzi });
  assert.ok(reteBis.conti.rifiutate >= 1, `premessa: la richiesta intera non entra ${racconta(bis, reteBis)}`);
  assert.equal(bis.errore, null, racconta(bis, reteBis));
  assert.ok(reteBis.conti.mandati.at(-1) <= 24_000, racconta(bis, reteBis));
  assert.equal(bis.annullati.length, 0, 'AL CONTRARIO: confermato dalla risposta, il riassunto resta');
});

test('R13-1-B — p1att: con «allega se troppo grande» il log parte come allegato e il giro riesce sotto la finestra; AL CONTRARIO senza la scelta resta «troppo grande», allegabile', async (t) => {
  const attrezzi = await attrezziDelGiro(t);
  const rete = fornitore(24_000, { cornice: 6_000 });
  const r = await giro(t, { rete, messaggiIniziali: storiaP2(), scartoMisurato: attrezzi + 6_000, stimaAttrezziMisurati: attrezzi, allegaSeTroppoGrande: true });
  assert.equal(r.errore, null, racconta(r, rete));
  assert.ok(rete.conti.mandati.at(-1) <= 24_000, racconta(r, rete));
  assert.equal(rete.conti.riassunti, 0);
  const senza = await giro(t, { rete: fornitore(24_000, { cornice: 6_000 }), messaggiIniziali: storiaP2(), scartoMisurato: attrezzi + 6_000, stimaAttrezziMisurati: attrezzi });
  assert.equal(senza.errore?.code, 'REQUEST_TOO_LARGE');
  assert.equal(senza.errore.dati.allegabile, true);
});

test('R13-1-C — un riassunto senza modello CONFERMATO da una risposta resta anche se il giro poi fallisce per altro (R10-7); AL CONTRARIO quello mai confermato si annulla', async (t) => {
  const attrezzi = await attrezziDelGiro(t);
  // rifiuto → accorciamento senza modello → la richiesta accorciata RIESCE (chiama un attrezzo) → la richiesta dopo fallisce con un 400 non di contesto
  const rete = fornitore(24_000, { cornice: 6_000, falliscaDopo: 2 });
  const r = await giro(t, { rete, messaggiIniziali: storiaP2(44_000), scartoMisurato: attrezzi + 6_000, stimaAttrezziMisurati: attrezzi });
  assert.ok(r.errore, `premessa: il giro fallisce ${racconta(r, rete)}`);
  assert.ok(r.applicati.some((e) => e.ripiego === true || e.soloCoda === true), `premessa: un accorciamento gratuito ${racconta(r, rete)}`);
  assert.equal(r.annullati.length, 0, 'confermato: non si annulla');
  assert.ok((r.errore.recordDiCompattazione ?? []).length >= 1, 'e arriva al registro (R10-7)');
});

test('R13-1-E — niente più da accorciare (vecchie richieste della persona tenute alla lettera) e il fornitore rifiuta ancora: coi SUOI numeri il resto entra senza il messaggio nuovo, quindi è «troppo grande», non «non entra»; AL CONTRARIO una cornice che da sola supera la finestra resta «non entra»', async (t) => {
  /* sei richieste vecchie da 8.000 caratteri (sotto la soglia della regola K: restano alla lettera), risposte brevi, poi un log */
  const storia = [{ role: 'system', content: 'You are a coding agent.' },
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [{ role: 'user', content: `richiesta ${i} ${prosa(8_000)}` }, { role: 'assistant', content: 'ok' }]),
    { role: 'user', content: `here is a huge log ${log(40_000)}` }];
  const rete = fornitore(24_000, { cornice: 6_000 });
  const r = await giro(t, { rete, messaggiIniziali: storia });
  assert.equal(r.errore?.code, 'REQUEST_TOO_LARGE', racconta(r, rete));
  assert.equal(r.nonEntra.length, 0, racconta(r, rete));
  // AL CONTRARIO: un sistema da solo più grande della finestra — la colpa è della finestra
  const reteBis = fornitore(8_192);
  const bis = await giro(t, { rete: reteBis, messaggiIniziali: [{ role: 'system', content: `You are a coding agent. ${'regola del progetto '.repeat(1_800)}` }, { role: 'user', content: `here is a huge log ${log(40_000)}` }] });
  assert.notEqual(bis.errore?.code, 'REQUEST_TOO_LARGE', racconta(bis, reteBis));
});

test('R13-1-F — la storia che spiega lo scarto è quella SENZA il messaggio nuovo: quando dopo il primo accorciamento resta ancora qualcosa da accorciare, «troppo grande» arriva al secondo rifiuto, senza un terzo invio inutile; AL CONTRARIO il controllo forzato (R13-1-E) resta la rete di ultima istanza', async (t) => {
  const attrezzi = await attrezziDelGiro(t);
  /* un esito vecchio lungo (i passi gratuiti lo accorciano al primo scalino) e risposte in prosa (le accorcerebbe solo un riassunto) */
  const storia = [{ role: 'system', content: 'You are a coding agent.' },
    { role: 'user', content: 'Leggi il file.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'f1', type: 'function', function: { name: 'read_file', arguments: '{"path":"dati.txt"}' } }] },
    { role: 'tool', tool_call_id: 'f1', content: prosa(40_000) },
    { role: 'assistant', content: 'Letto.' },
    ...[1, 2, 3, 4].flatMap((i) => [{ role: 'user', content: `domanda ${i}` }, { role: 'assistant', content: prosa(6_000) }]),
    { role: 'user', content: `here is a huge log ${log(60_000)}` }];
  const rete = fornitore(24_000, { cornice: 6_000 });
  const r = await giro(t, { rete, messaggiIniziali: storia, scartoMisurato: attrezzi + 6_000, stimaAttrezziMisurati: attrezzi });
  assert.equal(r.errore?.code, 'REQUEST_TOO_LARGE', racconta(r, rete));
  assert.equal(rete.conti.richieste, 2, `al secondo rifiuto, non dopo un terzo invio ${racconta(r, rete)}`);
});

test('R13-1-D — `senzaLaRichiestaNuova`: toglie la SOLA ultima richiesta vera della persona (non le note di TALOS, non gli esiti che vengono dopo)', () => {
  const lista = [
    { role: 'system', content: 's' }, { role: 'user', content: 'vecchia' }, { role: 'assistant', content: 'r' },
    { role: 'user', content: 'nuova' }, { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'elenca', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'a', content: 'esito' }, { role: 'user', content: '[TALOS] nota' },
  ];
  const fuori = compattazione.senzaLaRichiestaNuova(lista);
  assert.deepEqual(fuori.map((m) => testoDi(m.content) || m.role), ['s', 'vecchia', 'r', 'assistant', 'esito', '[TALOS] nota']);
  assert.equal(compattazione.senzaLaRichiestaNuova([{ role: 'system', content: 's' }]).length, 1, 'senza richieste: com\'era');
});

/* ———— il motore del contesto (R13-2, R13-3, R13-4): archivio vero in memoria, come R12-2 ———— */
const contatoreDelMotore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO_DEL_MOTORE = { provider: 'local', model: 'test', windowTokens: 131_072, responseReserve: 2048 };
function scenaDelMotore(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-r13-motore-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const incollati = join(cartella, '.incollati');
  mkdirSync(incollati, { recursive: true });
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const riassunti = [];
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (x) => { riassunti.push(x); throw new Error('non serve'); } }, tokenCounter: contatoreDelMotore, clock: () => '2026-10-23T18:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => MODELLO_DEL_MOTORE, clock: () => '2026-10-23T18:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, incollati, store, service, riassunti };
}
async function giroDelMotore(s, { rete, runId = 'giro-1', messaggiIniziali, avvolgi = (ganci) => ganci, ...resto }) {
  const eventi = [];
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({ cartella: s.cartella, task: { consegna: consegnaDi(messaggiIniziali) }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', cartellaIncollati: s.incollati,
      fetchDiRete: rete.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', contextHooks: avvolgi(await s.service.createKernelHooks({ sessionId: 'chat', runId })),
      messaggiIniziali, onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione')) eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, riallineati: eventi.filter((e) => e.motivo === 'archivio-riallineato') };
}
const originali = async (s) => (await s.store.readOriginals({ sessionId: 'chat' })).map((r) => r.message);

test('R13-2 — col motore: un messaggio che la regola N ferma PRIMA dell\'invio non entra nell\'archivio, e il giro dopo non mette da parte niente; AL CONTRARIO un messaggio che parte entra nell\'archivio', async (t) => {
  const s = scenaDelMotore(t);
  const prima = [{ role: 'user', content: 'prima domanda' }, { role: 'assistant', content: 'prima risposta' }];
  const troppo = [...prima, { role: 'user', content: `here is a huge log ${log(120_000)}` }];
  const r = await giroDelMotore(s, { rete: fornitore(200_000), messaggiIniziali: troppo, finestraToken: 24_000 });
  assert.equal(r.errore?.code, 'REQUEST_TOO_LARGE', r.errore?.message);
  const archiviati = await originali(s);
  assert.ok(!archiviati.some((m) => testoDi(m.content).startsWith('here is a huge log')), `il messaggio non inviato NON è nell'archivio (${archiviati.length} originali)`);
  // il giro dopo, con la storia SENZA il messaggio (come la tiene il registro) e una domanda corta: niente archivio messo da parte
  const dopo = await giroDelMotore(s, { rete: fornitore(200_000), runId: 'giro-2', messaggiIniziali: [...prima, { role: 'user', content: 'domanda corta' }], finestraToken: 24_000 });
  assert.equal(dopo.errore, null, dopo.errore?.message);
  assert.equal(dopo.riallineati.length, 0, 'nessun CTX_HISTORY_DIVERGED: l\'archivio combacia');
  assert.ok((await originali(s)).some((m) => testoDi(m.content) === 'domanda corta'), 'AL CONTRARIO: la domanda partita è nell\'archivio');
});

test('R13-2-B — col motore, una richiesta MANDATA, rifiutata e solo dopo «troppo grande» è già nell\'archivio: il giro lo dice (`archiviataDalMotore`); il giro dopo, che la tiene in storia con la sua posizione, la mostra come nota al modello e al motore — mai il testo — e non mette da parte l\'archivio; AL CONTRARIO senza la posizione il testo intero riparte', async (t) => {
  const s = scenaDelMotore(t);
  const prima = [{ role: 'user', content: 'prima domanda' }, { role: 'assistant', content: prosa(2_000) }];
  const grande = `here is a huge log ${log(120_000)}`;
  const giro1 = [...prima, { role: 'user', content: grande }];
  // la finestra dichiarata (131.072) non c'entra: il fornitore regge 11.000 — la richiesta parte, viene rifiutata, ed è troppo grande
  const r = await giroDelMotore(s, { rete: fornitore(11_000), messaggiIniziali: giro1 });
  assert.equal(r.errore?.code, 'REQUEST_TOO_LARGE', r.errore?.message);
  assert.equal(r.errore.archiviataDalMotore, true, 'il motore l\'aveva già presa');
  assert.ok((await originali(s)).some((m) => testoDi(m.content) === grande), 'premessa: è nell\'archivio (a sola aggiunta)');
  /* la storia che il registro tiene è quella che il giro consegna: la lista archiviata dal motore, richiesta compresa */
  const tenuta = r.errore.messaggiDelGiro;
  const indice = tenuta.findIndex((m) => testoDi(m.content) === grande);
  assert.ok(indice >= 0, 'la storia consegnata TIENE la richiesta');
  const giro2 = [...tenuta, { role: 'user', content: 'domanda corta' }];
  const mandatoIntero = (rete) => rete.conti.corpi.some((c) => (c.messages ?? []).some((m) => testoDi(m.content) === grande));
  const rete = fornitore(200_000);
  const dopo = await giroDelMotore(s, { rete, runId: 'giro-2', messaggiIniziali: giro2, richiesteNonInviate: [indice] });
  assert.equal(dopo.errore, null, dopo.errore?.message);
  assert.equal(dopo.riallineati.length, 0, 'nessun CTX_HISTORY_DIVERGED');
  assert.equal(mandatoIntero(rete), false, 'né il modello né i riassunti vedono il testo');
  assert.ok(rete.conti.corpi.some((c) => (c.messages ?? []).some((m) => testoDi(m.content).startsWith('[TALOS] A message the person wrote here was not sent'))), 'la nota al suo posto');
  const s2 = scenaDelMotore(t);
  await giroDelMotore(s2, { rete: fornitore(11_000), messaggiIniziali: giro1 });
  const rete2 = fornitore(200_000);
  await giroDelMotore(s2, { rete: rete2, runId: 'giro-2', messaggiIniziali: giro2 });
  assert.equal(mandatoIntero(rete2), true, 'AL CONTRARIO: senza la posizione il testo riparte intero');
});

test('R13-3 — una richiesta vecchia di cui la sessione ha la copia intera (allegato o regola K) arriva al modello e al motore CORTA, nei due percorsi; AL CONTRARIO senza la copia arriva intera', async (t) => {
  const grande = `here is a huge log ${log(60_000)}`;
  const storia = [{ role: 'user', content: grande }, { role: 'assistant', content: 'Letto il log.' }, { role: 'user', content: 'e adesso?' }];
  const mandatoIntero = (rete) => rete.conti.corpi.some((c) => (c.messages ?? []).some((m) => testoDi(m.content) === grande));
  // col motore
  const s = scenaDelMotore(t);
  writeFileSync(join(s.incollati, nomeDellaRichiestaSalvata(grande)), grande);
  const rete = fornitore(200_000);
  const r = await giroDelMotore(s, { rete, messaggiIniziali: storia });
  assert.equal(r.errore, null, r.errore?.message);
  assert.equal(mandatoIntero(rete), false, 'col motore: mai il testo intero, né al modello né ai riassunti');
  assert.ok(rete.conti.corpi.some((c) => (c.messages ?? []).some((m) => testoDi(m.content).includes(nomeDellaRichiestaSalvata(grande)))), 'la forma corta porta il percorso della copia');
  // senza motore
  const rete2 = fornitore(200_000);
  const r2 = await giro(t, { rete: rete2, messaggiIniziali: storia });
  writeFileSync(join(r2.incollati, nomeDellaRichiestaSalvata(grande)), grande);
  const rete3 = fornitore(200_000);
  const { cartella } = cartelle(t);
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: consegnaDi(storia) }, messaggiIniziali: storia, contestoDelProgetto: 'Project files:\n',
    fetchDiRete: rete3.fetchDiRete, permessi: 'Full access', cartellaIncollati: r2.incollati });
  assert.equal(mandatoIntero(rete3), false, 'senza motore: lo stesso');
  // AL CONTRARIO: senza la copia la richiesta vecchia arriva intera (com'era)
  assert.equal(mandatoIntero(rete2), true, 'AL CONTRARIO: senza copia, intera');
});

test('R13-5 — col motore, la riga della scala dice i numeri della richiesta MANDATA (la proiezione del motore), non della storia grezza; AL CONTRARIO senza motore dice quelli della storia', async (t) => {
  const storia = [
    { role: 'user', content: 'Leggi il log.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: 'read_file', arguments: '{"path":"server.log"}' } }] },
    { role: 'tool', tool_call_id: 'l1', content: prosa(160_000) },
    { role: 'assistant', content: `Letto. ${prosa(40_000)}` },
    /* scambi recenti brevi: la coda (che non si accorcia) è loro, il materiale grande sta nel tratto vecchio che la scala riassume */
    ...[1, 2, 3, 4].flatMap((i) => [{ role: 'user', content: `domanda ${i}` }, { role: 'assistant', content: `risposta ${i}` }]),
    { role: 'user', content: 'Riassumi gli errori.' },
  ];
  const s = scenaDelMotore(t);
  /* il motore ha già accorciato l'esito vecchio (come dopo un suo riassunto): la richiesta mandata è molto più piccola della storia */
  const avvolgi = (ganci) => ({ ...ganci, prepare: async (p) => {
    const esito = await ganci.prepare(p);
    return { ...esito, messages: esito.messages.map((m) => (m.role === 'tool' ? { ...m, content: '[cleared: server.log, 160000 chars]' } : m)) };
  } });
  const rete = fornitore(12_000);
  const r = await giroDelMotore(s, { rete, messaggiIniziali: storia, avvolgi });
  const inizio = r.eventi.find((e) => e.tipo === 'compattazione-inizio' && e.motivo === 'overflow');
  assert.ok(inizio, `premessa: la scala è partita (${JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo]))})`);
  const grezza = stimaToken(prosa(160_000));
  assert.ok(inizio.tokenMisurati < grezza / 2, `il «prima» è la richiesta mandata (${inizio.tokenMisurati}), non la storia grezza (~${grezza})`);
});

test('R13-4 — col motore e una finestra ricordata dal rifiuto (più piccola di quella che il motore usa) il giro passa dalla compattazione semplice: nessun rifiuto; AL CONTRARIO senza ricordo il motore manda la storia intera e il fornitore la rifiuta', async (t) => {
  const storia = [
    { role: 'user', content: 'Leggi il log.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: 'read_file', arguments: '{"path":"server.log"}' } }] },
    { role: 'tool', tool_call_id: 'l1', content: prosa(120_000) },
    { role: 'assistant', content: 'Letto.' },
    { role: 'user', content: 'Riassumi gli errori del log.' },
  ];
  const s = scenaDelMotore(t);
  const rete = fornitore(30_000);
  const r = await giroDelMotore(s, { rete, messaggiIniziali: storia, finestraToken: 30_000, rifiutoNoto: { finestra: 30_000, scala: 1, impronta: null } });
  assert.equal(r.errore, null, r.errore?.message);
  assert.equal(rete.conti.rifiutate, 0, `nessun rifiuto: la finestra ricordata vale (${JSON.stringify(rete.conti.mandati)})`);
  const s2 = scenaDelMotore(t);
  const rete2 = fornitore(30_000);
  await giroDelMotore(s2, { rete: rete2, messaggiIniziali: storia });
  assert.ok(rete2.conti.rifiutate >= 1, `AL CONTRARIO: senza ricordo un rifiuto (${JSON.stringify(rete2.conti.mandati)})`);
});

/* ———— revisione 14 della CLI (s4 `paste-12k`): la forma corta di R13-3 non deve cambiare le impronte ———— */
test('R13-3-B — un riassunto preparato dal registro sulla storia INTERA resta valido quando l\'incollato ha la sua copia (la forma corta non cambia le impronte): all\'emergenza si adotta e non si paga; AL CONTRARIO un\'impronta di un\'altra storia non si adotta', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const { cartella, incollati } = cartelle(t);
  const grande = `here is my pasted log ${log(9_600)}`; // oltre i 9.000 caratteri: ha una forma corta
  const coppia = (i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }];
  /* ~3.700 token di storia più gli schemi: il giro parte oltre la linea d'emergenza */
  const storia = [{ role: 'user', content: grande }, { role: 'assistant', content: 'Letto.' }, ...Array.from({ length: 6 }, (_, i) => coppia(i)).flat()];
  /* il riassunto di fine giro come lo prepara il REGISTRO: record e impronta sulla storia intera (`session-registry.mjs`, `improntaAlVia`) */
  const preparato = (impronta) => ({
    record: compattazione.creaRecord({ coveredThrough: storia.length, riassunto: [{ role: 'user', content: 'Riassunto: un log incollato, letto, e sei domande con le loro risposte.' }],
      tokenPrima: 6_000, tokenDopo: 2_500, misura: 'stimato', at: '2026-10-23T20:00:00.000Z', modello: 'z-ai/glm-5.3-flash', coperti: storia }),
    impronta, base: compattazione.chiaveBaseDelRecord(null), soloCoda: false, origine: 'fine-giro',
  });
  /* la copia intera dell'incollato c'è (l'ha scritta la regola K): da qui modello e motore vedono la forma corta */
  writeFileSync(join(incollati, nomeDellaRichiestaSalvata(grande)), grande);
  /* `inArrivo`: il riassunto di fine giro ancora IN VOLO (arriva dopo 150 ms), con la sua firma — la strada del caso della CLI, dove è
     la firma a decidere se aspettarlo; altrimenti già pronto */
  const intera = [...storia, { role: 'user', content: 'Ora rispondi OK.' }];
  const giroCon = async (pronta, { inArrivo = false } = {}) => {
    const conti = { riassunti: 0, corpi: [] };
    const fini = [];
    const firma = { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base };
    const inVolo = () => Object.assign(new Promise((ok) => { setTimeout(() => ok(pronta), 150); }), { firma });
    const esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Ora rispondi OK.' }, messaggiIniziali: intera,
      ...(inArrivo ? { compattazioneInArrivo: inVolo() } : { compattazionePronta: pronta }),
      cartellaIncollati: incollati, contestoDelProgetto: 'Project files:\n',
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push({ compattato: e.compattato === true, istantanea: e.istantanea === true, motivo: e.motivo ?? null }); },
      fetchDiRete: async (_u, o) => {
        const corpo = corpoSenzaMarcatori(o.body);
        conti.corpi.push(corpo);
        if (!corpo.tools?.length) {
          conti.riassunti += 1;
          return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
        }
        return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stimaConversazione(corpo.messages), completion_tokens: 1 } });
      } });
    return { conti, fini, records: esito?.recordDiCompattazione ?? [], finali: esito?.messaggiFinali ?? [] };
  };
  /* ogni record nato nel giro vale per la storia INTERA che il giro restituisce (`messaggiFinali`, quella che il registro tiene e su cui
     lo riapplica con `applicaRecord`): l'incollato è lì intero */
  const recordSullaStoriaVera = ({ records, finali }, come, { almenoUno = true } = {}) => {
    if (almenoUno) assert.ok(records.length > 0, `${come}: premessa, un record nel giro`);
    assert.ok(finali.some((m) => testoDi(m.content) === grande), `${come}: premessa, la storia restituita tiene l'incollato intero`);
    for (const r of records) assert.ok(compattazione.recordValePerLaStoria(finali, r), `${come}: il record (cT ${r.coveredThrough}) vale sulla storia intera`);
  };
  for (const inArrivo of [false, true]) {
    const come = inArrivo ? 'in arrivo' : 'pronto';
    const esito = await giroCon(preparato(compattazione.improntaDelPrefisso(storia, storia.length)), { inArrivo });
    const { conti, fini } = esito;
    assert.ok(fini.some((e) => e.compattato && e.istantanea), `${come}: il riassunto preparato si adotta (${JSON.stringify(fini)})`);
    assert.equal(conti.riassunti, 0, `${come}: niente pagato, la base preparata vale ancora`);
    assert.ok(!conti.corpi.some((corpo) => (corpo.messages ?? []).some((m) => testoDi(m.content) === grande)), `${come}: R13-3 resta, mai l'incollato intero`);
    recordSullaStoriaVera(esito, come);
  }
  /* AL CONTRARIO: l'impronta di una storia diversa (una risposta vecchia riscritta) — il riassunto preparato non vale; la compattazione
     del giro si fa da capo, e anche i SUOI record valgono sulla storia intera */
  const altra = storia.map((m, i) => (i === 1 ? { ...m, content: 'Letto, con un dettaglio diverso.' } : m));
  for (const inArrivo of [false, true]) {
    const contrario = await giroCon(preparato(compattazione.improntaDelPrefisso(altra, altra.length)), { inArrivo });
    assert.ok(!contrario.fini.some((e) => e.compattato && e.istantanea), `AL CONTRARIO (${inArrivo ? 'in arrivo' : 'pronto'}): storia diversa, nessuna adozione (${JSON.stringify(contrario.fini)})`);
    recordSullaStoriaVera(contrario, `AL CONTRARIO (${inArrivo ? 'in arrivo' : 'pronto'})`, { almenoUno: false });
  }
});

test('R13-3-C — un record salvato la cui ULTIMA richiesta coperta ha poi la sua copia (forma corta) si applica ancora: il modello riceve il riassunto, non la storia coperta; AL CONTRARIO un record di un\'altra storia non si applica', async (t) => {
  const { cartella, incollati } = cartelle(t);
  const grande = `here is my pasted log ${log(9_600)}`;
  const storia = [{ role: 'user', content: 'Domanda iniziale VECCHIA-R14.' }, { role: 'assistant', content: 'Risposta vecchia.' }, { role: 'user', content: grande }, { role: 'assistant', content: 'Letto.' }];
  /* il record copre fino all'incollato compreso (com'era quando era la richiesta del giro): impronta del tratto sulla storia intera */
  const record = (coperti) => compattazione.creaRecord({ coveredThrough: 3, riassunto: [{ role: 'user', content: 'RIASSUNTO-R14: una domanda, poi un log incollato.' }],
    tokenPrima: 3_000, tokenDopo: 200, misura: 'stimato', at: '2026-10-23T20:00:00.000Z', modello: 'z-ai/glm-5.3-flash', coperti });
  writeFileSync(join(incollati, nomeDellaRichiestaSalvata(grande)), grande);
  const primo = async (rec) => {
    let corpo = null;
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'E adesso?' }, messaggiIniziali: [...storia, { role: 'user', content: 'E adesso?' }],
      recordCompattazioneIniziale: rec, cartellaIncollati: incollati, contestoDelProgetto: 'Project files:\n',
      fetchDiRete: async (_u, o) => {
        const c = corpoSenzaMarcatori(o.body);
        if (c.tools?.length) corpo ??= c;
        return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 1 } });
      } });
    return (corpo?.messages ?? []).map((m) => testoDi(m.content)).join('\n');
  };
  const mandato = await primo(record(storia));
  assert.ok(mandato.includes('RIASSUNTO-R14'), 'il record si applica: il modello riceve il riassunto');
  assert.ok(!mandato.includes('VECCHIA-R14'), 'e non la storia che copre');
  /* AL CONTRARIO: un record nato su un'altra storia (l'ultima coperta diversa) non si applica */
  const altra = await primo(record(storia.map((m, i) => (i === 2 ? { ...m, content: `${grande} (un'altra)` } : m))));
  assert.ok(!altra.includes('RIASSUNTO-R14') && altra.includes('VECCHIA-R14'), 'AL CONTRARIO: storia diversa, la storia grezza');
});

test('R13-3-D — con la copia dell\'incollato i record che il giro crea (riassunto pagato, sola coda) e il riassunto che il motore prepara da sé portano le impronte della storia INTERA: valgono dove il registro li riapplica', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const grande = `here is my pasted log ${log(9_600)}`;
  const coppia = (i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }];
  const giroConCopia = async (tetto, messaggiIniziali) => {
    process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(tetto);
    const { cartella, incollati } = cartelle(t);
    writeFileSync(join(incollati, nomeDellaRichiestaSalvata(grande)), grande);
    const fini = []; let riassunti = 0;
    const esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Ora rispondi OK.' }, messaggiIniziali,
      compattazioneIstantanea: true, cartellaIncollati: incollati, contestoDelProgetto: 'Project files:\n',
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push({ compattato: e.compattato === true, soloCoda: e.soloCoda === true }); },
      fetchDiRete: async (_u, o) => {
        const corpo = corpoSenzaMarcatori(o.body);
        if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
        return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stimaConversazione(corpo.messages), completion_tokens: 1 } });
      } });
    const finali = esito.messaggiFinali ?? [];
    assert.ok(finali.some((m) => testoDi(m.content) === grande), 'premessa: la storia restituita tiene l\'incollato intero');
    return { esito, finali, fini, riassunti, records: esito.recordDiCompattazione ?? [] };
  };
  const conRichiesta = (lista) => [...lista, { role: 'user', content: 'Ora rispondi OK.' }];
  /* 1. un riassunto pagato all'emergenza: il record copre dall'incollato (il primo messaggio) in poi */
  const pagato = await giroConCopia(4_000, conRichiesta([{ role: 'user', content: grande }, { role: 'assistant', content: 'Letto.' }, ...Array.from({ length: 12 }, (_, i) => coppia(i)).flat()]));
  assert.ok(pagato.riassunti >= 1 && pagato.records.length > 0, `premessa: un riassunto pagato (${JSON.stringify(pagato.fini)})`);
  for (const r of pagato.records) assert.ok(compattazione.recordValePerLaStoria(pagato.finali, r), `il record pagato (cT ${r.coveredThrough}) vale sulla storia intera`);
  /* 2. il motore prepara da sé il riassunto per il giro dopo: la sua impronta è quella della storia intera */
  const prepara = await giroConCopia(8_000, conRichiesta([{ role: 'user', content: grande }, { role: 'assistant', content: 'Letto.' }, ...Array.from({ length: 14 }, (_, i) => coppia(i)).flat()]));
  const pronta = prepara.esito.compattazionePronta ?? await prepara.esito.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa: un riassunto preparato dal motore');
  assert.equal(pronta.impronta, compattazione.improntaDelPrefisso(prepara.finali, pronta.record.coveredThrough), 'l\'impronta del preparato è quella della storia intera');
  /* 3. la sola coda: niente da riassumere, ma un esito d'attrezzo lungo nella coda si accorcia gratis */
  const leggi = { role: 'assistant', content: '', tool_calls: [{ id: 'l1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.log"}' } }] };
  const coda = await giroConCopia(4_000, conRichiesta([{ role: 'user', content: grande }, { role: 'assistant', content: 'Letto.' }, { role: 'user', content: 'Leggi il file.' }, leggi,
    { role: 'tool', tool_call_id: 'l1', content: prosa(16_000) }, { role: 'assistant', content: 'Letto il file.' }]));
  assert.ok(coda.fini.some((e) => e.soloCoda) && coda.riassunti === 0, `premessa: la sola coda, gratis (${JSON.stringify(coda.fini)}, riassunti ${coda.riassunti})`);
  for (const r of coda.records) assert.ok(compattazione.recordValePerLaStoria(coda.finali, r), `il record della sola coda (cT ${r.coveredThrough}) vale sulla storia intera`);
});
