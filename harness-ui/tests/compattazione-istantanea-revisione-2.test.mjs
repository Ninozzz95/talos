/*
 * 16/10/2026 (bugfixer) — seconda revisione avversaria della compattazione istantanea: le cure 59692c935, 984714266, 5fe9cc0cc.
 * Adapter desktop VERO, rete finta: nessun giro pagato. Le ROSSE sono difetti; le VERDI dicono ciò che regge.
 * Ricerca (16/10/2026): Codex «Treat compaction failure as failure state» (#10927, forge.lthn.ai/core/core-agent-ide/commit/ba8b5d9) —
 * il fallimento della compattazione che il giro ASPETTA ferma il giro; di un riassunto speculativo fallito non dice niente.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.TALOS_COMPACTION_TOKEN_CAP = '4000';
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

const attesa = (ms) => new Promise((r) => { setTimeout(r, ms); });
const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };

/** Modello finto con un po' di latenza (il riassunto in sottofondo ha il tempo di arrivare), `letture` letture e poi «fatto». */
function rete({ letture, riassunto, ritardoModello = 60 }) {
  const conti = { modello: 0, riassunti: 0 };
  let fatte = 0;
  const fn = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return riassunto(conti.riassunti); }
    await attesa(ritardoModello);
    conti.modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((t) => t.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (fatte < letture) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  return { fn, conti };
}
const RIASSUNTO_BUONO = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
const RIASSUNTO_TRONCATO = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'Riassunto a me' }, finish_reason: 'length' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });

test('IST2-REV-01 — (owner 21/10/2026, «sta maledetta compattazione») un riassunto di sottofondo TRONCATO si richiede una volta più breve: riesce, e lo scambio istantaneo avviene senza attesa in primo piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'istantanea-rev2-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const r0 = rete({ letture: 12, riassunto: (n) => (n === 1 ? RIASSUNTO_TRONCATO() : RIASSUNTO_BUONO()) });
  const eventi = [];
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(3250)), { role: 'user', content: 'Leggi i file.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-(inizio|fine|preparata)$/u.test(e?.tipo ?? '')) eventi.push(`${e.tipo}${e.fase ? `/${e.fase}` : ''}${e.istantanea ? '/istantanea' : ''}${e.motivo ? `/${e.motivo}` : ''}`); } });
  assert.ok(!eventi.includes('compattazione-preparata/troncato'), `il troncato si è ritentato e non è un fallimento: ${JSON.stringify(eventi)}`);
  assert.ok(eventi.some((e) => e.startsWith('compattazione-fine/istantanea')), JSON.stringify(eventi));
  assert.deepEqual(eventi.filter((e) => e.startsWith('compattazione-inizio')), [], `nessuna attesa in primo piano: ${JSON.stringify(eventi)}`);
  assert.ok(r0.conti.riassunti >= 2, 'il primo troncato e il ritentativo');
});

test('IST2-REV-01c — [VERDE, da sapere] TUTTI E DUE i tentativi di sottofondo troncati: l’istantanea si spegne per il resto del giro e all’emergenza si aspetta in primo piano — la politica di prima, ora dopo il ritentativo', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'istantanea-rev2c-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const r0 = rete({ letture: 12, riassunto: (n) => (n <= 2 ? RIASSUNTO_TRONCATO() : RIASSUNTO_BUONO()) });
  const eventi = [];
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(3250)), { role: 'user', content: 'Leggi i file.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-(inizio|fine|preparata)$/u.test(e?.tipo ?? '')) eventi.push(`${e.tipo}${e.fase ? `/${e.fase}` : ''}${e.istantanea ? '/istantanea' : ''}${e.motivo ? `/${e.motivo}` : ''}`); } });
  assert.deepEqual(eventi, ['compattazione-preparata/inizio/precalcolo', 'compattazione-preparata/troncato', 'compattazione-inizio/emergenza', 'compattazione-fine'], JSON.stringify(eventi));
  assert.equal(r0.conti.riassunti, 3, 'due di sottofondo (troncati) e quello della emergenza');
});

test('IST2-REV-01b — [VERDE] AL CONTRARIO, lo stesso giro con un riassunto buono: scambio istantaneo, nessuna attesa in primo piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'istantanea-rev2b-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const r0 = rete({ letture: 12, riassunto: () => RIASSUNTO_BUONO() });
  const eventi = [];
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(3250)), { role: 'user', content: 'Leggi i file.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-(inizio|fine|preparata)$/u.test(e?.tipo ?? '')) eventi.push(`${e.tipo}${e.fase ? `/${e.fase}` : ''}${e.istantanea ? '/istantanea' : ''}${e.motivo ? `/${e.motivo}` : ''}`); } });
  assert.ok(eventi.some((e) => e.startsWith('compattazione-fine/istantanea')), JSON.stringify(eventi));
  assert.deepEqual(eventi.filter((e) => e.startsWith('compattazione-inizio')), [], JSON.stringify(eventi));
});

/* Il banco di chiamata-secondaria.test.mjs (fornitore finto su 127.0.0.1, la strada vera chiamaConRitenta), con le ATTESE registrate. */
async function bancoSecondaria(t, rispondi) {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs');
  const { createProviderCredentialStore } = await import('../src/provider-credential-store.mjs');
  const { chiamaConRitenta } = await import('../src/kernel/talosHarness.mjs');
  const richieste = [];
  const server = createServer(async (req, res) => { for await (const _c of req) { /* consuma */ } richieste.push(Date.now()); await rispondi(res, richieste.length); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((risolvi) => { server.closeAllConnections(); server.close(risolvi); }));
  const custodia = new Map();
  const store = createProviderCredentialStore({ env: { ZAI_API_KEY: 'sec-zai-unica' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const consumi = [];
  const trasporto = creaFetchMultiProvider(fetch, { providerStore: store, onConsumoFornitore: async (e) => { consumi.push(e); },
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  const attese = [];
  const run = (extra = {}) => chiamaConRitenta({ modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only', messaggi: [{ role: 'user', content: 'Riassumi.' }],
    attrezzi: [], maxOutputTokens: 64, fetchDiRete: trasporto, dormi: async (ms) => { attese.push(ms); }, caso: () => 0, ...extra });
  return { richieste, consumi, attese, run };
}

test('IST2-REV-02 — [CURATO 16/10, era S4] un riassunto di SOTTOFONDO su un 429 ritenta come la richiesta del giro: 11 richieste e ~2,7 minuti sullo stesso fornitore limitato, mentre il giro gli sta chiedendo le sue', async (t) => {
  const b = await bancoSecondaria(t, async (res) => { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'rate limited' } })); });
  await assert.rejects(b.run({ secondaria: true }), /HTTP 429/u);
  const attesaTotaleS = Math.round(b.attese.reduce((a, x) => a + x, 0) / 1000);
  assert.ok(b.richieste.length <= 2, `${b.richieste.length} richieste e ${attesaTotaleS} s di attese (\`ritentativiDiSerie\`, talosHarness.mjs ~1800, come Claude Code: 10 ritentativi), ${b.consumi.length} righe «consumo-fornitore» nel giornale. Una chiamata speculativa che il giro non aspetta non dovrebbe consumare il limite di traffico del giro: un tentativo (Codex: la richiesta speculativa si scarta) o due al massimo, poi «riassunto non pronto»`);
});

test('IST2-REV-03 — [VERDE] un riassunto pronto VECCHIO (la persona ha tolto un messaggio o ne ha cambiato uno fra i due giri) non si usa: «history-shorter» / «prefix-changed» nel giornale, e la compattazione si fa da capo', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'istantanea-rev2c-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const r0 = rete({ letture: 0, riassunto: () => RIASSUNTO_BUONO(), ritardoModello: 0 });
  const s1 = storia(coppiePer(3450));
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: s1, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa');
  const lungo = { role: 'user', content: `Adesso ${'altro testo '.repeat(300)}` };
  const casi = {
    'history-shorter': [uno.messaggiFinali[0], { role: 'user', content: `Adesso ${'altro testo '.repeat(1500)}` }],
    'prefix-changed': [{ ...uno.messaggiFinali[0], content: `${uno.messaggiFinali[0].content} (modificato)` }, ...uno.messaggiFinali.slice(1), lungo],
  };
  for (const [atteso, messaggi] of Object.entries(casi)) {
    const eventi = [];
    const r1 = rete({ letture: 0, riassunto: () => RIASSUNTO_BUONO(), ritardoModello: 0 });
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
      compattazioneIstantanea: true, compattazionePronta: pronta, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1.fn,
      onGiro: (e) => { if (/^compattazione-/u.test(e?.tipo ?? '')) eventi.push(`${e.tipo}${e.fase ? `/${e.fase}` : ''}${e.istantanea ? '/istantanea' : ''}${e.motivo ? `/${e.motivo}` : ''}`); } });
    if (process.env.MOSTRA) console.log(atteso, JSON.stringify(eventi));
    assert.ok(!eventi.some((e) => e.includes('/istantanea')), `${atteso}: un riassunto vecchio non si scambia — ${JSON.stringify(eventi)}`);
    assert.ok(eventi.includes(`compattazione-preparata/scartata/${atteso}`), `${atteso}: ${JSON.stringify(eventi)}`);
  }
});
