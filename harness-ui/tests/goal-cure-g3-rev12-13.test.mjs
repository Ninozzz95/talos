/*
 * ⭐ Le cure della terza riverifica della G3 (bugfixer, 14/10/2026 sera; prove rosse in `goal-revisione-g3-cure-3.test.mjs`):
 *   · REV-12: l'opzione attaccata (`start/b`) e `conhost`, negati; `&&` dentro le virgolette è testo (il falso rifiuto S5);
 *   · REV-13: un'altra conversazione sulla STESSA cartella ferma le prove (a metà) e le rifiuta (all'inizio); e un comando del
 *     modello ancora vivo in sottofondo le rifiuta all'inizio.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { conStore, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-cura3-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 20000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-CURA-12 — opzione attaccata e conhost negati; `&&` fra virgolette non apre un comando', () => {
  for (const [comando, operatore] of [
    ['start/b npm test', 'start'], ['START/WAIT x', 'start'], ['npm -v&&start/b x', 'start'], ['call/? x', 'call'],
    ['conhost.exe --headless npm test', 'conhost'], ['conhost npm test', 'conhost'], ['C:\\Windows\\System32\\conhost.exe x', 'conhost'],
  ]) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: false, operatore }, comando);
  }
  // AL CONTRARIO: dentro le virgolette `&&` e `start` sono testo; un `&&` vero fuori dalle virgolette apre ancora un comando
  for (const comando of ['echo "build&&start"', 'node -e "a&&start()"', "grep -q 'x&&call' log.txt", 'npm start/b']) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: true }, comando);
  }
  assert.deepEqual(esitoAttribuibile('echo "a&&b"&&start x'), { ok: false, operatore: 'start' });
});

function banco(cartellaStore, cartelle) {
  const appesi = [];
  const fermate = [];
  let n = 0;
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella: cartelle[Math.min(n++, cartelle.length - 1)], comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => { fermate.push(o.segnaleStop.reason); r({ codice: 130, fermatoSuRichiesta: true }); });
    }),
  });
  return { ...b, appesi, fermate };
}
const CRITERI = [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }];
const fine = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];

test('G3-CURA-13 — un\'altra conversazione sulla STESSA cartella: il suo giro ferma le prove; mentre lavora non partono; su un\'ALTRA cartella non c\'entra', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const altrove = progetto(t);
  // stessa cartella scritta in modo diverso (maiuscole su Windows, barra in fondo): è la stessa
  const stessa = process.platform === 'win32' ? `${cartella.toUpperCase()}\\` : `${cartella}/`;
  const b = banco(cartellaStore, [cartella, stessa, altrove]);
  const { sessionId: prima } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  const { sessionId: seconda } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  const { sessionId: terza } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  await new Promise((r) => setTimeout(r, 30));
  await b.registro.impostaObiettivo(prima, 'goal', { criteri: CRITERI });
  // 1) a metà prove parte un giro della seconda (stessa cartella) ⇒ le prove si fermano
  const inCorso = b.registro.verificaObiettivo(prima);
  await aspetta(() => b.appesi.length > 0, 'the check starts');
  b.registro.resume(seconda, 'refactor');
  await aspetta(() => b.fermate.length > 0, 'the checks are stopped');
  assert.deepEqual(b.fermate, ['turn-started']);
  assert.equal((await inCorso).reason, 'goal-check-stopped');
  // 2) mentre la seconda lavora ancora, le prove non partono
  assert.equal((await b.registro.verificaObiettivo(prima)).reason, 'goal-check-while-working');
  b.giri.at(-1).concludi([{ role: 'assistant', content: 'r2' }]);
  await aspetta(() => b.registro.esporta(seconda).conclusa === true, 'the other turn ends');
  // 3) AL CONTRARIO: un giro su un'ALTRA cartella non ferma niente, e le prove si salvano
  b.appesi.length = 0; b.fermate.length = 0;
  const ancora = b.registro.verificaObiettivo(prima);
  await aspetta(() => b.appesi.length > 0, 'the check starts again');
  b.registro.resume(terza, 'elsewhere');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(b.fermate, [], 'another folder: nothing stopped');
  b.appesi.shift()({ codice: 0 });
  assert.equal((await ancora).ok, true);
  b.giri.at(-1).concludi([{ role: 'assistant', content: 'r3' }]);
}));

test('G3-CURA-13b — un comando del modello ancora vivo in sottofondo: le prove non partono; finito, partono', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, [cartella]);
  const { sessionId } = b.registro.avvia('task-vero');
  // il giro lascia un comando in sottofondo (registrato e mai sganciato), poi finisce
  const sgancia = b.giri.at(-1).input.registraComandoFermabile({ toolCallId: 'tc-1', ferma: () => {} });
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.registro.esporta(sessionId).conclusa === true, 'the turn ends');
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: CRITERI });
  assert.equal((await b.registro.verificaObiettivo(sessionId)).reason, 'goal-check-while-working');
  assert.equal(b.appesi.length, 0);
  // AL CONTRARIO: il comando finisce ⇒ le prove partono
  sgancia();
  const esito = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.appesi.length > 0, 'the check starts');
  b.appesi.shift()({ codice: 0 });
  assert.equal((await esito).ok, true);
}));
