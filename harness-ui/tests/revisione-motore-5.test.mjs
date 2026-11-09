/*
 * Fifth adversarial review of the local engine block, the registry part (REVISIONE-BLOCCO-MOTORE-5-2026-11-01.md, R-10, R-11), taken from the reviewer's file
 * `prove-revisione-blocco-motore-5/rev5.test.mjs`: after the cures they are expected green.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as ms } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anelloDaUsare, catenaDelRiassunto } from '../src/kernel/catena-del-riassunto.mjs';
import { motoreDelPostoUnico, VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const LOCALE = 'local:aperto.gguf';
const CLOUD = 'z-ai/glm-5.3-flash';
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await ms(10); }
  throw new Error(messaggio);
}
function scena(t, { scelto, riserva = null, risposta }) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaDiProva('talos-rev5-');
  const chiamate = [];
  const pendenti = [];
  const riassumi = (input) => { chiamate.push(input); return risposta(input, pendenti); };
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, modello: LOCALE, chiave: 'k', riassumiPerCompattazioneFn: riassumi,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    modelloRiassuntoFn: () => scelto, sceltaDelRiassuntoFn: () => ({ modelloDelRiassunto: scelto, riservaDelRiassunto: riserva }), localiInsiemeFn: () => false });
  t.after(async () => {
    for (const p of pendenti) p();
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: LOCALE });
  return { registro, sessionId, giri, chiamate, cartellaStore };
}
/* il remoto cade per sovraccarico; il modello aperto resta appeso e onora lo stop, come la richiesta vera */
const remotoGiuApertoAppeso = (input, pendenti) => {
  if (input.modello !== LOCALE) return Promise.reject(Object.assign(new Error('overloaded'), { status: 503 }));
  return new Promise((risolvi, rifiuta) => {
    pendenti.push(() => risolvi({ scelta: { role: 'assistant', content: 'RIASSUNTO' }, finishReason: 'stop', usage: null }));
    input.segnaleStop?.addEventListener('abort', () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
};

test('T-10 la catena: scelto remoto fermo, riserva locale diversa ⇒ scrive il sostituto; il motore del posto unico si calcola dallo scelto', () => {
  const c = catenaDelRiassunto({ scelto: CLOUD, riserva: { provider: 'local', model: 'scelto.gguf' }, modelloConversazione: LOCALE, localeCaricato: LOCALE, inUnGiro: true, conSostituto: true,
    statoDi: (id) => (id === CLOUD ? { stato: 'bloccato', motivo: 'limite', finoAlle: null } : null) });
  assert.equal(anelloDaUsare(c).ruolo, 'sostituto');
  assert.equal(anelloDaUsare(c).modello, LOCALE);
  assert.equal(motoreDelPostoUnico(CLOUD), null, 'session-registry.mjs:6546 calcola il motore da `scelta.modello`');
});

test('T-11 prova contraria: scelto locale, la persona scrive mentre il sostituto riassume ⇒ il riassunto cede', async (t) => {
  const s = scena(t, { scelto: 'local:scelto.gguf', risposta: remotoGiuApertoAppeso });
  s.giri[0].concludi(storiaGrande());
  await attendi(() => s.chiamate.some((c) => c.modello === LOCALE), 'il sostituto non è partito');
  const delSostituto = s.chiamate.find((c) => c.modello === LOCALE);
  s.registro.resume(s.sessionId, 'messaggio nuovo');
  assert.equal(delSostituto.segnaleStop?.aborted, true);
});

test('R-10 scelto remoto caduto e riserva locale: il sostituto scrive sul posto unico ma la persona che scrive non lo ferma', async (t) => {
  const s = scena(t, { scelto: CLOUD, riserva: { provider: 'local', model: 'scelto.gguf' }, risposta: remotoGiuApertoAppeso });
  s.giri[0].concludi(storiaGrande());
  await attendi(() => s.chiamate.some((c) => c.modello === LOCALE), `il sostituto non è partito: ${JSON.stringify(s.chiamate.map((c) => c.modello))}`);
  const delSostituto = s.chiamate.find((c) => c.modello === LOCALE);
  s.registro.resume(s.sessionId, 'messaggio nuovo');
  assert.equal(delSostituto.segnaleStop?.aborted, true, `il riassunto del modello aperto non cede: segnale ${delSostituto.segnaleStop ? 'presente' : 'assente'}, chiamate ${JSON.stringify(s.chiamate.map((c) => c.modello))}`);
});

test('R-11 un sostituto che risponde 404: l\'avviso durevole porta ruolo «sostituto» (valore nuovo) e il modello della chat finisce «inutilizzabile»', async (t) => {
  const s = scena(t, { scelto: 'local:scelto.gguf', risposta: (input) => (input.modello === LOCALE ? Promise.reject(Object.assign(new Error('not found'), { status: 404 })) : Promise.reject(new Error('mai'))) });
  s.giri[0].concludi(storiaGrande());
  await attendi(() => s.giri.length === 1, 'giro');
  await attendiScritture({ cartellaStore: s.cartellaStore });
  await s.registro.compatta(s.sessionId).catch(() => null);
  await attendiScritture({ cartellaStore: s.cartellaStore });
  const avvisi = readFileSync(join(s.cartellaStore, `${s.sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r))
    .filter((e) => e?.name === 'talos.riassunto-modello-inutilizzabile').map((e) => e.value);
  assert.deepEqual(avvisi.filter((v) => !['scelto', 'riserva'].includes(v.ruolo)).map((v) => ({ ruolo: v.ruolo, modello: v.modello, scelto: v.scelto })), []);
});
