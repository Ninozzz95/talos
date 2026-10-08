/*
 * ⛔ BUG-8 tranche 1 (04/10/2026) — l'osservatore di silenzio delle domande di approvazione.
 * Il difetto nel vivo (tre volte oggi, ai revisori): l'agente resta appeso su una domanda di
 * consenso che la UI non mostra più (WS ricaduto, finestra chiusa) — la sessione SEMBRA morta,
 * lo stop c'è ma nessuno lo preme perché nessuno vede il fermo. La cura: la domanda viene
 * RIGIOCATA ai vivi (effimera: mai su disco, mai nella cronologia) finché qualcuno risponde,
 * con un colpo CUSTOM che porta da quanto aspetta. MAI una risoluzione automatica.
 * Solo superficie pubblica del registro (niente bisa sui metodi interni).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: preparaEsecuzioneFinta, preparaEsecuzioneLiberaFn: preparaLiberaFinta, cartellaEsisteFn: () => true, ...opzioni });
}
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new Error(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'prova il silenzio' } };
}
function preparaLiberaFinta(_cartelle, { cartellaLibera, consegna }) {
  return { cartella: cartellaLibera, comandoProva: null, task: { id: 'libero:x', consegna, consegnaCorta: String(consegna).slice(0, 80) } };
}
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giro(i) { return giri[i]; },
    get quanti() { return giri.length; },
  };
}
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const sommario = (registro, sessionId) => registro.elenca().find((s) => s.sessionId === sessionId);
const domandeViste = (visti) => visti.filter((e) => e.type === 'ApprovalRequested');
const colpiSilenzio = (visti) => visti.filter((e) => e.type === 'CUSTOM' && e.name === 'attesa-approvazione-silenzio');
/* Pulizia onesta: se una domanda è ancora aperta la chiude col canale pubblico, così nessun test
   lascia un timer che ticcheta per sempre (il fallimento di un assert non deve appesi i successivi). */
const chiudiUltimaDomanda = (registro, sessionId, visti) => {
  const ultima = [...visti].reverse().find((e) => e.type === 'ApprovalRequested');
  if (!ultima) return;
  try { registro.rispondiApprovazione(sessionId, ultima.requestId, false); } catch { /* già chiusa: va bene lo stesso */ }
};

function registroConDomandaAperta({ prima = 40, ripeti = 40 } = {}) {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, attesaSilenzioPrimaMs: prima, attesaSilenzioRipetiMs: ripeti });
  const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'normale', permessiScelto: 'Full access' });
  const visti = [];
  const disiscrivi = registro.iscriviti(sessionId, (evento) => visti.push(evento));
  const domanda = giri.giro(0).input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test' });
  return { giri, registro, sessionId, visti, disiscrivi, domanda };
}

test('BUG8-SILENZIO-RIGIOCA: la domanda in attesa torna ai vivi (effimera) finché qualcuno risponde', async () => {
  const { registro, sessionId, visti, disiscrivi, domanda } = registroConDomandaAperta({ prima: 40, ripeti: 40 });
  try {
    await attendi(20);
    // la domanda ORIGINALE è arrivata una volta sola, senza marca di rigioco, ed è STORIA (persistita)
    assert.equal(domandeViste(visti).length, 1);
    assert.equal(domandeViste(visti)[0].rigiocoAttesa, undefined);
    const requestId = domandeViste(visti)[0].requestId;
    const persistite = registro.esporta(sessionId).eventi.filter((e) => e.type === 'ApprovalRequested');
    assert.equal(persistite.length, 1);
    assert.equal(persistite[0].requestId, requestId);

    // dopo il primo scadere: rigioco con marca + colpo CUSTOM con l'età dell'attesa
    await attendi(70);
    const rigiocate = domandeViste(visti).filter((e) => e.rigiocoAttesa === true);
    assert.equal(rigiocate.length >= 1, true, 'la domanda deve tornare ai vivi');
    assert.equal(rigiocate[0].requestId, requestId);
    assert.deepEqual(rigiocate[0].azione, { tipo: 'shell', comando: 'npm test' });
    const colpi = colpiSilenzio(visti);
    assert.equal(colpi.length >= 1, true, 'il colpo di silenzio deve arrivare');
    assert.equal(colpi[0].value.requestId, requestId);
    assert.equal(typeof colpi[0].value.attesaMs, 'number');
    assert.equal(colpi[0].value.attesaMs >= 0, true);
    assert.equal(colpi[0].value.tipo, 'shell');

    // il rigioco è AVANZAMENTO: la storia persistita resta com'era (effimero per costruzione)
    assert.equal(registro.esporta(sessionId).eventi.filter((e) => e.type === 'ApprovalRequested').length, 1);
    assert.equal(registro.esporta(sessionId).eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'attesa-approvazione-silenzio').length, 0);

    // risponde la persona: la domanda si risolve VERA e il rigioco tace
    assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, true), { ok: true });
    assert.equal(await domanda, true);
    const quante = domandeViste(visti).length + colpiSilenzio(visti).length;
    await attendi(110);
    assert.equal(domandeViste(visti).length + colpiSilenzio(visti).length, quante, 'dopo la risposta nessun rigioco nuovo');
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});

test('BUG8-CHIUSA-TACE: chiusa la domanda (nega della persona) il rigioco tace e la Promise chiude false', async () => {
  const { registro, sessionId, visti, disiscrivi, domanda } = registroConDomandaAperta({ prima: 30, ripeti: 30 });
  try {
    await attendi(20);
    const requestId = domandeViste(visti)[0].requestId;
    assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, false), { ok: true });
    assert.equal(await domanda, false);
    const quante = visti.length;
    await attendi(120);
    assert.equal(visti.length, quante, 'dopo la chiusura nessun rigioco nel vuoto');
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});

test('BUG8-DOMANDA-SUBBITO-DOPO: una nuova domanda sulla stessa voce riceve solo i propri tick', async () => {
  const { giri, registro, sessionId, visti, disiscrivi, domanda } = registroConDomandaAperta({ prima: 30, ripeti: 30 });
  try {
    await attendi(20);
    const vecchio = domandeViste(visti)[0].requestId;
    assert.deepEqual(registro.rispondiApprovazione(sessionId, vecchio, false), { ok: true });
    assert.equal(await domanda, false);
    // la tool-call successiva apre una SECONDA domanda nello stesso giro
    const domanda2 = giri.giro(0).input.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'a.txt' });
    await attendi(15);
    const nuovo = domandeViste(visti).at(-1).requestId;
    assert.notEqual(nuovo, vecchio);
    await attendi(100); // oltre il primo tick del NUOVO timer e di ogni residuo del VECCHIO
    const perVecchio = domandeViste(visti).filter((e) => e.requestId === vecchio && e.rigiocoAttesa === true);
    assert.equal(perVecchio.length, 0, 'la domanda vecchia non rigioca dopo essere stata risolta');
    const perNuovo = domandeViste(visti).filter((e) => e.requestId === nuovo && e.rigiocoAttesa === true);
    assert.equal(perNuovo.length >= 1, true, 'la domanda nuova rigioca regolarmente');
    assert.equal(colpiSilenzio(visti).every((c) => c.value.requestId === nuovo), true, 'mai un colpo per la domanda sbagliata');
    assert.deepEqual(registro.rispondiApprovazione(sessionId, nuovo, false), { ok: true });
    assert.equal(await domanda2, false);
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});

test('BUG8-STATO-DA: lo stato della sessione dice da quanto aspetta, e torna null quando non aspetta', async () => {
  const { registro, sessionId, visti, disiscrivi, domanda } = registroConDomandaAperta({ prima: 5_000, ripeti: 5_000 });
  try {
    await attendi(20);
    const inAttesa = sommario(registro, sessionId);
    assert.equal(inAttesa.inAttesaApprovazione, true);
    assert.equal(typeof inAttesa.inAttesaApprovazioneDaMs, 'number');
    assert.equal(inAttesa.inAttesaApprovazioneDaMs >= 0, true);
    const requestId = registro.esporta(sessionId).eventi.filter((e) => e.type === 'ApprovalRequested').at(-1).requestId;
    assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, true), { ok: true });
    assert.equal(await domanda, true);
    const chiusa = sommario(registro, sessionId);
    assert.equal(chiusa.inAttesaApprovazione, false);
    assert.equal(chiusa.inAttesaApprovazioneDaMs, null);
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});

test('BUG8-ELIMINA-RIFIUTA-VIVA: una sessione in attesa non si elimina, e il rigioco continua finché la chiusura non la spegne', async () => {
  // il contratto del registro: «running-stop-before-delete». La domanda pendente È un giro aperto:
  // l'eliminazione rifiuta, il watchdog segue la sessione (è viva e deve continuare a farsi sentire).
  const { registro, sessionId, visti, disiscrivi, domanda } = registroConDomandaAperta({ prima: 30, ripeti: 30 });
  try {
    await attendi(70); // almeno un rigioco: la sessione aspetta DAVVERO
    const rigiocoPrima = domandeViste(visti).filter((e) => e.rigiocoAttesa === true).length;
    assert.equal(rigiocoPrima >= 1, true);
    const esitoElimina = await registro.elimina(sessionId);
    assert.equal(esitoElimina.ok, undefined, 'l\'eliminazione di una sessione in attesa deve essere rifiutata');
    assert.equal(esitoElimina.code, 'SESSION_STILL_RUNNING');
    const quante = visti.length;
    await attendi(80);
    assert.equal(visti.length > quante, true, 'la sessione viva continua a rigiocare la domanda');
    // e quando la chiusura arriva, il rigioco tace
    const requestId = domandeViste(visti)[0].requestId;
    assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, false), { ok: true });
    assert.equal(await domanda, false);
    const quanteDopo = visti.length;
    await attendi(100);
    assert.equal(visti.length, quanteDopo);
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});

/* R2/M1 (revisione BUG-8 t1): la cura promette che `negaApprovazionePendente` CANCELLA il timer
   dell'osservatore (fermaOsservatore), non solo che lo rende sordo. La prova misurabile: il
   numero di timer vivi nel processo. Domanda aperta → esattamente UN timer in più (l'osservatore);
   reindirizza → torna alla base: il timer NON esiste più (sotto il mutante che toglie
   `pendente.fermaOsservatore?.()` il conto resta +1 e questo test va rosso). */
test('BUG8-OSSERVATORE-FERMO: fermata la domanda (reindirizza) il rigioco tace davvero — e la domanda risolve false', async () => {
  /* ⛔ REG-FUORI-03B (06/10): con la cura unref i timer dell'osservatore NON compaiono più in
     process.getActiveResourcesInfo() (lì si vedono solo le risorse che tengono vivo il loop) — il vecchio
     conteggio «1 timer aperto → 0 dopo» non osserva più nulla. La garanzia si prova COMPORTAMENTALMENTE:
     con attese brevi (40/40ms) i colpi di silenzio parlano finché la domanda è viva; dopo il reindirizza
     NESSUN colpo e NESSUN evento nuovo (il timer è cancellato, non lasciato «sordo»), e restano le prove
     nero-scatola del processo in tests/session-registry.test.mjs (REG-FUORI-03B + R1/R2). */
  const { registro, sessionId, visti, disiscrivi, domanda } = registroConDomandaAperta({ prima: 40, ripeti: 40 });
  try {
    await attendi(150); // oltre tre tick: l'osservatore parla finché la domanda è viva
    assert.equal(colpiSilenzio(visti).length >= 1, true, 'con la domanda aperta il rigioco parla (l\'osservatore è armato)');
    const esito = registro.reindirizza(sessionId, 'nuova direzione: il giro muore, la domanda pure');
    assert.deepEqual(esito.ok, true);
    const colpiAlReindirizza = colpiSilenzio(visti).length;
    const vistiAlReindirizza = visti.length;
    await attendi(150); // oltre tre tick di un timer sopravvissuto: se non fosse cancellato, parlerebbe ancora
    assert.equal(visti.length, vistiAlReindirizza, 'dopo il reindirizza nessun evento nuovo');
    assert.equal(colpiSilenzio(visti).length, colpiAlReindirizza, 'dopo il reindirizza nessun colpo di silenzio nuovo (timer cancellato, non sordo)');
    assert.equal(domandeViste(visti).filter((e) => e.rigiocoAttesa === true).length,
      domandeViste(visti.slice(0, vistiAlReindirizza)).filter((e) => e.rigiocoAttesa === true).length,
      'dopo il reindirizza nessun rigioco nuovo per la domanda chiusa');
    assert.equal(await domanda, false, 'la domanda chiusa dal reindirizzamento risolve false al modello');
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});

/* R2/M6 (revisione BUG-8 t1): il guard «sessioni.get(voce.sessionId) === voce» deve tacere il
   rigioco quando la voce È USCITA dal registro, anche con la domanda ancora aperta. Scena: il
   giro FINISCE (RunFinished) lasciando la domanda aperta — la voce resta registrata e il rigioco
   continua (test sopra) — poi la sessione si elimina: da lì il timer non deve più parlare, e la
   catena deve spegnersi da sola (nessun timer che ticchetta nel vuoto). Sotto il mutante che
   toglie il guard, gli eventi continuano dopo l'eliminazione e questo test va rosso. */
test('BUG8-VOCE-FUORI-REGISTRO: la voce cancellata non tiene vivo il rigioco nel vuoto', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, attesaSilenzioPrimaMs: 40, attesaSilenzioRipetiMs: 40 });
  const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'normale', permessiScelto: 'Full access' });
  const visti = [];
  const disiscrivi = registro.iscriviti(sessionId, (evento) => visti.push(evento));
  try {
    giri.giro(0).input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test' });
    await attendi(20);
    // il giro FINISCE lasciando la domanda aperta: la voce resta nel registro e il rigioco prosegue
    giri.giro(0).input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
    giri.giro(0).risolvi({});
    await attendi(60);
    const rigiocoPrimaDiElimina = domandeViste(visti).filter((e) => e.rigiocoAttesa === true).length;
    assert.equal(rigiocoPrimaDiElimina >= 1, true, 'con la voce ancora registrata il rigioco prosegue (la domanda è viva)');
    // la sessione conclusa si elimina: la voce ESCE dal registro con la domanda ancora aperta
    const esitoElimina = await registro.elimina(sessionId);
    assert.equal(esitoElimina.ok, true, 'la sessione conclusa si elimina anche con la domanda aperta');
    const quante = visti.length;
    await attendi(150); // oltre due tick del timer sopravvissuto (prima=40, ripeti=40)
    assert.equal(visti.length, quante, 'voce fuori dal registro: nessun rigioco nel vuoto (guard M6)');
    assert.equal(domandeViste(visti).filter((e) => e.rigiocoAttesa === true).length, rigiocoPrimaDiElimina,
      'nessun rigioco nuovo dopo l\'eliminazione');
  } finally { chiudiUltimaDomanda(registro, sessionId, visti); disiscrivi(); }
});
