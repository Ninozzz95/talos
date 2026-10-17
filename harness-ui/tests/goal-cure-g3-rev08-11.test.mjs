/*
 * ⭐ Le cure della seconda riverifica della G3 (bugfixer, 14/10/2026 sera; prove rosse in `goal-revisione-g3-cure-2.test.mjs`).
 * Qui le prove che le rendono VIVE una per una:
 *   · REV-08: le parole di cmd che lanciano un altro comando, negate in posizione di comando e NON altrove;
 *   · REV-09: `programmaTrovato` dietro `call` e `@` cerca il programma vero, dietro `if`/`for`/`(` dice «non so»;
 *   · REV-10/11: chi comincia a lavorare a metà prove le FERMA (prima rete), anche quando ha già finito prima che le prove
 *     tornino — il caso che il ricontrollo al salvataggio (seconda rete) non può vedere.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { programmaTrovato } from '../src/obiettivo/verifica.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-cura-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 20000; // sotto carico (una suite intera accanto) 5 s non bastavano: misurato 5,06 s
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-CURA-08 — in posizione di comando (testa, dopo `&&` anche attaccato, dopo `&` di PowerShell) start/call/if/for/( si negano; altrove no', () => {
  for (const [comando, operatore] of [
    ['call start /b npm test', 'call'], ['(start /b npm test)', '('], ['if 1==1 start /b npm test', 'if'], ['for %i in (1) do npm test', 'for'],
    ['npm test&&start /b x', 'start'], ['npm test && (start x)', '('], ['s^tart /b x', 'start'], ['@call x', 'call'], ['& start x', 'start'],
    ['START /B x', 'start'], ['start.exe x', 'start'],
  ]) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: false, operatore }, comando);
  }
  // AL CONTRARIO: la stessa parola fuori dalla posizione di comando, o dentro le virgolette, non nasconde niente
  for (const comando of ['npm start', 'npm run lint && npm test', 'node call.js', 'echo call', 'node -e "if (1) {}"', 'git log --format=for', 'node scripts/start.mjs']) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: true }, comando);
  }
});

test('G3-CURA-09 — `programmaTrovato` dietro `call`/`@` cerca il programma vero; dietro if/for/( non sa; un interno da solo c\'è', async (t) => {
  const cartella = progetto(t);
  const env = { PATH: cartella, PATHEXT: '.EXE' };
  const esiste = async (p) => p.toLowerCase().split(/[\\/]/u).pop() === 'vero.exe'; // il NOME intero: `@vero.exe` non è `vero.exe`
  const trovato = (c) => programmaTrovato(c, { cartella, env, esiste });
  assert.equal(await trovato('call talos-che-non-c-e -q x'), false);
  assert.equal(await trovato('@call @talos-che-non-c-e'), false);
  assert.equal(await trovato('call call vero -x'), true);
  assert.equal(await trovato('@vero'), true);
  for (const c of ['if 1==1 vero', 'for %i in (1) do vero', '(vero)', 'call']) assert.equal(await trovato(c), null, c);
  // AL CONTRARIO: un interno di cmd che non lancia niente c'è sempre; un programma che non c'è, da solo, non c'è
  assert.equal(await trovato('echo ciao'), true);
  assert.equal(await trovato('talos-che-non-c-e'), false);
});

/* Le prove che restano appese finché non le si libera; un comando `!` e un giro di figlia che si possono far FINIRE. */
function banco(cartellaStore, cartella) {
  const appesi = [];
  const diretti = [];
  const fermate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => { fermate.push(o.segnaleStop.reason); r({ codice: 130, fermatoSuRichiesta: true }); });
    }),
    eseguiComandoDirettoFn: () => new Promise((fine) => { diretti.push(fine); }),
  });
  return { ...b, appesi, diretti, fermate };
}
const CRITERI = [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }];
const conversazione = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];

test('G3-CURA-10 — un `!` partito E FINITO a metà prove le ha fermate lo stesso: l\'esito non si salva', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella);
  const { sessionId } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(conversazione);
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: CRITERI });
  const inCorso = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.appesi.length > 0, 'the check starts');
  assert.deepEqual(b.registro.shell(sessionId, 'npm run build'), { ok: true });
  b.diretti.shift()({ codice: 0, testo: '' }); // il `!` finisce PRIMA che le prove tornino: il ricontrollo al salvataggio non lo vede
  await new Promise((r) => setTimeout(r, 20));
  const esito = await inCorso;
  assert.equal(esito.reason, 'goal-check-stopped', JSON.stringify(esito));
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo.verifica, undefined, 'nessun esito salvato');
  // AL CONTRARIO: senza nessuno che parta, le stesse prove si salvano
  b.appesi.length = 0; // la prova di prima l'ha liberata la fermata
  const ancora = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.appesi.length > 0, 'the check starts again');
  b.appesi.shift()({ codice: 0 });
  assert.equal((await ancora).ok, true);
}));

test('G3-CURA-11 — il giro di una FIGLIA partito e finito a metà prove della madre le ha fermate: l\'esito non si salva', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella);
  const { sessionId } = b.registro.avvia('task-vero', { permessi: 'Full access' });
  const madre = b.giri.at(-1);
  /* la figlia lavora in una SOTTOCARTELLA: con la stessa cartella le prove le fermerebbe anche la regola di REV-13 (stessa
     cartella), e qui si prova la risalita della CATENA */
  const sotto = join(cartella, 'pacchetto');
  mkdirSync(sotto);
  const delega = await madre.input.onDelega('fix the login loop', sotto, { modalita: 'modifica' });
  const figliaId = delega.childId ?? delega.sessionId ?? delega.figlioId;
  assert.equal(typeof figliaId, 'string', JSON.stringify(delega));
  b.giri[1].concludi([{ role: 'assistant', content: 'child done' }]);
  await passo();
  madre.concludi(conversazione);
  /* la madre riparte da sola, su un timer, a consegnare l'esito della figlia: si chiude ogni suo giro e si aspetta A TEMPO che per
     500 ms non parta più niente (terza riverifica: 200 passi del ciclo degli eventi non bastavano, rossa 3 su 3 sotto carico) */
  let chiusi = b.giri.length;
  let quieteDal = Date.now();
  for (const fino = Date.now() + 20_000; Date.now() < fino;) {
    await new Promise((r) => setTimeout(r, 10));
    if (b.giri.length > chiusi) { b.giri.at(-1).concludi([{ role: 'assistant', content: 'delivered' }]); chiusi = b.giri.length; quieteDal = Date.now(); }
    if (Date.now() - quieteDal > 500 && b.registro.esporta(sessionId).conclusa === true) break;
  }
  const giriPrima = b.giri.length;
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: CRITERI });
  let finita = null;
  const inCorso = b.registro.verificaObiettivo(sessionId).then((e) => { finita = e; return e; });
  await aspetta(() => b.appesi.length > 0 || finita !== null, 'the check starts');
  assert.equal(finita, null, `premise: the checks of the mother start (${JSON.stringify(finita)})`);
  b.registro.resume(figliaId, 'also fix the logout');
  await aspetta(() => b.giri.length > giriPrima, 'the sub-agent turn starts');
  assert.equal(b.giri.at(-1).input.sessionId ?? figliaId, figliaId);
  // la fermata arriva quando PARTE il giro della figlia — prima che la madre riparta da sola a consegnarne l'esito, che le
  // fermerebbe comunque: così si prova la risalita della catena, non la cura di REV-03
  await aspetta(() => b.fermate.length > 0, 'the checks are stopped when the sub-agent turn starts');
  assert.deepEqual(b.fermate, ['turn-started']);
  // la figlia FINISCE prima che le prove tornino: al salvataggio è di nuovo ferma, e solo la prima rete l'ha vista
  b.giri.at(-1).concludi([{ role: 'assistant', content: 'child done again' }]);
  await new Promise((r) => setTimeout(r, 50));
  const esito = await inCorso;
  assert.equal(esito.reason, 'goal-check-stopped', JSON.stringify(esito));
}));
