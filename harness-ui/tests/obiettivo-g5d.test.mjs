/*
 * ⭐⭐⭐ /goal G5d — owner 15/10/2026, tre risposte consigliate: il giudice vede i file di TUTTI i giri dell'obiettivo (salvati su
 * disco, riletti con l'impronta di adesso); giudice e confutatore entrano nel tetto dei token; e la riserva S5 del bugfixer (passando
 * dal pavimento al primo contratto le smentite ripartono). Nei due versi.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { impronta } from '../src/obiettivo/giudice.mjs';
import { FILE_SCRITTI_MASSIMI, conCiclo, conConfutazione, conContratto, nuovoObiettivo, obiettivoValido } from '../src/obiettivo/stato.mjs';
import { nuovoContratto } from '../src/obiettivo/contratto.mjs';

const ADESSO = '2026-10-15T10:00:00.000Z';
const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const README = '# Install\nRun npm ci.\n';
const CONTRATTO = { criteri: [
  { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } },
  { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } },
] };
const CICLO = { giri: 1, token: 0, senzaProgresso: 0 };

/* ── lo stato, puro ── */
test('G5D-01 — conCiclo ricorda i file scritti: i più recenti per primi, senza doppioni, entro il tetto; una forma sbagliata non è un obiettivo', () => {
  let o = nuovoObiettivo({ testo: 'g', id: 'ob-11111111-2222-4333-8444-555555555555', adesso: ADESSO }).obiettivo;
  o = conCiclo(o, CICLO, { adesso: ADESSO, scritti: ['a.js', 'b.js'] }).obiettivo;
  o = conCiclo(o, CICLO, { adesso: ADESSO, scritti: ['c.js', 'a.js', '', 7] }).obiettivo;
  assert.deepEqual(o.fileScritti, ['c.js', 'a.js', 'b.js']);
  assert.equal(obiettivoValido(o), true);
  o = conCiclo(o, CICLO, { adesso: ADESSO }).obiettivo;
  assert.deepEqual(o.fileScritti, ['c.js', 'a.js', 'b.js'], 'un giro senza scritture non dimentica i giri prima');
  const molti = Array.from({ length: FILE_SCRITTI_MASSIMI + 10 }, (_, i) => `f${i}.js`);
  assert.equal(conCiclo(o, CICLO, { adesso: ADESSO, scritti: molti }).obiettivo.fileScritti.length, FILE_SCRITTI_MASSIMI);
  for (const male of [['x'.repeat(1_001)], [''], 'a.js', Array.from({ length: FILE_SCRITTI_MASSIMI + 1 }, (_, i) => `f${i}`)]) {
    assert.equal(obiettivoValido({ ...o, fileScritti: male }), false, JSON.stringify(male).slice(0, 40));
  }
});

test('G5D-02 — riserva S5: dal pavimento al PRIMO contratto le smentite ripartono; da un contratto a un altro NO (un criterio in più non sfugge al confutatore)', () => {
  const a = nuovoContratto(CONTRATTO);
  assert.equal(a.ok, true, 'premessa: contratto in forma');
  let o = nuovoObiettivo({ testo: 'g', id: 'ob-11111111-2222-4333-8444-555555555555', adesso: ADESSO }).obiettivo;
  o = conConfutazione(o, { esito: 'smentito', motivo: 'no', prove: [{ percorso: 'a.js' }] }, { smentiteMassime: 2, adesso: ADESSO }).obiettivo;
  assert.equal(o.smentite, 1, 'premessa: una smentita sul pavimento');
  const conIlPrimo = conContratto(o, a.contratto, { adesso: ADESSO }).obiettivo;
  assert.equal(conIlPrimo.smentite, undefined);
  assert.equal(conIlPrimo.confutazione, undefined);
  const smentito = conConfutazione(conIlPrimo, { esito: 'smentito', motivo: 'no', prove: [{ percorso: 'a.js' }] }, { smentiteMassime: 2, adesso: ADESSO }).obiettivo;
  const b = nuovoContratto({ criteri: [...CONTRATTO.criteri, { testo: 'lint passes', verifica: { tipo: 'comando', comando: 'npm run lint' } }] });
  const conIlSecondo = conContratto(smentito, b.contratto, { adesso: ADESSO }).obiettivo;
  assert.equal(conIlSecondo.smentite, 1, 'il conto resta');
});

/* ── il registro ── */
function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5d-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 5000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
function banco(cartellaStore, cartella, { giudice, ...opzioni }) {
  const domande = [];
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async ({ prompt, onConsumo }) => { domande.push(prompt); onConsumo?.({ prompt_tokens: 100, completion_tokens: 20 }); return giudice(prompt, domande.length); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    ...opzioni,
  });
  return { ...b, domande };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
function scriviIlReadme(b, cartella) {
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
}
const no = JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'no', reason: 'add the npm ci line to the quick start too' }] });
const si = JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'yes', reason: 'install section', evidence: [{ path: 'README.md', sha256: impronta(README) }] }] });

test('G5D-REG-01 — il README scritto al giro 1 resta una prova al giro 2, che non scrive niente: il giudice lo rivede e il «sì» vale', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: (_p, n) => (n === 1 ? no : si) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro della persona');
  scriviIlReadme(b, cartella);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.giri.length === giriPrima + 2, 'il «no» fa ripartire il ciclo');
  assert.deepEqual(stato(b, sessionId).fileScritti, ['README.md'], 'ricordato su disco');
  b.giri.at(-1).concludi(fine); // il giro 2: nessuna scrittura
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto col README del giro prima');
  assert.match(b.domande[1], new RegExp(impronta(README), 'u'), 'il giudice del giro 2 riceve il README del giro 1');
}));

test('G5D-REG-02 — il tetto dei token conta anche il giudice (ogni tentativo pagato) e il confutatore (tutti i giri della figlia)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => si, confutaObiettivoFn: async () => ({ esito: 'regge', motivo: 'ok', token: 777 }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length >= 2, 'il giro');
  scriviIlReadme(b, cartella);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto');
  assert.equal(stato(b, sessionId).ciclo.token, 120 + 777, 'giudice 100+20, confutatore 777, il giro finto 0');
}));

test('G5D-REG-03 AL CONTRARIO — «Riprendi» senza un giro nuovo: i file di un giro nato PRIMA dell\'obiettivo non si ricordano come suoi', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => no });
  const sessionId = await conversazioneFerma(b);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'scrivi il readme');
  await aspetta(() => b.giri.length === giriPrima + 1, 'un giro prima dell\'obiettivo');
  scriviIlReadme(b, cartella);
  b.giri.at(-1).concludi(fine);
  await passo(); await passo();
  await new Promise((r) => setTimeout(r, 5)); // l'obiettivo nasce DOPO quel giro (millisecondi diversi)
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  await b.registro.pausaObiettivo(sessionId);
  await b.registro.riprendiObiettivo(sessionId);
  await aspetta(() => b.domande.length >= 1, 'il ciclo della ripresa chiama il giudice');
  await aspetta(() => (stato(b, sessionId).ciclo?.token ?? 0) > 0, 'il ciclo della ripresa ha salvato');
  assert.equal(stato(b, sessionId).fileScritti, undefined, 'il README era del giro di prima');
}));
