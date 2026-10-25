/*
 * `artifact_update` — owner 24/10/2026 («aggiorna la stessa», versioni tenute tutte, «vedere e ripristinare»); contratto con la CLI
 * in handoff `CONTRATTO-ARTIFACT-UPDATE-2026-10-24.md` (§1 riga di create, §2 attrezzo e testi, §7 edits uno dopo l'altro, sola
 * lettura «not saved»). Due livelli: il kernel vero con un fornitore finto, e il servizio vero con la Libreria vera su disco.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { avviaSessione } from '../src/agent-service.mjs';
import { elencaVersioni, leggiVoce, leggiVersione, salvaVoce } from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const HTML = '<!doctype html><html><body><h1>Sales</h1><p>Q1</p></body></html>';
const ID = 'lib-11111111-2222-4333-8444-555555555555';

/* ——— il kernel ——— */
function fornitore(copione) {
  const richieste = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    richieste.push(JSON.parse(init.body));
    const passo = copione[n] ?? null;
    n += 1;
    const message = passo
      ? { role: 'assistant', content: null, tool_calls: passo.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: passo ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchDiRete, richieste };
}
const esitoDi = (richieste, id) => richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;

async function kernel(copione, altro = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-art-upd-k-'));
  const { fetchDiRete, richieste } = fornitore(copione);
  try {
    await talosLavora({ cartella, task: { consegna: 'chart' }, modello: 'f', chiave: 'k', giriMassimi: copione.length + 2, fetchDiRete,
      strumentiEstesi: ['artifact_create', 'artifact_update'], ...altro });
  } finally { rimuoviCartellaDiProva(cartella); }
  return richieste;
}

test('ART-UPD-K-01 — create dice al modello l\'id della Libreria (sopravvive al riavvio); update risponde con la versione', async () => {
  const chiamate = [];
  const richieste = await kernel([
    [['c1', 'artifact_create', { titolo: 'Sales', html: HTML }]],
    [['c2', 'artifact_update', { id: ID, edits: [{ old: 'Q1', new: 'Q2' }] }]],
  ], {
    onArtefatto: async () => ({ id: 'mem-1', voceLibreriaId: ID }),
    onAggiornaArtefatto: async (id, modifica, opzioni) => { chiamate.push({ id, modifica, opzioni }); return { versione: 2, totale: 2, titolo: 'Sales' }; },
  });
  assert.equal(esitoDi(richieste, 'c1'), `created: "Sales" (id: ${ID}, version 1). To change it later, call artifact_update with this id.`);
  assert.equal(esitoDi(richieste, 'c2'), `updated: "Sales" (id: ${ID}, now version 2 of 2)`);
  assert.deepEqual(chiamate, [{ id: ID, modifica: { edits: [{ old: 'Q1', new: 'Q2' }] }, opzioni: { titolo: undefined, copiaInLibreria: true } }]);
  /* artifact_update è offerto come artifact_create */
  assert.ok(richieste[0].tools.some((a) => a.function.name === 'artifact_update'));
});

test('ART-UPD-K-02 — AL CONTRARIO: chi non dà voceLibreriaId riceve la riga di sempre; in sola lettura «not saved»', async () => {
  const sempre = await kernel([[['c1', 'artifact_create', { titolo: 'T', html: HTML }]]], { onArtefatto: async () => ({ id: 'mem-1' }) });
  assert.equal(esitoDi(sempre, 'c1'), 'created: "T" (id: mem-1)');
  const lettura = await kernel([
    [['c1', 'artifact_create', { titolo: 'T', html: HTML }]],
    [['c2', 'artifact_update', { id: ID, html: HTML }]],
  ], {
    livelloAccesso: 'lettura', chiediApprovazioneFn: async () => false,
    onArtefatto: async () => ({ id: 'mem-1', salvata: false }),
    onAggiornaArtefatto: async (_id, _m, opzioni) => { assert.equal(opzioni.copiaInLibreria, false); return { salvata: false, versione: 3, totale: 3, titolo: 'T' }; },
  });
  assert.equal(esitoDi(lettura, 'c1'), 'created: "T" (id: mem-1, not saved: it cannot be updated later).');
  assert.equal(esitoDi(lettura, 'c2'), 'shown: "T" (not saved: read-only session; the saved artifact stays at version 3)');
});

test('ART-UPD-K-03 — gli argomenti sbagliati non arrivano mai a chi salva; senza ospite «non disponibile»', async () => {
  let chiamato = false;
  const ospite = { onAggiornaArtefatto: async () => { chiamato = true; return { versione: 2, totale: 2 }; } };
  const r = await kernel([[
    ['a', 'artifact_update', { id: ID, html: HTML, edits: [{ old: 'x', new: 'y' }] }],
    ['b', 'artifact_update', { id: ID }],
    ['c', 'artifact_update', { id: 'mem-1', html: HTML }],
    ['d', 'artifact_update', { id: ID, html: '   ' }],
    ['e', 'artifact_update', { id: ID, edits: [{ old: '', new: 'y' }] }],
  ]], ospite);
  assert.equal(esitoDi(r, 'a'), 'INVALID. Give either html or edits, not both. Nothing was changed.');
  assert.equal(esitoDi(r, 'b'), 'INVALID. Give either html or edits, not both. Nothing was changed.');
  assert.match(esitoDi(r, 'c'), /^NOT_FOUND: no saved artifact with id "mem-1"\. Nothing was changed\. Use artifact_create for a new artifact\.$/u);
  assert.equal(esitoDi(r, 'd'), 'INVALID. Empty html: nothing was changed.');
  assert.match(esitoDi(r, 'e'), /^INVALID\. Each edit needs a non-empty "old"/u);
  assert.equal(chiamato, false);
  const senza = await kernel([[['z', 'artifact_update', { id: ID, html: HTML }]]]);
  assert.equal(esitoDi(senza, 'z'), 'ARTIFACT_UNAVAILABLE: artifact updates are not configured on this harness. Nothing was changed.');
});

test('ART-UPD-K-04 — gli errori di chi salva diventano testi onesti, e un errore sconosciuto non diventa un successo', async () => {
  const lancia = (code, message) => async () => { throw Object.assign(new Error(message), { code }); };
  const casi = [
    ['NOT_FOUND', 'x', /^NOT_FOUND: no saved artifact/u],
    ['NOT_AN_ARTIFACT', 'x', /is a Library file, not an artifact\. Nothing was changed\.$/u],
    ['EDIT_NOT_FOUND', 'Edit 1: "Q9" appears 0 times in the latest version (after the edits before it). Nothing was changed.', /^INVALID\. Edit 1: "Q9" appears 0 times/u],
    ['EDIT_AMBIGUOUS', 'Edit 2: "p" appears 3 times in the latest version (after the edits before it). Nothing was changed.', /^INVALID\. Edit 2: "p" appears 3 times/u],
    ['ARTIFACT_TOO_LARGE', 'The new version is 500000 bytes; the maximum is 400000. Nothing was changed.', /^ARTIFACT_TOO_LARGE\. The new version is 500000 bytes/u],
  ];
  for (const [code, msg, atteso] of casi) {
    const r = await kernel([[['c', 'artifact_update', { id: ID, html: HTML }]]], { onAggiornaArtefatto: lancia(code, msg) });
    assert.match(esitoDi(r, 'c'), atteso, code);
  }
  const ignoto = await kernel([[['c', 'artifact_update', { id: ID, html: HTML }]]], { onAggiornaArtefatto: lancia('EBUSY', 'disco occupato') });
  assert.doesNotMatch(esitoDi(ignoto, 'c') ?? '', /^updated/u);
});

/* ——— il servizio, con la Libreria vera ——— */
async function servizio(t, passi) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-art-upd-s-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  const eventi = [];
  const risultati = [];
  await avviaSessione({
    cartella: dati, task: { id: 't', consegna: 'x' }, modello: 'glm-5.3-flash', chiave: 'k', onEvento: (e) => eventi.push(e),
    cartellaDatiProgettoFn: async () => dati,
    sessionePerLibreria: () => ({ sessionId: 'sess-1', sessionNome: 'Sales report' }),
    salvaArtefattoFn: () => {},
    talosLavoraFn: async (input) => {
      for (const passo of passi) {
        try { risultati.push(await passo(input)); } catch (e) { risultati.push({ errore: e.code ?? e.message }); }
      }
      return { ok: true, esito: { comeFinita: 'concluso', detto: 'fatto' } };
    },
  });
  return { dati, eventi: eventi.filter((e) => e.type === 'ArtifactCreated'), risultati };
}

test('ART-UPD-S-01 — create salva la chat; update aggiunge la versione 2 sulla stessa voce e la carta resta sulla sua versione', async (t) => {
  let id;
  const { dati, eventi, risultati } = await servizio(t, [
    async (i) => { const r = await i.onArtefatto('Sales', HTML); id = r.voceLibreriaId; return r; },
    async (i) => i.onAggiornaArtefatto(id, { html: HTML.replace('Q1', 'Q2') }, { titolo: undefined }),
  ]);
  assert.match(id, /^lib-/u);
  assert.deepEqual(risultati[1], { versione: 2, totale: 2, titolo: 'Sales' });
  assert.equal(eventi.length, 2);
  assert.equal(eventi[0].versione, 1);
  assert.equal(eventi[1].voceLibreriaId, id);
  assert.equal(eventi[1].versione, 2);
  assert.equal((await leggiVoce({ cartella: dati, id })).testo, HTML.replace('Q1', 'Q2'));
  const versioni = await elencaVersioni({ cartella: dati, id });
  assert.deepEqual(versioni.map((v) => [v.n, v.sessionNome, v.modello]), [[1, 'Sales report', 'glm-5.3-flash'], [2, 'Sales report', 'glm-5.3-flash']]);
});

test('ART-UPD-S-02 — edits uno dopo l\'altro sul testo lasciato dai precedenti; uno ambiguo e niente si salva', async (t) => {
  let id;
  const { dati, risultati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('Sales', HTML)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto(id, { edits: [{ old: 'Q1', new: 'Q1 and Q2' }, { old: 'and Q2', new: 'and Q3' }] }, {}),
    async (i) => i.onAggiornaArtefatto(id, { edits: [{ old: 'Q', new: 'X' }] }, {}),
    async (i) => i.onAggiornaArtefatto(id, { edits: [{ old: 'Sales', new: 'Revenue' }, { old: 'nowhere', new: 'x' }] }, {}),
  ]);
  assert.equal(risultati[1].versione, 2);
  assert.equal((await leggiVersione({ cartella: dati, id, n: 2 })).testo, HTML.replace('Q1', 'Q1 and Q3'));
  assert.deepEqual(risultati[2], { errore: 'EDIT_AMBIGUOUS' });
  assert.deepEqual(risultati[3], { errore: 'EDIT_NOT_FOUND' }, 'tutto o niente: il primo edit riuscito non si salva da solo');
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 2);
});

test('ART-UPD-S-03 — un file caricato non è un artefatto; un id sconosciuto; troppo grande: niente salvato', async (t) => {
  let id;
  const { dati, risultati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('Sales', HTML)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto('lib-00000000-0000-4000-8000-000000000000', { html: HTML }, {}),
    async (i) => i.onAggiornaArtefatto(id, { html: `<p>${'x'.repeat(400_001)}</p>` }, {}),
  ]);
  assert.deepEqual(risultati[1], { errore: 'NOT_FOUND' });
  assert.deepEqual(risultati[2], { errore: 'ARTIFACT_TOO_LARGE' });
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 1);
  const file = await salvaVoce({ cartella: dati, nome: 'notes.html', mediaType: 'text/html', origine: 'uploaded', testo: HTML });
  const { risultati: r2 } = await servizio(t, [async (i) => i.onAggiornaArtefatto(file, { html: HTML }, {})]);
  assert.deepEqual(r2[0], { errore: 'NOT_FOUND' }, 'in un\'altra cartella dati la voce non c\'è');
  const { risultati: r3 } = await (async () => {
    const eventi = [];
    const risultati = [];
    await avviaSessione({ cartella: dati, task: { id: 't', consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
      cartellaDatiProgettoFn: async () => dati, salvaArtefattoFn: () => {},
      talosLavoraFn: async (input) => { try { risultati.push(await input.onAggiornaArtefatto(file, { html: HTML }, {})); } catch (e) { risultati.push({ errore: e.code }); } return { ok: true, esito: { comeFinita: 'concluso', detto: '' } }; } });
    return { risultati };
  })();
  assert.deepEqual(r3[0], { errore: 'NOT_AN_ARTIFACT' });
});

test('ART-UPD-S-04 — sola lettura (F-015): la versione nuova si mostra, la voce resta com\'era', async (t) => {
  let id;
  const { dati, eventi, risultati } = await servizio(t, [
    async (i) => { id = (await i.onArtefatto('Sales', HTML)).voceLibreriaId; },
    async (i) => i.onAggiornaArtefatto(id, { html: '<p>nuovo</p>' }, { copiaInLibreria: false }),
  ]);
  assert.deepEqual(risultati[1], { salvata: false, versione: 1, totale: 1, titolo: 'Sales' });
  assert.equal((await elencaVersioni({ cartella: dati, id })).length, 1);
  assert.equal((await leggiVoce({ cartella: dati, id })).testo, HTML);
  assert.equal(eventi[1].voceLibreriaId, undefined, 'la carta di sola lettura non punta alla voce');
});

test('ART-UPD-R-01 — il filo intero: il registro passa al servizio la chat che salva (id e nome VIVO), e artifact_update è fra gli attrezzi di serie', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-art-upd-r-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  const giri = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => {
      let risolvi;
      const fine = new Promise((ok) => { risolvi = ok; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` });
      return fine;
    },
    modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero', {});
  try {
    const { input } = giri[0];
    assert.equal(typeof input.sessionePerLibreria, 'function');
    assert.equal(input.sessionePerLibreria().sessionId, sessionId);
    assert.ok((input.strumentiEstesi ?? []).includes('artifact_update'), 'offerto di serie, accanto ad artifact_create');
  } finally {
    giri.forEach((g, k) => { g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }); });
  }
});
