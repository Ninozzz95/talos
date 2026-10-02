import assert from 'node:assert/strict';
import test from 'node:test';

import { leggiEsitoComando, dovEGirato, rigaDiStatoComando } from '../../src/components/esito-comando.js';

/*
 * PO-06 — l'esito di un comando scritto dalla persona, detto a una persona.
 * Le forme grezze qui sotto sono quelle MISURATE sul kernel il 10/09/2026, non inventate.
 */

test('PO-06: un comando riuscito dice che è riuscito, e l’output resta intero', () => {
  const e = leggiEsitoComando('exit 0 [sandbox: none]\nciao-po06\n');
  assert.equal(e.uscita, 0);
  assert.equal(e.riuscito, true);
  assert.equal(e.fermato, false);
  assert.equal(e.output, 'ciao-po06\n', 'l’intestazione sparisce, l’output no');
  assert.equal(e.verdetto, 'Riuscito');
});

/*
 * ⛔ IL CASO CHE GIUSTIFICA IL MODULO. Misurato il 10/09 sulla macchina dell'owner: `!npm --version`
 * risponde con l'npm di LINUX. Chi scrive un comando crede di parlare al proprio computer.
 */
test('PO-06: se il comando è girato in Linux invece che su Windows, si dice', () => {
  const e = leggiEsitoComando('exit 0 [sandbox: wsl2]\n11.16.0\n');
  assert.equal(e.livello, 'wsl2');
  assert.equal(e.dove, 'in Linux (WSL), non su Windows');
  assert.match(rigaDiStatoComando(e), /Linux \(WSL\), non su Windows/);
});

/*
 * ⛔ LA BUGIA PEGGIORE DELLA CATENA, misurata: `sleep 300` torna dopo 120.082 ms con codice `null`,
 * testo VUOTO e `outcome:{type:'success'}` — cioè un comando fermato a metà è indistinguibile da uno
 * finito bene e muto. Il kernel è di un'altra lane e non possiamo ripararlo qui; possiamo smettere
 * di ripetere la sua bugia.
 */
test('PO-06, AL CONTRARIO: un comando fermato dal tempo massimo non passa per riuscito', () => {
  const e = leggiEsitoComando('exit null [sandbox: wsl2]\n');
  assert.equal(e.uscita, null);
  assert.equal(e.riuscito, false, '⛔ se questo diventa true, a schermo un comando troncato sembra andato bene');
  assert.equal(e.fermato, true);
  /*
   * ⛔ 20/09/2026 — LA CAUSA NON SI NOMINA PIÙ, e la riga aveva torto. Diceva «ha superato il tempo
   *   massimo», che sulla strada Windows è **falso per costruzione**: lì il kernel normalizza
   *   (`talosHarness.mjs:4867`: `fermatoDalTempo ? 124 : codice`), quindi un codice nullo è un
   *   processo ucciso da un segnale, non un tempo scaduto. Si dice il fatto che sappiamo.
   */
  assert.equal(e.verdetto, 'Fermato: il comando non ha restituito un codice d\'uscita');
  assert.equal(e.verdetto.includes('tempo massimo'), false, '⛔ da qui la causa non è verificabile: non si inventa');
  assert.equal(e.output, '', 'e non c’è output da mostrare: è esattamente ciò che confonde');
});

test('PO-06: un codice diverso da zero è un esito, non un guasto — e porta il suo numero', () => {
  const e = leggiEsitoComando('exit 7 [sandbox: wsl2]\nFUORI\n\nERR');
  assert.equal(e.uscita, 7);
  assert.equal(e.riuscito, false);
  assert.equal(e.fermato, false);
  assert.equal(e.verdetto, 'Non riuscito · codice 7');
  assert.equal(e.output, 'FUORI\n\nERR', 'l’output aggregato si mostra INTERO: un comando fallito scrive spesso su stdout');
});

test('PO-06: senza il livello di isolamento non si inventa un posto', () => {
  const e = leggiEsitoComando('exit 0\nsolo output\n');
  assert.equal(e.uscita, 0);
  assert.equal(e.livello, null);
  assert.equal(e.dove, null);
  assert.equal(rigaDiStatoComando(e), 'Riuscito', 'niente «su ignoto»: si tace');
});

/*
 * ⛔⛔ LE FORME VERE, NON QUELLE COMODE — 20/09/2026, difetto misurato: il kernel **non** scrive
 *   `[sandbox: none]`, scrive l'etichetta SPIEGATA (`etichettaSandbox`: `none (cmd.exe nativo: …)`),
 *   e `dovEGirato` confrontava il livello esatto ⇒ restituiva `null` per **tutte e tre**. Il «dove»
 *   è stato invisibile da quando esiste `etichettaSandbox`, cioè da una cura del BLOCCO 6 — e la
 *   promessa centrale di PO-06 («quel comando non è girato su Windows: se non è così, si dice») era
 *   **inerte**. Questa prova usa le stringhe che il kernel produce davvero: se qualcuno torna a
 *   confrontare il livello intero, diventa rossa.
 */
test('⛔ il «dove» si legge ANCHE dall\'etichetta spiegata che scrive il kernel', () => {
  assert.equal(dovEGirato('none (cmd.exe nativo: stesso utente e stessi privilegi del processo, nessun isolamento)'), 'su Windows, senza isolamento');
  assert.equal(dovEGirato('wsl2 (namespace Linux: filesystem e processi separati)'), 'in Linux (WSL), non su Windows');
  assert.equal(dovEGirato('adb-shell-on-device (shell sul dispositivo collegato, fuori da questa macchina)'), 'sul telefono collegato');
  /* e le forme corte restano valide: chi le scrive sono le sessioni registrate prima di oggi */
  assert.equal(dovEGirato('wsl2'), 'in Linux (WSL), non su Windows');
  assert.equal(dovEGirato('none'), 'su Windows, senza isolamento');
  /* ⛔ E la frase intera, com'è a schermo: è questa che una persona legge su un comando fallito. */
  const e = leggiEsitoComando('exit 1 [sandbox: none (cmd.exe nativo: …)]\nERR\n');
  assert.equal(rigaDiStatoComando(e), 'Non riuscito · codice 1 · su Windows, senza isolamento');
});

test('PO-06, AL CONTRARIO: un livello che non conosciamo NON si traduce a caso', () => {
  assert.equal(dovEGirato('firecracker-v3'), null);
  assert.equal(dovEGirato(''), null);
  assert.equal(dovEGirato(null), null);
  assert.equal(dovEGirato(undefined), null);
});

test('PO-06, AL CONTRARIO: un testo che non è un esito di comando resta intatto, senza verdetto', () => {
  const e = leggiEsitoComando('REFUSED. Empty html: nothing was created.');
  assert.equal(e.output, 'REFUSED. Empty html: nothing was created.');
  assert.equal(e.verdetto, '', 'nessun verdetto su un testo che non abbiamo capito');
  assert.equal(e.riuscito, false);
});

test('PO-06: il tempo si scrive solo se lo sappiamo davvero', () => {
  const e = leggiEsitoComando('exit 0 [sandbox: none]\n');
  assert.equal(rigaDiStatoComando(e, 131), 'Riuscito · su Windows, senza isolamento · 131 ms');
  assert.equal(rigaDiStatoComando(e, 2091), 'Riuscito · su Windows, senza isolamento · 2.1 s');
  /* ⛔ `Number(null) === 0`: senza la guardia un tempo ASSENTE diventerebbe «0 ms», cioè un dato
     mancante travestito da misura. Stesso difetto già pagato oggi sulla dimensione di un allegato. */
  assert.equal(rigaDiStatoComando(e, null), 'Riuscito · su Windows, senza isolamento');
  assert.equal(rigaDiStatoComando(e), 'Riuscito · su Windows, senza isolamento');
  assert.equal(rigaDiStatoComando(e, NaN), 'Riuscito · su Windows, senza isolamento');
});

test('PO-06: un codice d’uscita negativo non si perde per strada', () => {
  const e = leggiEsitoComando('exit -1 [sandbox: none]\n');
  assert.equal(e.uscita, -1);
  assert.equal(e.verdetto, 'Non riuscito · codice -1');
});

/*
 * ⛔ 02/10/2026, owner («sì, come i Processi») — un comando FERMATO non è un comando NON RIUSCITO; e le righe che
 *   l'adattatore desktop mette davanti all'intestazione per il modello non devono togliere il verdetto.
 */
test('ESITO-FERMATO: 130/143 «Annullato», 124/137 «Terminato a forza» — come la scheda Processi; gli altri restano «Non riuscito»', () => {
  for (const [codice, verdetto, annullato, terminato] of [
    [130, 'Annullato · codice 130', true, false], [143, 'Annullato · codice 143', true, false],
    [124, 'Terminato a forza · codice 124', false, true], [137, 'Terminato a forza · codice 137', false, true],
    [1, 'Non riuscito · codice 1', false, false], [2, 'Non riuscito · codice 2', false, false],
  ]) {
    const e = leggiEsitoComando(`exit ${codice} [sandbox: none]\nx`);
    assert.equal(e.verdetto, verdetto);
    assert.equal(e.annullato, annullato, `annullato per ${codice}`);
    assert.equal(e.terminato, terminato, `terminato per ${codice}`);
    assert.equal(e.riuscito, false);
  }
});

test('ESITO-PREAMBOLO: il testo VERO del 4174 (avviso del canale combinato in testa) ha di nuovo il suo verdetto', () => {
  // il contenuto della prova dal vivo dello Stop (sessione 26d2c9e3…), con la frase nuova
  const vero = "[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 130 [sandbox: wsl2 (Linux in WSL come root; nessun isolamento: /mnt/c è il disco di Windows con i diritti dell'utente Windows di TALOS, e lì i permessi Linux non valgono)]\n⛔ L'ha fermato la persona dalla scheda Processi, apposta, mentre girava. Non rilanciarlo se non te lo chiede.";
  const e = leggiEsitoComando(vero);
  assert.equal(e.uscita, 130);
  assert.equal(e.verdetto, 'Annullato · codice 130');
  assert.equal(e.dove, 'in Linux (WSL) come root, non su Windows');
  assert.equal(e.output.startsWith('⛔ L\'ha fermato la persona'), true, 'l’avviso per il modello, in inglese, non va a schermo');
  const fallito = leggiEsitoComando('[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 1 [sandbox: wsl2]\nerrore vero');
  assert.equal(fallito.verdetto, 'Non riuscito · codice 1', 'prima di oggi qui non c’era NESSUN verdetto: un fallimento dell’agente non si diceva');
  const powershell = leggiEsitoComando('⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: PowerShell emitted a structured error.\n[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 0 [sandbox: none]\nout');
  assert.equal(powershell.uscita, 0);
  assert.match(powershell.output, /^⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT/u, 'l’avviso di PowerShell è un fatto sul comando: resta');
  const nonEsito = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nnessuna intestazione';
  assert.equal(leggiEsitoComando(nonEsito).verdetto, '');
  assert.equal(leggiEsitoComando(nonEsito).output, nonEsito, 'senza intestazione il testo resta INTATTO, avviso compreso');
});

test('ESITO-RIFERIMENTO: la riga «[TALOS output reference…]» del server non va nella card; il resto dell’output sì', async () => {
  const { senzaIntestazione } = await import('../../src/components/esito-comando.js');
  // il contenuto VERO del giornale del 4174 (sessione 26d2c9e3…, 02/10/2026), testata e riferimento come li scrive il server
  const vero = "exit 0 [sandbox: wsl2 (Linux in WSL come root; nessun isolamento)]\n[TALOS output reference: 8e43f812-0d81-4ef5-b325-c3d21da089c9; retained 23 of 23 bytes.] Read retained bytes with process_output({\"outputId\":\"8e43f812-0d81-4ef5-b325-c3d21da089c9\"}); follow nextOffset, and select stderr separately.\nEXIT_CODE=0 DURATA=61s";
  const e = leggiEsitoComando(vero);
  assert.equal(e.verdetto, 'Riuscito');
  assert.equal(e.output, 'EXIT_CODE=0 DURATA=61s');
  assert.equal(senzaIntestazione(vero), 'EXIT_CODE=0 DURATA=61s', 'la card dell’agente usa senzaIntestazione');
  const fermato = leggiEsitoComando("[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 130 [sandbox: wsl2]\n[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 0 of 0 bytes.] Read retained bytes with process_output({\"outputId\":\"849de2b1-d1cf-4099-ab0c-146b601c58f0\"}); follow nextOffset, and select stderr separately.\n⛔ Fermato su richiesta.");
  assert.equal(fermato.output, '⛔ Fermato su richiesta.');
  const pieno = leggiEsitoComando('exit 0\n[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 1048576 of 9000000 bytes; the retention limit was reached.]\nriga');
  assert.equal(pieno.output, 'riga', 'anche senza la frase di recupero e col tetto raggiunto');
  // AL CONTRARIO: la riga della conservazione fallita dice una cosa vera e resta; un riferimento più sotto è output del comando
  const fallito = 'exit 0\n[TALOS output retention failed (OUTPUT_STORE_IO); the command already ran; do not rerun automatically. Output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0.]\nout';
  assert.equal(leggiEsitoComando(fallito).output.startsWith('[TALOS output retention failed'), true);
  const sotto = 'exit 0\nprima riga\n[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 1 of 1 bytes.]\n';
  assert.equal(leggiEsitoComando(sotto).output, 'prima riga\n[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 1 of 1 bytes.]\n');
  assert.equal(leggiEsitoComando('[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 1 of 1 bytes.]\nnon è un esito').verdetto, '', 'senza testata non si tocca niente');
});
