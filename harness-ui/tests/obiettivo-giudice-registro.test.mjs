/*
 * ⭐⭐⭐ /goal G5 — IL GIUDICE NEL CICLO, sul registro vero (giornale su disco). Il kernel è finto: emette le scritture del giro e si
 * chiude quando la prova lo dice; il modello del giudice è finto e conta le chiamate. Nei due versi: un «sì» con le prove di adesso
 * fa «fatto»; un «sì» senza prove, un «no» o un giudice guasto non lo fanno MAI.
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
const CONTRATTO = { criteri: [
  { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } },
  { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } },
] };

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 5000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
/** Il banco: prove a comando finte, il modello del giudice finto (`giudice(prompt, n)` → testo, o lancia). */
function banco(cartellaStore, cartella, { comandoVerde = true, giudice, ...opzioni }) {
  const domande = [];
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: comandoVerde ? 0 : 1, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async ({ prompt, modello }) => { domande.push({ prompt, modello }); return giudice(prompt, domande.length); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    ...opzioni,
  });
  return { ...b, domande };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
/** Il giro della persona: scrive README.md (evento vero di `scrivi`) e risponde. */
async function giroCheScriveIlReadme(b, sessionId, cartella) {
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro parte');
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  onEvento({ type: 'TextMessageStart', messageId: 'm1' });
  onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: 'Done: README written.' });
  b.giri.at(-1).concludi(fine);
}
const si = (prove) => JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'yes', reason: 'install section', evidence: prove }] });

test('GIUDICE-REG-01 — comandi verdi e un «sì» che cita il README con l\'impronta di ADESSO ⇒ «fatto», col modello della sessione', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => si([{ path: 'README.md', sha256: impronta(README) }]) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto');
  assert.equal(b.domande.length, 1, 'una domanda al giudice');
  assert.equal(b.domande[0].modello, 'z-ai/glm-5.3-flash', 'il modello della sessione');
  assert.match(b.domande[0].prompt, /UNTRUSTED JSON DATA/u);
  assert.match(b.domande[0].prompt, new RegExp(impronta(README), 'u'), 'il giudice riceve l\'impronta del file scritto');
  const c2 = stato(b, sessionId).verifica.verdetti.find((v) => v.id === 'c2');
  assert.equal(c2.esito, 'verde');
  assert.deepEqual(c2.giudizio.prove, [{ percorso: 'README.md', impronta: impronta(README) }]);
  assert.equal(stato(b, sessionId).daGuardare, 0, 'niente «da guardare»: l\'ha giudicato il giudice');
}));

test('GIUDICE-REG-02 AL CONTRARIO — un «sì» senza prove, o con un\'impronta vecchia, NON fa «fatto»: il ciclo riparte e lo dice', async (t) => {
  for (const [nome, risposta] of [['senza prove', si([])], ['impronta vecchia', si([{ path: 'README.md', sha256: impronta('vecchio') }])]]) {
    await conStore(t, async (cartellaStore) => {
      const cartella = progetto(t);
      const b = banco(cartellaStore, cartella, { giudice: () => risposta });
      const sessionId = await conversazioneFerma(b);
      await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
      const giriPrima = b.giri.length;
      await giroCheScriveIlReadme(b, sessionId, cartella);
      await aspetta(() => b.giri.length === giriPrima + 2, `${nome}: il ciclo riparte`);
      assert.notEqual(stato(b, sessionId).stato, 'fatto', nome);
      assert.equal(stato(b, sessionId).verifica.verdetti.find((v) => v.id === 'c2').esito, 'non-verificabile', nome);
      assert.match(b.giri.at(-1).input.messaggiIniziali.at(-1).content, /c2 COULD NOT BE CHECKED/u, nome);
    }, `talos-g5-${nome.replace(/\s/gu, '-')}-`);
  }
});

test('GIUDICE-REG-03 — un «no» è rosso: il motivo del giudice guida il giro dopo, DENTRO il confine dei dati', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'no', reason: 'the README has no install command' }] }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.giri.length === giriPrima + 2, 'il ciclo riparte');
  const testo = b.giri.at(-1).input.messaggiIniziali.at(-1).content;
  assert.match(testo, /c2 FAILED/u);
  assert.match(testo, /judge says:\n<<<TALOS_DATA id=[0-9a-f]{12} from="goal judge">>>\nthe README has no install command\n<<<END_TALOS_DATA/u);
  assert.equal(stato(b, sessionId).verifica.verdetti.find((v) => v.id === 'c2').motivo.tipo, 'judge-not-met');
}));

test('GIUDICE-REG-04 AL CONTRARIO — un giudice che non risponde o risponde illeggibile: pausa «giudice guasto» col tipo, MAI «fatto»', async (t) => {
  const casi = [
    ['trasporto', () => { throw new Error('401'); }],
    ['forma', () => 'Everything looks complete to me!'],
  ];
  for (const [tipo, giudice] of casi) {
    await conStore(t, async (cartellaStore) => {
      const cartella = progetto(t);
      const b = banco(cartellaStore, cartella, { giudice });
      const sessionId = await conversazioneFerma(b);
      await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
      const giriPrima = b.giri.length;
      await giroCheScriveIlReadme(b, sessionId, cartella);
      await aspetta(() => stato(b, sessionId).stato === 'in-pausa', `${tipo}: pausa`);
      assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'giudice-guasto', dettaglio: tipo });
      assert.equal(b.domande.length, 2, `${tipo}: i tentativi del banco, poi basta`);
      await passo(); await passo();
      assert.equal(b.giri.length, giriPrima + 1, `${tipo}: niente riparte`);
    }, `talos-g5-${tipo}-`);
  }
});

test('GIUDICE-REG-05 AL CONTRARIO — con una prova a comando rossa il giudice NON si chiama (si ripara prima quella)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { comandoVerde: false, giudice: () => si([{ path: 'README.md', sha256: impronta(README) }]) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.giri.length === giriPrima + 2, 'il ciclo riparte per il comando rosso');
  assert.equal(b.domande.length, 0);
  assert.equal(stato(b, sessionId).verifica.verdetti.find((v) => v.id === 'c2').esito, 'da-giudicare');
}));

test('GIUDICE-REG-06 AL CONTRARIO — il README cambia mentre il CONFUTATORE pensa: il «fatto» non si salva, il ciclo rifà la verifica', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, {
    giudice: () => si([{ path: 'README.md', sha256: impronta(README) }]),
    confutaObiettivoFn: async () => { writeFileSync(join(cartella, 'README.md'), '# Install\nchanged by hand\n'); return { esito: 'regge', motivo: 'ok' }; },
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.domande.length >= 2, 'il ciclo rifà la verifica e richiede il giudice');
  await passo(); await passo();
  assert.notEqual(stato(b, sessionId).stato, 'fatto', 'il contenuto giudicato non è quello consegnato');
}));
