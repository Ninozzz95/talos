/*
 * Spesa dei riassunti nella scheda Contesto (owner 30/10/2026 sera; contratto in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO-2026-10-30.md,
 * forma chiusa da CLI, Mobile e Performance). L'identificativo di UN riassunto lega le righe `consumo-di-servizio` dei suoi tentativi alla
 * riga «Riassunto al giro N»:
 * - nasce prima del primo tentativo e va su ogni riga di spesa e su ogni esito, anche quando il riassunto non viene applicato (CLI 1,
 *   Performance, Mobile 1);
 * - è unico per conversazione, anche fra due giri (CLI 2);
 * - la fine di `talos.compattazione` è durevole e lo porta (Mobile 4).
 * Server finto, nessuna chiave vera, nessuna porta fissa.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { idRiassuntoValido, nuovoIdRiassunto, valoreConsumoDiServizio } from '../src/kernel/consumo-di-servizio.mjs';
import { creaRecord } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const base = { scopo: 'riassunto', esito: 'completato', inPrimoPiano: true, usage: { prompt_tokens: 10, completion_tokens: 2 } };

test('RIAS-ID-01 — l\'id: unico a ogni chiamata, nella forma ammessa; la riga di spesa lo porta solo se valido', () => {
  const a = nuovoIdRiassunto(); const b = nuovoIdRiassunto();
  assert.notEqual(a, b);
  assert.ok(idRiassuntoValido(a) && idRiassuntoValido(b), `${a} ${b}`);
  assert.match(a, /^rias-[0-9a-f]{12}-\d+$/u);
  assert.equal(valoreConsumoDiServizio({ ...base, idRiassunto: a }).idRiassunto, a);
  /* al contrario: testo libero, vuoto, troppo lungo, non stringa ⇒ la riga nasce lo stesso, senza id (mai inventato) */
  for (const cattivo of ['testo con spazi', '', 'x'.repeat(129), 42, null, undefined]) {
    assert.equal('idRiassunto' in valoreConsumoDiServizio({ ...base, idRiassunto: cattivo }), false, String(cattivo));
  }
  assert.equal(creaRecord({ coveredThrough: 0, riassunto: [], idRiassunto: a }).idRiassunto, a);
  assert.equal('idRiassunto' in creaRecord({ coveredThrough: 0, riassunto: [] }), false, 'un record senza id resta come prima');
});

/* L'impianto di SERVIZIO-GIRO-09: storia oltre la soglia, dodici letture, riassunto col modello finto. `riassunto(n)` decide la risposta. */
async function giroConCompattazione(t, riassunto) {
  const { VARIABILE_TETTO_TOKEN } = await import('../src/kernel/compattazione-desktop.mjs');
  const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
  const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rias-id-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const storia = (coppie) => Array.from({ length: coppie }, (_, i) => [
    { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }]).flat();
  let coppie = 10; while (stima(storia(coppie + 1)) < 2600) coppie += 1;
  let fatte = 0; let pagati = 0;
  const interno = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { pagati += 1; return riassunto(pagati); }
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (fatte < 12) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function',
        function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'finta-deepseek' },
    keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  store.setRuntime('deepseek', { endpoint: 'http://127.0.0.1:9/deepseek' });
  const servizio = [];
  const fetchDiRete = creaFetchMultiProvider(interno, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) },
    fallbackProviders: [], onCambioFornitore: async () => {}, onConsumoFornitore: async () => {}, onConsumoDiServizio: async (v) => { servizio.push(v); } });
  const esiti = [];
  await talosLavora({ cartella, modello: 'deepseek:deepseek-chat', chiave: 'finta', task: { consegna: 'Leggi.' },
    messaggiIniziali: [...storia(coppie), { role: 'user', content: 'Leggi i file.' }], contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-(fine|preparata|annullata)$/u.test(e?.tipo ?? '')) esiti.push(e); } });
  return { servizio: servizio.filter((v) => v.scopo === 'riassunto'), esiti, pagati: () => pagati };
}
const riassuntoBuono = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1000, completion_tokens: 100 } });

test('RIAS-ID-02 — compattazione vera nel giro: ogni riga di spesa porta l\'id del SUO riassunto; il rapido senza modello non ha righe', async (t) => {
  const { servizio, esiti, pagati } = await giroConCompattazione(t, riassuntoBuono);
  const applicate = esiti.filter((e) => e.tipo === 'compattazione-fine' && e.compattato && !e.soloCoda);
  assert.ok(applicate.length >= 1 && pagati() >= 1, `premessa: un riassunto applicato e uno pagato (${applicate.length}, ${pagati()})`);
  assert.equal(servizio.length, pagati(), 'una riga per tentativo pagato');
  for (const v of servizio) assert.ok(idRiassuntoValido(v.idRiassunto), `riga senza id: ${JSON.stringify(v)}`);
  const idDi = (e) => e.record?.idRiassunto ?? e.idRiassunto;
  for (const e of applicate) {
    assert.ok(idRiassuntoValido(e.record?.idRiassunto), `record senza id: ${JSON.stringify(e.record?.idRiassunto)}`);
    /* «Mai aspettare»: il rapido applicato subito non paga niente ⇒ nessuna riga col suo id (a schermo «nessun costo»); uno col modello sì */
    const righe = servizio.filter((v) => v.idRiassunto === e.record.idRiassunto).length;
    if (e.ripiego === true && e.ragione === 'in-arrivo') assert.equal(righe, 0, 'il rapido senza modello non ha spesa');
    else assert.ok(righe >= 1, `riassunto col modello applicato senza le sue righe: ${e.record.idRiassunto}`);
  }
  /* ogni tentativo pagato appartiene a un esito detto (applicato o preparato): niente righe orfane, il banco le lega tutte */
  for (const v of servizio) assert.ok(esiti.some((e) => idDi(e) === v.idRiassunto), `riga senza esito: ${v.idRiassunto} — ${JSON.stringify(esiti.map((e) => [e.tipo, e.fase, idDi(e)]))}`);
  /* CLI 2: riassunti diversi, id diversi — il rapido e quello del modello che lo sostituirà sono due riassunti */
  const ids = new Set(applicate.map((e) => e.record.idRiassunto));
  assert.equal(ids.size, applicate.length, `id ripetuti: ${JSON.stringify(applicate.map((e) => e.record.idRiassunto))}`);
  assert.ok(!servizio.some((v) => ids.has(v.idRiassunto) && applicate.find((e) => e.record.idRiassunto === v.idRiassunto)?.ragione === 'in-arrivo'));
});

test('RIAS-ID-03 (CLI 1, Performance) — un riassunto pagato che FALLISCE: le righe dei tentativi e il suo esito non applicato hanno lo stesso id', async (t) => {
  /* due tentativi pagati e vuoti (con uso), sotto la soglia ⇒ il riassunto si annulla (regola di Hermes) e la sessione resta intatta */
  const vuoto = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 3 } });
  const { servizio, esiti, pagati } = await giroConCompattazione(t, vuoto);
  assert.ok(pagati() >= 1 && servizio.length >= 1, `premessa: almeno un tentativo pagato (${pagati()})`);
  const nonApplicati = esiti.filter((e) => e.compattato === false && idRiassuntoValido(e.idRiassunto));
  assert.ok(nonApplicati.length >= 1, `nessun esito non applicato con l'id: ${JSON.stringify(esiti.map((e) => [e.tipo, e.compattato, e.motivo, e.idRiassunto]))}`);
  for (const v of servizio) {
    assert.ok(idRiassuntoValido(v.idRiassunto), JSON.stringify(v));
    /* ogni tentativo pagato appartiene a un esito detto: niente righe orfane */
    assert.ok(esiti.some((e) => (e.idRiassunto ?? e.record?.idRiassunto) === v.idRiassunto), `riga senza esito: ${v.idRiassunto}`);
  }
});

test('RIAS-ID-04 (Mobile 4) — agent-service: la fine di talos.compattazione porta l\'id ed è DUREVOLE; anche la fine non applicata e l\'annullata', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rias-id-ospite-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const visti = [];
  const id = nuovoIdRiassunto();
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (evento, opzioni) => { visti.push({ evento, opzioni }); },
    talosLavoraFn: async (input) => {
      const record = creaRecord({ coveredThrough: 2, riassunto: [{ role: 'user', content: 'r' }], tokenPrima: 100, tokenDopo: 40, at: '2026-10-30T20:00:00.000Z', idRiassunto: id });
      input.onGiro?.({ giro: 1, tipo: 'compattazione-fine', compattato: true, record });
      input.onGiro?.({ giro: 2, tipo: 'compattazione-fine', compattato: false, motivo: 'vuoto', idRiassunto: 'rias-abc-2' });
      input.onGiro?.({ tipo: 'compattazione-annullata', at: '2026-10-30T20:00:00.000Z', coveredThrough: 2, motivo: 'giro-fallito', idRiassunto: id });
      input.onGiro?.({ giro: 3, tipo: 'compattazione-fine', compattato: false, motivo: 'vuoto', idRiassunto: 'testo libero' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
    } });
  const compattazioni = visti.filter((v) => v.evento?.type === 'CUSTOM' && v.evento.name === 'talos.compattazione');
  const [applicata, fallita, annullata, sporca] = compattazioni;
  assert.equal(compattazioni.length, 4, JSON.stringify(compattazioni.map((v) => v.evento.value)));
  assert.equal(applicata.evento.value.idRiassunto, id);
  assert.equal(applicata.opzioni?.durable, true, 'la fine applicata si rilegge dal giornale alla riapertura');
  assert.equal(fallita.evento.value.idRiassunto, 'rias-abc-2');
  assert.equal(fallita.opzioni?.durable, true);
  assert.equal(annullata.evento.value.fase, 'annullata');
  assert.equal(annullata.evento.value.idRiassunto, id);
  assert.equal('idRiassunto' in sporca.evento.value, false, 'un id non valido non passa (la lista è a campi ammessi)');
});
