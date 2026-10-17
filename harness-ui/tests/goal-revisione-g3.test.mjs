/*
 * ⛔ REVISIONE AVVERSARIA del /goal G3 (bugfixer, 14/10/2026 sera) — le prove del contratto eseguite dal sistema.
 *
 * Prove ROSSE apposta sul codice di `feat/goal` alla testa `1d16a3968`: ognuna mostra un difetto; la cura non è qui.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { programmaTrovato, verificaCriterio } from '../src/obiettivo/verifica.mjs';
import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sempreSi = async () => ({ consentito: true });
function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-rev-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  for (let i = 0; i < 2000; i += 1) { if (condizione()) return; await passo(); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-REV-01 (S2) — on Windows a criterion that EXPECTS a failure is GREEN when the program does not exist: cmd exits 1 either way', async (t) => {
  /* `provaComando` confronta il codice con l'atteso PRIMA di chiedere a `programmaTrovato`: con `uscita: 1` (ammessa dal contratto:
     «grep -q TODO src/x.js esce 1 = il file non contiene TODO») un programma che non c'è fa uscire cmd con 1 — misurato dal commit
     stesso («cmd /d /s /c exits 1 (not 9009) for a missing program») — e il criterio è VERDE senza che niente sia stato provato.
     Su un Windows senza grep (quello di serie) ogni criterio così è verde per costruzione. In POSIX no: 127 ≠ 1. */
  const cartella = progetto(t);
  const criterio = { id: 'c1', testo: 'src/x.js has no TODO left', verifica: { tipo: 'comando', comando: 'grep -q TODO src/x.js', uscita: 1 } };
  const v = await verificaCriterio(criterio, {
    cartella, permessoComando: sempreSi, permessoLettura: sempreSi,
    eseguiComando: async () => ({ codice: 1, ambiente: 'windows' }), // «'grep' is not recognized…», exit 1
    programmaTrovato: async () => false, // ed è vero: grep non c'è
  });
  assert.notEqual(v.esito, 'verde', `a program that does not exist made the criterion ${v.esito}`);
  assert.equal(v.esito, 'non-verificabile');
  assert.equal(v.motivo?.tipo, 'command-not-found');
});

test('G3-REV-02 (S3) — Windows «app execution aliases» (python.exe, winget.exe, wt.exe in WindowsApps) are run by cmd but `programmaTrovato` says they do not exist', { skip: process.platform !== 'win32' }, async (t) => {
  /* Gli alias di esecuzione delle app sono reparse point: `stat` dà EACCES, `eUnFile` dice «no», e `programmaTrovato` risponde
     `false`. Misurato su questa macchina: `stat` EACCES su tutti e 20 gli .exe di `%LOCALAPPDATA%\Microsoft\WindowsApps` (python.exe,
     python3.exe, winget.exe, wt.exe, bash.exe, wsl.exe…), e `cmd /d /c winget --version` esce 0 (v1.29.380). Effetto: un
     `python -m pytest` col Python dello Store che fallisce DAVVERO diventa «non verificabile: comando che non c'è» — non consuma
     mai un tentativo, l'obiettivo non va mai in pausa, e la persona legge una cosa falsa. */
  const cartella = progetto(t);
  const alias = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps');
  let nomi = [];
  try { nomi = readdirSync(alias).filter((n) => n.toLowerCase().endsWith('.exe')); } catch { /* niente alias su questa macchina */ }
  const conEACCES = nomi.filter((n) => { try { statSync(join(alias, n)); return false; } catch (e) { return e.code === 'EACCES'; } });
  if (conEACCES.length === 0) { t.skip('no app execution alias with EACCES on this machine'); return; }
  const env = { PATH: alias, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  const nonTrovati = [];
  for (const nome of conEACCES) {
    const base = nome.slice(0, -4);
    if ((await programmaTrovato(`${base} --version`, { cartella, env })) === false) nonTrovati.push(base);
  }
  assert.deepEqual(nonTrovati, [], 'cmd runs these, and the check would call a real failure of theirs «command not found»');
});

/* Il banco del registro: esecutore finto che resta APPESO finché la prova non lo lascia andare (o arriva lo Stop). */
function bancoAppeso(cartellaStore, cartella) {
  const appesi = [];
  const chiamate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: sempreSi,
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      chiamate.push({ riga, o });
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
    }),
  });
  return { ...b, appesi, chiamate };
}

test('G3-REV-03 (S3) — «never while a turn is working» is checked only at the START: a turn sent during the checks starts, and the result read from half-written files is saved', async (t) => conStore(t, async (cartellaStore) => {
  /* `verificaObiettivo` rifiuta se un giro lavora ADESSO (`goal-check-while-working`), ma niente impedisce che un giro parta
     DOPO: `resume` (e la coda che consegna da sola) non guarda `voce.verificaObiettivo`. L'agente scrive mentre le prove leggono,
     e l'esito — che parla di uno stato di mezzo — si salva come ultima verifica, con i suoi tentativi. */
  const cartella = progetto(t);
  const b = bancoAppeso(cartellaStore, cartella);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const inCorso = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.appesi.length > 0, 'the check command starts');
  const giriPrima = b.giri.length;
  const ripresa = b.registro.resume(sessionId, 'continua');
  await passo();
  const giroPartito = ripresa?.erroreAvvio === undefined && b.giri.length > giriPrima;
  b.appesi.shift()({ codice: 1 });
  const esito = await inCorso;
  if (b.giri.length > giriPrima) b.giri.at(-1).concludi([{ role: 'assistant', content: 'r2' }]);
  await passo();
  assert.ok(!(giroPartito && esito.ok === true), `a turn started during the checks (${giroPartito}) AND their result was saved (${esito.ok === true}): ${JSON.stringify(esito.verifica?.riepilogo ?? esito)}`);
}));

test('G3-REV-04 (S3) — closing the registry (the server shutting down) does not stop a running check: its command keeps going up to 300 s', async (t) => conStore(t, async (cartellaStore) => {
  /* `MOTIVI_NON_VERIFICABILE` dichiara `stopped` per «obiettivo tolto, server che si spegne», ma `chiudi()` ferma le ricerche e la
     casa Linux, non `voce.verificaObiettivo.ferma`. Il comando della prova (fino a 300 s, un albero di processi) resta vivo dopo lo
     spegnimento, e il suo esito prova a scriversi su un registro chiuso. */
  const cartella = progetto(t);
  const b = bancoAppeso(cartellaStore, cartella);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const inCorso = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.chiamate.length > 0, 'the check command starts');
  await b.registro.chiudi({ attesaMassimaMs: 200 });
  const fermato = b.chiamate[0].o.segnaleStop?.aborted === true;
  if (!fermato) b.appesi.shift()?.({ codice: 0 }); // lo si lascia andare a mano, o la prova resterebbe appesa
  await inCorso.catch(() => {});
  assert.equal(fermato, true, 'the check command did not receive the Stop when the registry closed');
}));
