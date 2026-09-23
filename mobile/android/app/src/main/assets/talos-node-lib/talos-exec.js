// TalosTerminalPlugin — helper statico, pushato UNA volta insieme al
// binario Node, MAI ritrasmesso a ogni comando via `adb shell` — ricerca
// 28/8 (github.com/advisories/GHSA-r7qv-8r2h-pg27, delphix/sdb#219 e
// discussioni simili): `adb shell` ha limiti noti e non documentati nel
// preservare argomenti con `(`, `{`, `;`, righe multiple — uno script
// inline via `-e "<...>"` si rompeva con "syntax error: unexpected '('"
// sulla SHELL REMOTA, prima ancora di arrivare a Node. Il comando vero
// arriva in base64 (solo [A-Za-z0-9+/=], MAI interpretabile da una shell)
// invece che come testo libero.
//
// ⛔⛔⛔ 10/9 — IL SEGRETO NON VIAGGIA PIÙ NELLA RIGA DI COMANDO.
//
// ## Il fatto, osservato sul Pad dell'owner (non ipotizzato)
//
// Al primo avvio di una build di RILASCIO, nel logcat c'era la chiave
// OpenRouter in chiaro:
//
//   I adbd: adbd service requested 'shell,v2,raw:LD_LIBRARY_PATH=…
//           OPENROUTER_API_KEY=sk-or-… node …'
//
// Ricorre a ogni avvio. L'owner ha dovuto ruotare la chiave.
//
// ## Perché succedeva, e perché non bastava «noi non logghiamo»
//
// Il commento del 28/8 in `TalosTerminalPlugin.eseguiComando` aveva
// analizzato il rischio per iscritto e concluso «qui (a) non succede —
// nessun `Log.*` tocca `ambiente` o `prefissiAmbiente`». È VERO: nessun
// nostro `Log.*` la tocca. Ma a stamparla non eravamo noi. Il segreto
// viaggiava come token `VAR=valore` dentro la STRINGA DI COMANDO
// consegnata ad `adb shell`, e chi la registra è **`adbd`**, un demone
// di sistema. Verificato ALLA FONTE il 10/9, non a memoria:
//
//   AOSP `packages/modules/adb/daemon/shell_service.cpp`,
//   `Subprocess::ForkAndExec()`:
//       if (command_.empty()) {
//           __android_log_security_bswrite(SEC_TAG_ADB_SHELL_INTERACTIVE, "");
//       } else {
//           __android_log_security_bswrite(SEC_TAG_ADB_SHELL_CMD, command_.c_str());
//       }
//   (android.googlesource.com/platform/packages/modules/adb/+/HEAD/
//    daemon/shell_service.cpp — letto il 2026-09-10)
//
// ⇒ OGNI comando non interattivo passato ad `adb shell` finisce PER
// COSTRUZIONE nel log di sicurezza di Android, oltre alla riga INFO che
// l'owner ha visto. Non è un difetto di una ROM: è il comportamento
// upstream. Nessuna cura nel NOSTRO codice poteva impedirlo, perché la
// cura andava fatta un passo prima: non mettercelo, il segreto.
//
// ⇒ La lezione, scritta perché a qualcuno servirà: il criterio non è
// «il mio codice lo scrive da qualche parte?» ma **«per quali processi
// passa, e cosa scrive ognuno di loro?»**. Il modello di minaccia del
// 28/8 copriva il nostro processo e il processo remoto, ma non il
// TRASPORTO in mezzo.
//
// ## La via scelta: stdin
//
// Ricerca 10/9 (nodejs-security.com/blog/do-not-use-secrets-in-
// environment-variables-and-here-is-how-to-do-it-better;
// smallstep.com/blog/command-line-secrets): fra riga di comando,
// variabile d'ambiente e stdin, **stdin è l'unico canale che non
// lascia traccia** — niente argv, niente `/proc/<pid>/cmdline`, niente
// log di sistema, niente file su disco da cancellare dopo.
//
// E il canale esiste già per intero, verificato alla fonte il 10/9:
//   · client — `client/commandline.cpp`, `stdin_read_thread_loop()`:
//     legge lo stdin LOCALE e lo spedisce come `ShellProtocol::kIdStdin`;
//     a EOF manda `ShellProtocol::kIdCloseStdin`.
//   · demone — `daemon/shell_service.cpp`: su `kIdCloseStdin`, per un
//     sottoprocesso `kRaw` (il nostro caso: `shell,v2,raw:`) fa
//     `adb_shutdown(stdinout_sfd_, SHUT_WR)` ⇒ la shell remota vede un
//     EOF pulito.
// Gli id del protocollo (`kIdStdin` 0, `kIdCloseStdin` 4) stanno in
// `shell_protocol.h` (stessa fonte, stessa data).
//
// ⇒ `LD_LIBRARY_PATH` resta nella riga di comando — DEVE starci, il
// caricatore dinamico la legge prima che Node esista, e non è un
// segreto. Tutto ciò che arriva dal chiamante (le cinque `*_API_KEY`,
// `OLLAMA_ENDPOINT`) arriva invece qui su stdin, come un solo oggetto
// JSON, e da qui entra nell'ambiente del comando via `execSync`.

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * ⛔ La versione del PROTOCOLLO fra Kotlin e questo file, non dell'app.
 *
 * Serve perché `/data/local/tmp/talos/talos-exec.js` SOPRAVVIVE a un
 * `adb install -r`: senza una domanda esplicita, un telefono che ha già
 * la v1 continuerebbe a ricevere il flag `--ambiente-da-stdin` e a
 * ignorarlo in silenzio — il server partirebbe SENZA chiavi, con un
 * errore lontano e incomprensibile. `TalosTerminalPlugin` chiede questa
 * stringa prima di fidarsi (vedi `assicuraRuntimeSulTelefono`), e se non
 * la sente rispinge il file. Stesso difetto già pagato il 28/8 sullo
 * staging dell'albero harness-ui ("SESTO errore"), qui sull'altro albero.
 */
const VERSIONE = 'talos-exec/2';
const FLAG_VERSIONE = '--versione';
const FLAG_AMBIENTE = '--ambiente-da-stdin';

/**
 * La sola sintassi POSIX valida per un identificatore d'ambiente — la
 * STESSA grammatica applicata da `TalosPonteSegreti.nomeValido()` lato
 * Kotlin. Ripetuta qui e non dedotta: i due lati del ponte si validano
 * ognuno per conto proprio, così nessuno dei due dipende dalla buona fede
 * dell'altro.
 */
const NOME_VALIDO = /^[A-Z_][A-Z0-9_]*$/;

const SHELL_ANDROID = '/system/bin/sh';

/**
 * ⛔ Sul telefono è SEMPRE `/system/bin/sh` — il ramo alternativo non si
 * prende mai lì. Esiste perché questo file ha dei test che girano su un
 * PC (`tests/unit/security/segretiFuoriDallaRigaDiComando.test.ts`), e un
 * percorso Android inesistente li renderebbe impossibili: senza quei test
 * l'unico modo di sapere se il segreto arriva davvero sarebbe guardare il
 * telefono, cioè non saperlo mai in CI. Non indebolisce niente: se
 * `/system/bin/sh` mancasse sul device, la shell di ripiego mancherebbe
 * uguale e l'errore sarebbe lo stesso.
 */
function shellDaUsare() {
    return fs.existsSync(SHELL_ANDROID) ? SHELL_ANDROID : undefined;
}

/**
 * Legge stdin FINO A EOF, in modo sincrono.
 *
 * ⛔ Sincrono per forza: il comando va eseguito con l'ambiente già
 * completo, e `execSync` non aspetta una promessa. `readSync` su fd 0
 * torna 0 a EOF; `EOF`/`EAGAIN` sono i due modi in cui Node segnala la
 * stessa cosa su piattaforme diverse — il primo è la fine, il secondo è
 * «non ancora», e si aspetta 5 ms senza girare a vuoto (`Atomics.wait`
 * è l'unica attesa sincrona che Node concede sul thread principale).
 *
 * ⛔ EOF ARRIVA SEMPRE, e non per fiducia: chi ci scrive è
 * `TalosPonteAdb.esegui()`, che chiude l'estremità di scrittura subito
 * dopo aver scritto — era già così prima (`processo.outputStream.close()`,
 * la cura del «girello senza fine» del 09/8), l'unica differenza è che
 * ora prima di chiudere ci passano dei byte.
 */
function leggiTuttoStdin() {
    const pezzi = [];
    const buffer = Buffer.alloc(65536);
    const orologio = new Int32Array(new SharedArrayBuffer(4));
    for (;;) {
        let letti;
        try {
            letti = fs.readSync(0, buffer, 0, buffer.length, null);
        }
        catch (e) {
            if (e.code === 'EAGAIN') {
                Atomics.wait(orologio, 0, 0, 5);
                continue;
            }
            if (e.code === 'EOF') break;
            throw e;
        }
        if (letti === 0) break;
        pezzi.push(Buffer.from(buffer.subarray(0, letti)));
    }
    return Buffer.concat(pezzi).toString('utf8');
}

/**
 * Da un oggetto JSON a una mappa di variabili d'ambiente validata.
 *
 * ⛔⛔ NESSUN messaggio d'errore qui dentro cita un VALORE, solo un nome.
 * Non è pignoleria: ciò che questa funzione tocca sono le chiavi API, e
 * `stderr` risale il ponte fino all'esito Capacitor — un `SyntaxError`
 * di `JSON.parse` cita il testo attorno all'errore, cioè cita il
 * segreto. Per questo l'errore di parsing viene RIMPIAZZATO, non
 * propagato: sarebbe lo stesso difetto di oggi in un'altra veste.
 */
function decodificaAmbiente(testo) {
    const grezzo = testo.trim();
    if (grezzo === '') return {};
    let oggetto;
    try {
        oggetto = JSON.parse(grezzo);
    }
    catch {
        throw new TypeError('stdin non contiene un oggetto JSON valido');
    }
    if (oggetto === null || typeof oggetto !== 'object' || Array.isArray(oggetto)) {
        throw new TypeError("l'ambiente su stdin dev'essere un oggetto JSON");
    }
    const ambiente = {};
    for (const nome of Object.keys(oggetto)) {
        if (!NOME_VALIDO.test(nome)) {
            throw new TypeError(`nome variabile d'ambiente non valido: ${nome}`);
        }
        if (typeof oggetto[nome] !== 'string') {
            throw new TypeError(`valore non testuale per ${nome}`);
        }
        ambiente[nome] = oggetto[nome];
    }
    return ambiente;
}

/**
 * ⛔ L'ORDINE È UN CONTRATTO, non un dettaglio: ciò che arriva dal
 * chiamante VINCE su ciò che era già nell'ambiente. Prima del 10/9 lo
 * garantiva la shell remota (un `VAR=valore` successivo nella stessa riga
 * sovrascrive il precedente — il commento di `avviaServerHarness` ci
 * contava per lasciare al chiamante l'ultima parola su
 * `TALOS_HARNESS_UI_PROJECT_DIRS`). Spostando il chiamante su stdin
 * quella regola sarebbe sparita senza rumore: qui è riscritta esplicita.
 */
function ambienteUnito(base, dalChiamante) {
    return Object.assign({}, base, dalChiamante);
}

function main() {
    const flag = process.argv[3] || '';
    if (flag === FLAG_VERSIONE) {
        process.stdout.write(VERSIONE);
        return;
    }

    let ambiente = process.env;
    if (flag === FLAG_AMBIENTE) {
        let testo;
        try {
            testo = leggiTuttoStdin();
        }
        catch (e) {
            process.stderr.write(`talos-exec: stdin illeggibile (${e.code || e.name})\n`);
            process.exitCode = 1;
            return;
        }
        let coppie;
        try {
            coppie = decodificaAmbiente(testo);
        }
        catch (e) {
            process.stderr.write(`talos-exec: ${e.message}\n`);
            process.exitCode = 1;
            return;
        }
        // ⛔ Un ambiente atteso e non arrivato NON è un dettaglio da
        // ingoiare: senza questa riga il server partirebbe senza chiavi e
        // fallirebbe molto più tardi, lontano dalla causa.
        if (Object.keys(coppie).length === 0) {
            process.stderr.write('talos-exec: atteso un ambiente su stdin, ma stdin era vuoto\n');
        }
        ambiente = ambienteUnito(process.env, coppie);
    }

    const comando = Buffer.from(process.argv[2] || '', 'base64').toString('utf8');
    try {
        const o = execSync(comando, {
            shell: shellDaUsare(),
            env: ambiente,
            maxBuffer: 8 * 1024 * 1024,
        });
        process.stdout.write(o);
    }
    catch (e) {
        if (e.stdout) process.stdout.write(e.stdout);
        process.stderr.write(e.stderr || String(e.message || e));
        process.exitCode = e.status == null ? 1 : e.status;
    }
}

if (require.main === module) main();

// ⛔ Esportato per i test, non per un altro chiamante: sul telefono
// questo file è sempre `require.main`. Senza export l'unico modo di
// provare la decodifica dell'ambiente sarebbe un telefono in mano.
module.exports = { VERSIONE, FLAG_VERSIONE, FLAG_AMBIENTE, decodificaAmbiente, ambienteUnito };
