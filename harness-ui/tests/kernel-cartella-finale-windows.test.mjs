import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import {
  argomentiWslPerScript,
  cartellaFinaleValida,
  codaCheStampaLaCartella,
  eseguiComandoSandboxato,
  MARCATORE_CARTELLA,
  nuovoMarcatoreCartella,
  staccaCartellaFinale,
} from '../src/kernel/talosHarness.mjs';

/*
 * ⛔ 16/09 — il tracciamento della cartella dopo un comando NON funzionava sul ramo Windows, e funzionava su POSIX.
 *   Segnalato dalla sessione «talos cli», riprodotto qui PRIMA della cura: POSIX → '/home/x', Windows → null con CRLF
 *   e null anche con un solo LF. La causa non è il fine riga: è che `echo.` va a capo dopo il marcatore e `printf` no.
 *   ⇒ Vive in un file suo, fuori da `talosHarness.test.mjs`, perché quel file è in lavorazione in un'altra corsia.
 */
const M = MARCATORE_CARTELLA;

test('CWD-WIN-01 — la coda Windows (`echo.` che va a capo, CRLF) restituisce la cartella stampata da `cd`', () => {
  assert.equal(staccaCartellaFinale(`out\r\n${M}\r\nC:\\Users\\x\r\n`).cartella, 'C:\\Users\\x');
});

test('CWD-WIN-02 — anche con un solo LF dopo il marcatore: la controprova che non era il \\r', () => {
  assert.equal(staccaCartellaFinale(`out\n${M}\nC:\\Users\\x\n`).cartella, 'C:\\Users\\x');
});

test('CWD-POSIX-01 — la coda POSIX (`printf` senza a-capo, percorso sulla stessa riga) continua a funzionare', () => {
  assert.equal(staccaCartellaFinale(`out\n${M}/home/x\n`).cartella, '/home/x');
});

test('CWD-TESTO-01 — il testo restituito è l\'uscita del comando SENZA la coda, nei due rami', () => {
  assert.equal(staccaCartellaFinale(`riga 1\r\nriga 2\r\n${M}\r\nC:\\x\r\n`).testo, 'riga 1\r\nriga 2');
  assert.equal(staccaCartellaFinale(`riga 1\nriga 2\n${M}/x\n`).testo, 'riga 1\nriga 2');
});

test('⛔ AL CONTRARIO — senza marcatore, o con il marcatore e NIENTE dopo (un `cd` fallito), la cartella è null', () => {
  assert.equal(staccaCartellaFinale('solo uscita\n').cartella, null);
  assert.equal(staccaCartellaFinale(`out\r\n${M}\r\n\r\n`).cartella, null);
  assert.equal(staccaCartellaFinale(`out\n${M}`).cartella, null);
});

/*
 * ⛔⛔⛔ CLI-REQ-01 (17/09/2026) — UN COMANDO DIGITATO CHE FALLISCE DICEVA «exit 0».
 *
 * La coda che stampa la cartella è l'ULTIMA cosa che la shell esegue, quindi il codice d'uscita
 * della shell era quello della coda — e la coda riesce sempre. Chi digita `!comando` nel
 * compositore leggeva `exit 0` su un comando fallito (`agent-service.mjs:2069`), e con «comandi
 * nella conversazione» acceso lo leggeva anche il modello.
 *
 * ⛔ Queste prove girano su cmd.exe e su WSL VERI: è l'unico posto dove il difetto esiste. Una
 * finta dell'esecutore non l'avrebbe mai mostrato — `tests/agent-service.test.mjs:675` asserisce
 * `exit 0 [sandbox: wsl2]` da uno stub, ed era verde tutto il tempo.
 *
 * ⛔ MISURATO da me su questa macchina il 17/09/2026 (Windows 11, Node v24.18.0, WSL Ubuntu), in
 * una cartella pulita E in una ostile che porta `exit.bat/.cmd`, `set.bat/.cmd`, `cd.bat/.cmd`,
 * `echo.bat` e un file senza estensione chiamato `echo`: 15 comandi × 2 cartelle = 30 righe,
 * confrontate col codice di `cmd` nudo. Coda di oggi **12/30**; coda adottata **30/30**; nessun
 * file batch è mai stato invocato. Le varianti che tengono la cartella anche al fallimento
 * (`|| (echo.MARK& cd& exit /b 1)` → 26/30, `exit /b` nudo → 12/30, `call set TALOS_RC=…` →
 * 12/30) sono state misurate e scartate: l'owner ha deciso che, se non si può avere entrambe,
 * vince il CODICE D'USCITA. Su WSL non c'è nessun costo: coda di oggi 4/8, coda adottata 8/8,
 * con la cartella ancora nota al fallimento.
 */
const SU_WINDOWS = process.platform === 'win32';

function cartellaDiProvaWindows({ ostile = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'talos-uscita-cmd-'));
  mkdirSync(join(base, 'sub'));
  if (ostile) {
    for (const nome of ['exit.bat', 'exit.cmd', 'set.bat', 'set.cmd', 'cd.bat', 'cd.cmd', 'echo.bat']) {
      writeFileSync(join(base, nome), '@echo DIROTTATO\r\n@exit /b 99\r\n', 'ascii');
    }
    writeFileSync(join(base, 'echo'), 'non un eseguibile\n', 'ascii');
  }
  return base;
}

const suWindows = (comando, cartella) => eseguiComandoSandboxato(comando, cartella, { dove: 'windows', tracciaCartella: true });

test('⛔⛔⛔ CWD-USCITA-WIN-01 — un comando che fallisce riporta il SUO codice, non quello della coda', async (t) => {
  if (!SU_WINDOWS) return t.skip('la coda di cmd si prova solo su win32: altrove `eseguiSuWindows` usa la shell POSIX');
  const base = cartellaDiProvaWindows();
  try {
    assert.equal((await suWindows('type talos_absent.txt', base)).codice, 1);
    assert.equal((await suWindows('cmd /c exit 5', base)).codice, 5, 'il codice esatto, non «diverso da zero»');
    assert.equal((await suWindows('node -e "process.exit(3)"', base)).codice, 3);
    assert.equal((await suWindows('echo abc | findstr zzz', base)).codice, 1);
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔⛔⛔ CWD-USCITA-WIN-02 — `set errorlevel=0` non riesce a mentire sul codice', async (t) => {
  if (!SU_WINDOWS) return t.skip('coda di cmd, solo su win32');
  const base = cartellaDiProvaWindows();
  try {
    /*
     * ⛔ È il caso che smonta ogni cura basata su `%ERRORLEVEL%`: `set errorlevel=0` crea una
     * variabile utente che SCHERMA la pseudo-variabile interna (ss64, «Errorlevel and exit
     * codes», https://ss64.com/nt/errorlevel.html, letto il 17/09/2026: «Never manually set
     * %ERRORLEVEL% using the SET command»). Il codice d'uscita del PROCESSO è un'altra cosa
     * ancora — «ERRORLEVEL is not %ERRORLEVEL%», devblogs.microsoft.com/oldnewthing/20080926-00 —
     * ed è quello che qui si pretende.
     */
    assert.equal((await suWindows('set errorlevel=0& type talos_absent.txt', base)).codice, 1);
    assert.equal((await suWindows('cd talos_no_such_dir', base)).codice, 1);
    assert.equal((await suWindows('if exist talos_absent.txt (echo y) else (type talos_absent.txt)', base)).codice, 1);
    assert.equal((await suWindows('<nul set /p =Continue?', base)).codice, 1);
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⭐ CWD-USCITA-WIN-03 — i casi che riescono restano a zero, e `cd ..` continua a dare la cartella PADRE', async (t) => {
  if (!SU_WINDOWS) return t.skip('coda di cmd, solo su win32');
  const base = cartellaDiProvaWindows();
  try {
    assert.equal((await suWindows('echo ok', base)).codice, 0);
    // ⛔ Precedenza: `&&` lega più stretto di `&`, quindi in `a & b` la coda si attacca a `b`.
    assert.equal((await suWindows('type talos_absent.txt & echo ok', base)).codice, 0, 'come cmd nudo: vince l\'ultimo comando');
    assert.equal((await suWindows('type talos_absent.txt || echo fallback', base)).codice, 0);
    assert.equal((await suWindows('for %i in (1 2) do @echo %i', base)).codice, 0);

    const risalita = await suWindows('cd ..', base);
    assert.equal(risalita.codice, 0);
    assert.equal(risalita.cartellaFinale, dirname(base), 'questo è ciò che 3d292939 ha riparato: non si rompe');

    const resta = await suWindows('echo ok', base);
    assert.equal(resta.cartellaFinale, base, 'su successo la cartella si riporta come prima');
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔⛔ CWD-USCITA-WIN-04 — IL COSTO DICHIARATO: al fallimento la cartella non si riporta, e chi chiama TIENE l\'ultima nota', async (t) => {
  if (!SU_WINDOWS) return t.skip('coda di cmd, solo su win32');
  const base = cartellaDiProvaWindows();
  try {
    const esito = await suWindows('cd sub & type talos_absent.txt', base);
    assert.equal(esito.codice, 1, 'il codice è quello vero');
    assert.equal(esito.cartellaFinale, null, 'e la cartella non arriva: è il prezzo, dichiarato');
    /*
     * ⛔ `null` NON è «torna alla radice»: `session-registry.mjs:5134` scrive
     * `if (esito?.cartellaFinale) voce.cartellaComandi = esito.cartellaFinale`, quindi con `null`
     * lo stato resta dov'era. Asserito qui sulla forma esatta di quel guardiano, così che
     * cambiarlo in un `??` faccia diventare rossa questa riga.
     */
    let cartellaDiStato = base;
    if (esito.cartellaFinale) cartellaDiStato = esito.cartellaFinale;
    assert.equal(cartellaDiStato, base, 'la cartella di stato non si azzera');
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔⛔ CWD-USCITA-WIN-05 — una cartella OSTILE (exit.bat, cd.bat, set.bat, echo) non cambia un solo esito', async (t) => {
  if (!SU_WINDOWS) return t.skip('coda di cmd, solo su win32');
  const pulita = cartellaDiProvaWindows();
  const ostile = cartellaDiProvaWindows({ ostile: true });
  try {
    for (const comando of ['type talos_absent.txt', 'cmd /c exit 5', 'echo ok', 'type talos_absent.txt & echo ok', 'exit /b 7']) {
      const a = await suWindows(comando, pulita);
      const b = await suWindows(comando, ostile);
      assert.equal(b.codice, a.codice, `"${comando}" deve dare lo stesso codice nelle due cartelle`);
      assert.doesNotMatch(b.testo, /DIROTTATO/, `"${comando}" non deve invocare un file batch della cartella`);
    }
  } finally {
    rimuoviCartellaDiProva(pulita);
    rimuoviCartellaDiProva(ostile);
  }
});

test('⛔ CWD-USCITA-WIN-06 — la coda di cmd è quella misurata, e NON usa più `&` nudo', async (t) => {
  if (!SU_WINDOWS) return t.skip('la forma della coda di cmd si legge solo dove è quella di cmd');
  const coda = codaCheStampaLaCartella(true);
  assert.equal(coda, ` && (echo.${M}& cd)`);
  assert.ok(!/^ & /.test(coda), 'un `&` nudo in testa rimetterebbe il codice della coda al posto di quello del comando');
});

/*
 * ⛔⛔ WSL ha guasti transitori («Errore irreparabile · Codice errore: Wsl/Service/…»): una prova
 * che vuole WSL VERO si salta con il motivo dichiarato, mai un verde silenzioso e mai un rosso
 * che non parla del prodotto.
 *
 * ⛔ E ELENCARE le distro NON prova che una distro PARTA. La prima versione di questa guardia
 * chiedeva solo `wsl -l -v`, ed è stata trovata rossa nella suite intera del 17/09/2026 con
 * `codice: 4294967295` (0xFFFFFFFF, il codice che wsl.exe dà quando il servizio non parte)
 * mentre, nello stesso giro, le cinque prove d'integrazione di `shell-wsl-p0bis.test.mjs` si
 * dichiaravano saltate. Quella guardia più forte esisteva già, nello stesso repo, scritta lo
 * stesso giorno: una lezione imparata su un cancello non si trasferisce da sola. ⇒ Stessa forma,
 * eseguendo davvero un comando.
 */
function wslRisponde() {
  if (!SU_WINDOWS) return false;
  try {
    const elenco = spawnSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 10_000, windowsHide: true });
    if (elenco.status !== 0) return false;
    if (!String(elenco.stdout || '').replace(/\0/g, '').split('\n').some((riga) => riga.trim() !== '')) return false;
    return spawnSync('wsl.exe', ['--exec', 'true'], { timeout: 30_000, windowsHide: true }).status === 0;
  } catch {
    return false;
  }
}

const MOTIVO_SALTO_WSL = 'wsl.exe non risponde in questo momento (`wsl -l -q` vuoto o in errore, oppure la distro non esegue un comando): prova d\'integrazione NON eseguita, non passata';

const suWsl = (comando, cartella) => eseguiComandoSandboxato(comando, cartella, { dove: 'wsl2', tracciaCartella: true });

test('⛔⛔⛔ CWD-USCITA-WSL-01 — su WSL il codice è quello vero E la cartella resta nota anche al fallimento', async (t) => {
  if (!SU_WINDOWS) return t.skip('la strada WSL esiste solo su win32');
  if (!wslRisponde()) return t.skip(MOTIVO_SALTO_WSL);

  const base = cartellaDiProvaWindows();
  try {
    const fallito = await suWsl('false', base);
    assert.equal(fallito.codice, 1);
    assert.ok(fallito.cartellaFinale, 'sulla coda POSIX non c\'è nessun costo: la cartella arriva lo stesso');

    assert.equal((await suWsl('sh -c "exit 4"', base)).codice, 4);

    const dentro = await suWsl('cd sub; false', base);
    assert.equal(dentro.codice, 1);
    assert.match(dentro.cartellaFinale, /\/sub$/);

    assert.equal((await suWsl('true', base)).codice, 0);
    assert.equal((await suWsl('false; true', base)).codice, 0, 'come bash nudo: vince l\'ultimo comando');

    const risalita = await suWsl('cd ..', base);
    assert.equal(risalita.codice, 0);
    assert.ok(risalita.cartellaFinale && !risalita.cartellaFinale.endsWith('sub'));
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔ CWD-USCITA-POSIX-01 — la coda POSIX cattura `$?` per PRIMO, toglie le funzioni ostili, e nomina lo stato con un nonce SUO', () => {
  const marcatore = nuovoMarcatoreCartella();
  const coda = codaCheStampaLaCartella(false, marcatore);
  const nomeStato = /^ ; (talos_rc_[0-9a-f]{12})=\$\? ;/.exec(coda)?.[1];
  assert.ok(nomeStato, `la coda deve cominciare catturando lo stato: ${coda}`);

  /*
   * ⛔⛔ IL NOME DELLO STATO NON DEVE CONTENERE IL MARCATORE, e nella versione precedente lo
   *   conteneva. Misurato mentre rifacevo la tabella ostile: `readonly <nome>=99` fa scrivere alla
   *   shell `… <nome>: readonly variable`, e se il nome porta dentro il marcatore allora il
   *   MESSAGGIO D'ERRORE contiene il marcatore ⇒ chi legge trova il marcatore nell'errore e
   *   prende il resto per una cartella. Difetto mio, trovato dalla misura e non dal ragionamento.
   */
  assert.ok(!nomeStato.includes(marcatore), '⛔ il nome della variabile non deve portare dentro il marcatore');
  assert.ok(!coda.includes('command pwd'), '`command` è a sua volta ridefinibile: non ci si appoggia più');
  assert.ok(!coda.includes('command exit'), 'idem per `exit`');
  assert.match(coda, / unset -f pwd printf exit 2>\/dev\/null ;/, 'le funzioni ostili si TOLGONO, invece di scavalcarle');
  assert.match(coda, /\[ -d "\$talos_dir_[0-9a-f]{12}" \] &&/, '⛔ C-3: la cartella si stampa SOLO se è una cartella vera');
  assert.match(coda, new RegExp(`exit \\$${nomeStato}$`), 'e si esce con lo stato catturato all\'inizio');
  assert.ok(coda.includes(marcatore));

  // La forma esatta che `argomentiWslPerScript` manda a bash, così si vede cosa gira davvero.
  const argomenti = argomentiWslPerScript('Ubuntu', `cd "/tmp" && { false ; }${coda}`);
  assert.deepEqual(argomenti.slice(0, 5), ['-d', 'Ubuntu', '--exec', 'bash', '-lc']);
  assert.match(argomenti[5], new RegExp(`\\{ false ; \\} ; ${nomeStato}=\\$\\? ;`));
});

/*
 * ⛔⛔⛔ C-3 (17/09/2026) — TESTO DI STDERR PROMOSSO A CARTELLA DI LAVORO.
 *
 * Il secondo revisore l'ha riprodotto: `enable -n command 2>/dev/null ; false` faceva arrivare
 * `cartellaFinale: 'bash: line 1: command: command not found'`, e quella stringa diventava il
 * `cwd` del comando successivo. Due guardie, non una: la coda POSIX emette il percorso solo se
 * `[ -d ]`, e chi legge accetta solo un percorso assoluto — che sul ramo cmd deve anche ESISTERE.
 */
test('⛔⛔⛔ CWD-VALIDA-01 — `cartellaFinaleValida` rifiuta tutto ciò che non è un percorso assoluto', () => {
  assert.equal(cartellaFinaleValida('bash: line 1: command: command not found'), null, 'il caso misurato dal revisore');
  assert.equal(cartellaFinaleValida(''), null);
  assert.equal(cartellaFinaleValida(null), null);
  assert.equal(cartellaFinaleValida('   '), null);
  assert.equal(cartellaFinaleValida('relativo/sub'), null, 'un percorso relativo non è una cartella di lavoro');
  assert.equal(cartellaFinaleValida('/casa/mia\u0007'), null, 'i caratteri di controllo sono la firma di un messaggio, non di un percorso');
  assert.equal(cartellaFinaleValida('x'.repeat(5000)), null);

  // E il verso in cui NON deve mordere: i percorsi assoluti veri passano.
  assert.equal(cartellaFinaleValida('/home/x'), '/home/x');
  assert.equal(cartellaFinaleValida('C:\\Users\\x'), 'C:\\Users\\x');
  assert.equal(cartellaFinaleValida('\\\\server\\share\\y'), '\\\\server\\share\\y');
  assert.equal(cartellaFinaleValida('  /home/x  '), '/home/x', 'gli spazi attorno si tolgono');
});

test('⛔⛔ CWD-VALIDA-02 — con il controllo del disco, una cartella che NON esiste è rifiutata', () => {
  const inventata = join(tmpdir(), 'talos-cartella-che-non-esiste-' + process.pid);
  assert.equal(cartellaFinaleValida(inventata, { esisteCartellaFn: () => false }), null);
  // Al contrario, sul disco VERO: una cartella che esiste passa, un file NO.
  const base = cartellaDiProvaWindows();
  try {
    const esisteDavvero = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
    assert.equal(cartellaFinaleValida(base, { esisteCartellaFn: esisteDavvero }), base);
    writeFileSync(join(base, 'unfile.txt'), 'x', 'utf8');
    assert.equal(cartellaFinaleValida(join(base, 'unfile.txt'), { esisteCartellaFn: esisteDavvero }), null,
      'un FILE non è una cartella di lavoro');
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔⛔⛔ CWD-VALIDA-03 — sul ramo cmd una cartella inventata dal comando non arriva a chi chiama', async (t) => {
  if (!SU_WINDOWS) return t.skip('la coda di cmd si prova solo su win32');
  const base = cartellaDiProvaWindows();
  try {
    /*
     * ⛔ Questo è il caso del revisore (C-1): il comando stampa il marcatore E un percorso, ed
     *   esce 0, quindi la regola del codice non basta. `C:\Windows` però ESISTE, e allora la
     *   guardia dell'esistenza non morde: è esattamente il motivo per cui il modello di minaccia è
     *   dichiarato invece che difeso (vedi `codaCheStampaLaCartella`). Ciò che si prova qui è la
     *   cosa che SI PUÒ chiudere: un percorso che non esiste, o che non è un percorso, non passa.
     */
    const inesistente = await suWindows(`cmd /c "echo ${M}& echo C:\\cartella-che-non-esiste-talos& exit 0"`, base);
    assert.equal(inesistente.codice, 0);
    assert.equal(inesistente.cartellaFinale, base, 'vince la NOSTRA coda, che stampa dopo e su una cartella vera');

    const spazzatura = await suWindows(`cmd /c "echo ${M}& echo non-un-percorso& exit 1"`, base);
    assert.equal(spazzatura.codice, 1);
    assert.equal(spazzatura.cartellaFinale, null, 'niente di ciò che non è un percorso assoluto diventa un cwd');
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

/*
 * ⛔⛔⛔ CLI-REQ-01, SECONDO GIRO (17/09/2026) — LE DUE RISERVE DEL REVISORE.
 *
 * C1 · Con la coda `&&`, su cmd la coda NON gira al fallimento ⇒ l'ULTIMA occorrenza del
 *   marcatore nell'uscita può essere quella stampata dal COMANDO, e diventa il `cwd` del comando
 *   dopo (`session-registry.mjs:5134`, che non valida il percorso). Riprodotto sull'albero curato:
 *   `cmd /c "echo __TALOS_CWD__& echo C:\Windows& exit 1"` → `cartellaFinale: 'C:\Windows'`.
 * C2 · La coda POSIX non era gratis come avevo scritto: `readonly __talos_rc=99`, una funzione
 *   `exit()` e una funzione `pwd()` la piegavano. Misurato su bash E su `sh`.
 *
 * Due difese, non una: un marcatore NUOVO a ogni esecuzione, e — su cmd soltanto — la cartella
 * accettata solo con codice 0.
 */
test('⛔⛔⛔ CWD-NONCE-01 — il marcatore è NUOVO a ogni esecuzione, e non è quello esportato', () => {
  const a = nuovoMarcatoreCartella();
  const b = nuovoMarcatoreCartella();
  assert.notEqual(a, b, 'due esecuzioni non possono condividere il marcatore');
  assert.notEqual(a, M, 'il marcatore fisso resta solo come valore predefinito per le prove');
  assert.match(a, /^__TALOS_CWD_[0-9a-f]{16}__$/);
  // Il nome della variabile di stato POSIX eredita il nonce: `readonly` non può prevenirlo.
  assert.ok(codaCheStampaLaCartella(false, a).includes(a.replace(/[^A-Za-z0-9_]/g, '')));
});

test('⛔⛔⛔ CWD-FALSIFICA-01 — un comando che STAMPA un marcatore non sceglie la cartella del comando dopo', async (t) => {
  if (!SU_WINDOWS) return t.skip('la coda di cmd si prova solo su win32');
  const base = cartellaDiProvaWindows();
  try {
    // Marcatore FISSO stampato dal comando + fallimento: il caso che il revisore ha misurato rosso.
    const fallito = await suWindows(`cmd /c "echo ${M}& echo C:\\Windows& exit 1"`, base);
    assert.equal(fallito.codice, 1);
    assert.equal(fallito.cartellaFinale, null, 'con codice ≠ 0 nessun marcatore è nostro');

    /*
     * ⛔⛔⛔ E QUESTO È IL CASO CHE MORDE DAVVERO SULLA REGOLA, non sul nonce.
     *
     *   Scrivendo la prova mi sono accorto che il caso qui sopra passava anche col controllo del
     *   codice DISATTIVATO: il comando stampa il marcatore FISSO, mentre il kernel cerca quello
     *   dell'esecuzione, quindi non trova niente comunque. Era verde per il motivo sbagliato.
     *   ⛔ MISURATO: su cmd un comando PUÒ leggere la propria riga di comando — `%CMDCMDLINE%` —
     *   e lì dentro c'è il nonce. Con la regola spenta, `echo %CMDCMDLINE%& exit /b 1` produceva
     *   `cartellaFinale: '& cd)"'`, cioè una cartella inventata che sarebbe diventata il `cwd` del
     *   comando successivo. ⇒ Il nonce NON è un segreto, e la difesa che regge da sola è questa.
     */
    const conNonceRubato = await suWindows('echo %CMDCMDLINE%& exit /b 1', base);
    assert.equal(conNonceRubato.codice, 1);
    assert.equal(conNonceRubato.cartellaFinale, null, 'anche conoscendo il nonce, con codice ≠ 0 non si detta la cartella');

    // Lo stesso comando che RIESCE: la nostra coda stampa dopo, quindi vince l'ultima occorrenza.
    const conNonceMaRiuscito = await suWindows('echo %CMDCMDLINE%', base);
    assert.equal(conNonceMaRiuscito.codice, 0);
    assert.equal(conNonceMaRiuscito.cartellaFinale, base, 'la cartella vera, non quella suggerita dal comando');

    // Marcatore fisso + successo: idem.
    const riuscito = await suWindows(`cmd /c "echo ${M}& echo C:\\Windows& exit 0"`, base);
    assert.equal(riuscito.codice, 0);
    assert.equal(riuscito.cartellaFinale, base, 'la cartella vera, non quella stampata dal comando');

    /*
     * ⛔ E il marcatore di QUESTA esecuzione non compare nel testo mostrato: D-10B vale anche per
     * lui. (Il marcatore FISSO stampato dal comando resta visibile, ed è giusto: è output suo.)
     */
    assert.doesNotMatch(riuscito.testo, /__TALOS_CWD_[0-9a-f]{16}__/, 'il marcatore di questa esecuzione non si vede mai');
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔⛔ CWD-FALSIFICA-02 — la regola «cartella solo con codice 0» è esatta sui casi compound che ESCONO 0', async (t) => {
  if (!SU_WINDOWS) return t.skip('la coda di cmd si prova solo su win32');
  const base = cartellaDiProvaWindows();
  try {
    /*
     * ⛔ Questi tre escono 0 pur contenendo un comando fallito: la coda gira, quindi la cartella
     * dev'esserci. È il verso in cui la regola nuova NON deve mordere — se mordesse, un `cd`
     * seguito da un comando con `||` smetterebbe di persistere.
     */
    for (const comando of ['type talos_absent.txt & echo ok', 'type talos_absent.txt || echo fallback', 'echo ok']) {
      const esito = await suWindows(comando, base);
      assert.equal(esito.codice, 0, comando);
      assert.equal(esito.cartellaFinale, base, `"${comando}" deve riportare la cartella`);
    }
    // E un `cd` riuscito continua a persistere, che è tutto il motivo per cui la coda esiste.
    const dentro = await suWindows('cd sub', base);
    assert.equal(dentro.codice, 0);
    assert.equal(dentro.cartellaFinale, join(base, 'sub'));
  } finally {
    rimuoviCartellaDiProva(base);
  }
});

test('⛔⛔⛔ CWD-OSTILE-POSIX-01 — la tabella ESTESA: `command()`, `builtin()`, `unset()`, `enable -n`, `pwd()`, `exit()`', async (t) => {
  if (!SU_WINDOWS) return t.skip('la strada WSL esiste solo su win32');
  if (!wslRisponde()) return t.skip(MOTIVO_SALTO_WSL);
  const base = cartellaDiProvaWindows();
  try {
    /*
     * ⛔⛔ LE TRE RIGHE CHE IL SECONDO REVISORE HA MISURATO ROSSE sulla coda di `bff36712`, che si
     *   appoggiava a `command pwd` / `command exit`. `command` è un builtin ORDINARIO: una funzione
     *   con quel nome lo copre, e `enable -n command` lo spegne del tutto.
     *     · `command() { : ; } ; false`            dava **0**  (il difetto di partenza, di ritorno)
     *     · `command() { echo /rubata ; } ; false` dava 0 e la cartella `/rubata`
     *     · `enable -n command ; false`            dava **127** e cartella
     *       `'bash: line 1: command: command not found'` — testo di stderr promosso a cwd (C-3)
     *   Adesso la coda non usa `command`: TOGLIE le funzioni con `unset -f` e poi chiama i builtin.
     */
    const commandMuto = await suWsl('command() { : ; } ; false', base);
    assert.equal(commandMuto.codice, 1, '⛔ una funzione chiamata `command` non deve far tornare 0');

    const commandBugiardo = await suWsl('command() { echo /rubata ; } ; false', base);
    assert.equal(commandBugiardo.codice, 1);
    assert.notEqual(commandBugiardo.cartellaFinale, '/rubata');

    const commandSpento = await suWsl('enable -n command 2>/dev/null ; false', base);
    assert.equal(commandSpento.codice, 1, 'nemmeno spegnendo il builtin');
    assert.ok(!String(commandSpento.cartellaFinale ?? '').includes('not found'),
      '⛔ C-3: nessun testo di stderr può finire in `cartellaFinale`');

    const builtinFinto = await suWsl('builtin() { : ; } ; false', base);
    assert.equal(builtinFinto.codice, 1);

    const unsetFinto = await suWsl('unset() { : ; } ; false', base);
    assert.equal(unsetFinto.codice, 1, 'anche se `unset` stesso è coperto, il codice si salva');

    const exitFinto = await suWsl('exit() { : ; } ; false', base);
    assert.equal(exitFinto.codice, 1, '`unset -f exit` toglie la funzione e resta il builtin');

    const pwdFinto = await suWsl('pwd() { echo /rubata ; } ; true', base);
    assert.equal(pwdFinto.codice, 0);
    assert.notEqual(pwdFinto.cartellaFinale, '/rubata', '`unset -f pwd` toglie la funzione');

    /*
     * ⛔ Migliorato rispetto a prima, e lo si asserisce: `printf() { : ; }` NON fa più sparire la
     *   cartella, perché `unset -f printf` la rimette al suo posto. Era un residuo dichiarato, ed
     *   è chiuso — ma il codice resta la cosa che conta, e quella si asserisce comunque.
     */
    const printfFinto = await suWsl('printf() { : ; } ; false', base);
    assert.equal(printfFinto.codice, 1, 'il codice si salva comunque');

    /*
     * ⛔ E ciò che RESTA aggirabile, asserito invece che taciuto. `readonly <nome di stato>` uccide
     *   la shell prima della coda: qui il nome glielo passo IO, perché un comando vero non può
     *   indovinare un nonce. Ciò che conta è che non esca una cartella inventata.
     */
    const coda = codaCheStampaLaCartella(false, nuovoMarcatoreCartella());
    const nomeStato = /^ ; (talos_rc_[0-9a-f]{12})=/.exec(coda)[1].replace(/^talos_rc_/, '');
    assert.match(nomeStato, /^[0-9a-f]{12}$/, 'il nonce dello stato è indipendente dal marcatore');
    const conReadonly = await suWsl(`readonly talos_rc_${nomeStato}=99 ; (exit 7)`, base);
    assert.ok(conReadonly.cartellaFinale === null || /^\//.test(conReadonly.cartellaFinale),
      '⛔ qualunque cosa succeda, in `cartellaFinale` non finisce un messaggio della shell');
  } finally {
    rimuoviCartellaDiProva(base);
  }
});
