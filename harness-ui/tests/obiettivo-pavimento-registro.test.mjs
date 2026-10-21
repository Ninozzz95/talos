/*
 * ⭐⭐⭐ /goal G5c — IL PAVIMENTO: un obiettivo SENZA contratto lo giudica il giudice sul testo intero, dopo ogni giro, come Claude
 * Code e Hermes fanno per ogni obiettivo. Sul registro vero, kernel e giudice finti. Nei due versi: un «sì» con un file d'impronta
 * attuale ⇒ (confutatore) «fatto»; un «no» ⇒ il ciclo riparte col motivo DENTRO il confine; senza un modello ⇒ fermo, come prima.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { impronta } from '../src/obiettivo/giudice.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const README = '# Install\nRun npm ci.\n';

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5c-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  /* G5D-REV-01 (20/10/2026): 5 s fissi sono caduti sul runner della release 0.1.31, sotto carico. Il tetto pesa solo quando la prova fallisce: la condizione si guarda ogni 5 ms e si esce appena è vera. */
  const fino = Date.now() + 60_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
function banco(cartellaStore, cartella, { giudice, modello = 'z-ai/glm-5.3-flash' }) {
  const domande = [];
  const b = registroAGiri(cartellaStore, {
    modello,
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    chiediAlModelloUnaVoltaFn: async ({ prompt }) => { domande.push(prompt); return giudice(prompt, domande.length); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
  });
  return { ...b, domande };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function giroCheScriveIlReadme(b, sessionId, cartella) {
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro parte');
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  b.giri.at(-1).concludi(fine);
}
const verdetto = (v) => JSON.stringify({ verdicts: [{ id: 'obiettivo', ...v }] });

test('PAV-REG-01 — senza contratto: il giudice valuta il TESTO intero; un «sì» con il README d\'impronta attuale ⇒ «fatto»', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => verdetto({ verdict: 'yes', reason: 'install documented', evidence: [{ path: 'README.md', sha256: impronta(README) }] }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document how to install the project');
  assert.equal(stato(b, sessionId).contratto, undefined, 'premessa: il pavimento, nessun contratto');
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto');
  assert.match(b.domande[0], /"text":"document how to install the project"/u, 'il criterio è il testo intero');
  assert.equal(stato(b, sessionId).giudizioDelTesto.esito, 'verde');
  assert.equal(stato(b, sessionId).confutazione.esito, 'regge', 'il confutatore (del banco) è passato prima del «fatto»');
}));

test('PAV-REG-02 AL CONTRARIO — un «no» del giudice: niente «fatto», il ciclo riparte col motivo DENTRO il confine dei dati', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => verdetto({ verdict: 'no', reason: 'the README has no install command' }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document how to install the project');
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.giri.length === giriPrima + 2, 'il ciclo riparte');
  const avviso = b.giri.at(-1).input.messaggiIniziali.at(-1);
  assert.equal(avviso.talosOrigin, 'goal-notice');
  assert.match(avviso.content, /does not see the goal met yet[\s\S]*<<<TALOS_DATA id=[0-9a-f]{12} from="goal judge">>>\nthe README has no install command\n<<<END_TALOS_DATA/u);
  assert.equal(stato(b, sessionId).giudizioDelTesto.esito, 'rosso');
  assert.equal(stato(b, sessionId).stato, 'attivo');
}));

test('PAV-REG-03 AL CONTRARIO — senza un modello della sessione il pavimento resta com\'era: nessun giudice, nessun giro in più', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { modello: 'm', giudice: () => verdetto({ verdict: 'yes' }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document how to install the project');
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(b.domande.length, 0);
  assert.equal(b.giri.length, giriPrima + 1);
  assert.equal(stato(b, sessionId).stato, 'attivo');
}));

test('PAV-REG-04 AL CONTRARIO — un giudice guasto sul pavimento: pausa «giudice guasto», mai «fatto»', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => 'All good!' });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document how to install the project');
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'pausa');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'giudice-guasto', dettaglio: 'forma' });
  await passo();
}));
