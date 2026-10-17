/*
 * ⛔ SECONDA RIVERIFICA BREVE delle cure della G3 (bugfixer, 14/10/2026 sera) — commit `6a6bf7356` su `feat/goal`.
 *
 * Prove ROSSE apposta. Le cure di REV-05/06/07 fanno ciò che dicono; restano tre strade:
 *   · un verde FALSO su Windows che passa da un interno di cmd in testa (`call`, `(`, `if`): `programmaTrovato` vede l'interno
 *     («c'è») e `shellAnnidata` cerca `start` solo in testa o dopo `&&`;
 *   · un comando `!` della persona, o una FIGLIA ripresa, che partono DURANTE le prove: il controllo è solo all'inizio.
 * Misurato dall'esecutore VERO del kernel (`eseguiComandoSandboxato`, dove: 'windows') il 14/10/2026, con `programmaTrovato` vero:
 *   call talos-programma-che-non-esiste-xyz -q TODO x.js   atteso 1 → verdetto VERDE (codice 1)
 *   call start /b node -e "process.exit(1)"                atteso 0 → VERDE (codice 0)
 *   (start /b node -e "process.exit(1)")                   atteso 0 → VERDE
 *   if 1==1 start /b node -e "process.exit(1)"             atteso 0 → VERDE
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Seconda riverifica».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { verificaCriterio } from '../src/obiettivo/verifica.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sempreSi = async () => ({ consentito: true });
function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-cura2-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  for (let i = 0; i < 2000; i += 1) { if (condizione()) return; await passo(); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-REV-08 (S2) — `start` hidden behind a cmd internal at the head («call start», «(start», «if … start») still exits 0 and is still attributable', () => {
  for (const comando of ['call start /b npm test', '(start /b npm test)', 'if 1==1 start /b npm test']) {
    assert.equal(esitoAttribuibile(comando).ok, false, `${comando}: measured exit 0 whatever npm test does`);
  }
});

test('G3-REV-09 (S2) — on Windows a missing program behind «call» is GREEN when the criterion expects 1: `programmaTrovato` sees the internal «call», not the program', async (t) => {
  const cartella = progetto(t);
  const { programmaTrovato } = await import('../src/obiettivo/verifica.mjs');
  const comando = 'call talos-programma-che-non-esiste-xyz -q TODO x.js';
  const v = await verificaCriterio({ id: 'c1', verifica: { tipo: 'comando', comando, uscita: 1 } }, {
    cartella, permessoComando: sempreSi, permessoLettura: sempreSi,
    eseguiComando: async () => ({ codice: 1, ambiente: 'windows' }), // misurato dal kernel vero: 1
    programmaTrovato: (c) => programmaTrovato(c, { cartella, env: { PATH: cartella, PATHEXT: '.EXE' } }),
  });
  assert.notEqual(v.esito, 'verde', `a program that does not exist, behind «call», made the criterion ${v.esito}`);
});

/* Il registro con un esecutore delle prove che resta APPESO, e un comando diretto finto che si conta. */
function bancoAppeso(cartellaStore, cartella) {
  const appesi = [];
  const diretti = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: sempreSi,
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
    }),
    eseguiComandoDirettoFn: (argomenti) => { diretti.push(argomenti); return new Promise(() => {}); }, // resta in corso
  });
  return { ...b, appesi, diretti };
}
const CRITERI = [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }];

test('G3-REV-10 (S3) — a «!» command of the person started DURING the checks neither waits nor stops them: the result read while it writes is saved', async (t) => conStore(t, async (cartellaStore) => {
  /* La cura di REV-05 rifiuta di PARTIRE con un `!` in corso, ma `shell()` non guarda `voce.verificaObiettivo`: un `!npm run build`
     lanciato a metà prove gira insieme a loro, e l'esito si salva. */
  const cartella = progetto(t);
  const b = bancoAppeso(cartellaStore, cartella);
  const { sessionId } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }]);
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: CRITERI });
  const inCorso = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.appesi.length > 0, 'the check command starts');
  const diretto = b.registro.shell(sessionId, 'npm run build');
  await aspetta(() => diretto?.erroreAvvio !== undefined || b.diretti.length > 0, 'the «!» command starts, or is refused');
  const partito = diretto?.erroreAvvio === undefined && b.diretti.length > 0;
  b.appesi.shift()({ codice: 0 });
  const esito = await inCorso;
  assert.ok(!(partito && esito.ok === true), `a «!» command started during the checks (${partito}) AND their result was saved (${esito.ok === true})`);
}));

test('G3-REV-11 (S3) — a SUB-AGENT resumed during the checks of its mother writes in the same folder, and the mother’s result is saved', async (t) => conStore(t, async (cartellaStore) => {
  /* La cura di REV-03 ferma le prove all'avvio di un giro della MADRE; quella di REV-05 controlla le figlie vive all'INIZIO. Una
     figlia conclusa che la persona riprende (o a cui scrive) a metà prove parte con `avviaESegui` sulla SUA voce: le prove della madre
     non lo sanno. */
  const cartella = progetto(t);
  const b = bancoAppeso(cartellaStore, cartella);
  const { sessionId } = b.registro.avvia('task-vero', { permessi: 'Full access' });
  const madre = b.giri.at(-1);
  const delega = await madre.input.onDelega('fix the login loop', cartella, { modalita: 'modifica' });
  assert.equal(delega?.esito, 'avviato', `premise: a sub-agent is started (${JSON.stringify(delega)})`);
  const figliaId = delega.childId ?? delega.sessionId ?? delega.figlioId;
  assert.equal(typeof figliaId, 'string', `premise: the sub-agent id (${JSON.stringify(delega)})`);
  b.giri[1].concludi([{ role: 'assistant', content: 'child done' }]); // la figlia finisce mentre la madre lavora ancora
  await passo();
  madre.concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'done' }]);
  /* la madre può ripartire da sola per consegnare l'esito della figlia (C3): si lascia che lo faccia e si chiude quel giro, così
     che durante le prove nessun giro della MADRE parta (fermerebbe le prove, ed è la cura di REV-03, non ciò che si prova qui) */
  /* (terza riverifica: sotto carico 200 passi non bastavano — si aspetta A TEMPO che per 500 ms non parta più niente e che la madre
     sia ferma, come la G3-CURA-11 del coordinatore) */
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
  for (const fino = Date.now() + 20_000; Date.now() < fino && b.appesi.length === 0 && finita === null;) await new Promise((r) => setTimeout(r, 10));
  assert.equal(finita, null, `premise: the checks of the mother start (they were refused: ${JSON.stringify(finita?.reason ?? finita)})`);
  assert.ok(b.appesi.length > 0, 'premise: the check command starts');
  const ripresa = b.registro.resume(figliaId, 'also fix the logout');
  await aspetta(() => ripresa?.erroreAvvio !== undefined || b.giri.length > giriPrima, 'the sub-agent turn starts, or is refused');
  const partita = ripresa?.erroreAvvio === undefined && b.giri.length > giriPrima;
  assert.equal(b.giri.at(-1)?.input?.sessionId ?? figliaId, figliaId, 'premise: the turn that started is the sub-agent’s, not the mother’s');
  b.appesi.shift()({ codice: 0 });
  const esito = await inCorso;
  if (b.giri.length > giriPrima) b.giri.at(-1).concludi([{ role: 'assistant', content: 'child done again' }]);
  await passo();
  assert.ok(!(partita && esito.ok === true), `a sub-agent turn started during the checks (${partita}) AND the mother's result was saved (${esito.ok === true}: ${JSON.stringify(esito.code ?? esito.verifica?.riepilogo)})`);
}));
