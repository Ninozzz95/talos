package ai.talos.terminal

import org.json.JSONObject

/**
 * ⛔⛔⛔ DOVE PASSA UN SEGRETO, E DOVE NON DEVE PASSARE MAI — 10/9.
 *
 * ## Il fatto, osservato sul Pad dell'owner
 *
 * Al primo avvio di una build di RILASCIO, nel logcat:
 *
 *     I adbd: adbd service requested 'shell,v2,raw:LD_LIBRARY_PATH=…
 *             OPENROUTER_API_KEY=sk-or-… node …'
 *
 * In chiaro, a ogni avvio, leggibile da chiunque abbia `adb` e da
 * qualunque app con `READ_LOGS`. L'owner ha dovuto ruotare la chiave. E
 * non era una chiave sola: `terminalePonte.ts` mappa CINQUE provider
 * (`openrouter, openai, deepseek, anthropic, gemini`) sulle rispettive
 * `*_API_KEY`, più `OLLAMA_ENDPOINT` — qualunque fosse configurata
 * usciva allo stesso modo.
 *
 * ## LA CATENA INTERA, processo per processo
 *
 * Il criterio giusto non è «il mio codice lo scrive da qualche parte?»
 * ma «per QUALI PROCESSI passa, e cosa scrive OGNUNO di loro?». Ecco la
 * catena vera, disegnata tutta, con il verdetto per ogni anello:
 *
 *  1. **WebView / processo dell'app** — `secureKeyStore.ts` legge la
 *     chiave dall'Android Keystore. In memoria. ✔
 *  2. **ponte Capacitor** (JS → Java) — il payload del metodo
 *     attraversa `MessageHandler`, che sa loggarlo a livello verbose.
 *     Già chiuso altrove e da prima: `capacitor.config.ts` dichiara
 *     `loggingBehavior: 'none'`, con un test che lo tiene fermo
 *     (`tests/unit/security/capacitorLoggingPolicy.test.ts`). ✔
 *  3. **`TalosTerminalPlugin` (Kotlin)** — nessun `Log.*` tocca
 *     l'ambiente. Vero il 28/8, vero oggi. ✔
 *  4. **`ProcessBuilder` → `libadb.so`** (client adb, stesso UID
 *     dell'app) — ⛔ PRIMA DEL 10/9 il segreto era un argomento di
 *     questo processo: `/proc/<pid>/cmdline`, `ps -Af`.
 *  5. **server adb** (forkato dal client, stesso UID) — ⛔ stessa cosa.
 *  6. **`adbd` sul device** — riceve la stringa di servizio
 *     `shell,v2,raw:<comando intero>` e la REGISTRA. ⛔⛔⛔ QUESTO era
 *     l'anello che nessuno aveva guardato, e non è una ROM ballerina:
 *     è AOSP, per costruzione. Verificato alla fonte il 2026-09-10 —
 *     `packages/modules/adb/daemon/shell_service.cpp`,
 *     `Subprocess::ForkAndExec()`:
 *
 *         if (command_.empty()) {
 *             __android_log_security_bswrite(SEC_TAG_ADB_SHELL_INTERACTIVE, "");
 *         } else {
 *             __android_log_security_bswrite(SEC_TAG_ADB_SHELL_CMD, command_.c_str());
 *         }
 *
 *     (android.googlesource.com/platform/packages/modules/adb/+/HEAD/
 *      daemon/shell_service.cpp — letto il 2026-09-10)
 *
 *     ⇒ OGNI comando non interattivo passato ad `adb shell` finisce nel
 *     log di sicurezza di Android, oltre alla riga INFO che l'owner ha
 *     visto. Nessuna disciplina nel nostro codice poteva evitarlo.
 *  7. **`/system/bin/sh -c '<comando>'`** forkato da `adbd`, dominio
 *     `shell` — ⛔ prima del 10/9 il segreto era nel suo `cmdline`.
 *  8. **`node talos-exec.js`** — l'ambiente del processo,
 *     `/proc/<pid>/environ`, dominio `shell`. Questo anello NON cambia,
 *     ed è dichiarato: è lo stesso confine di fiducia già scritto per
 *     l'intero dominio `shell` in `TalosPonteAdb.kt`. Non è il difetto
 *     di oggi, e fingere di averlo curato sarebbe peggio che dirlo.
 *  9. **il comando figlio** (`talosHarness.mjs`, un provider) — eredita
 *     l'ambiente, che è precisamente lo scopo.
 *
 * ⇒ Il modello di minaccia del 28/8 (vedi il commento di
 * `eseguiComando`, lasciato lì apposta) copriva **il nostro processo**
 * (3) e **il processo remoto** (8), ma non il **TRASPORTO** in mezzo
 * (4-7). Ragionamento corretto e insufficiente: giusto su ciò che
 * guardava, cieco su ciò che non aveva nominato.
 *
 * ## La cura: gli anelli 4-7 non vedono più niente
 *
 * Ricerca 2026-09-10, prima di scrivere una riga
 * (nodejs-security.com/blog/do-not-use-secrets-in-environment-variables-
 * and-here-is-how-to-do-it-better; smallstep.com/blog/command-line-
 * secrets): fra riga di comando, variabile d'ambiente e stdin, **stdin è
 * l'unico canale che non lascia traccia** — non compare in `argv`, non
 * in `/proc/<pid>/cmdline`, non in un log di sistema, e a differenza di
 * un file a permessi `0600` non lascia niente su disco da ricordarsi di
 * cancellare (né qualcuno che possa leggerlo nel frattempo). Per questo
 * la via del file è stata scartata pur essendo praticabile: introdurrebbe
 * un segreto in `/data/local/tmp`, cioè un secondo problema al posto del
 * primo.
 *
 * Il canale esiste già, ed è lo stesso `adb shell` di sempre. Verificato
 * alla fonte lo stesso giorno:
 *   · client — `client/commandline.cpp`, `stdin_read_thread_loop()`:
 *     legge lo stdin locale e lo spedisce come `ShellProtocol::kIdStdin`;
 *     a EOF manda `ShellProtocol::kIdCloseStdin`;
 *   · demone — `daemon/shell_service.cpp`: ricevuto `kIdCloseStdin`, per
 *     un sottoprocesso `kRaw` (il nostro caso, `shell,v2,raw:`) fa
 *     `adb_shutdown(stdinout_sfd_, SHUT_WR)` ⇒ EOF pulito per la shell
 *     remota;
 *   · gli id (`kIdStdin` 0, `kIdCloseStdin` 4) stanno in
 *     `shell_protocol.h`.
 *
 * ⛔ E `LD_LIBRARY_PATH` resta dov'era, nella riga di comando: DEVE
 * starci — il caricatore dinamico la legge prima che Node esista, non
 * c'è nessun stdin da cui possa arrivare — e non è un segreto. Lo stesso
 * vale per i `TALOS_*` fissi di `avviaServerHarness`, che sono costanti
 * scritte in questo repo. Va su stdin **tutto ciò che arriva dal
 * chiamante**, senza distinguere fra «questa è una chiave» e «questo è
 * un indirizzo»: la distinzione la sbaglierebbe qualcuno, prima o poi.
 *
 * ⛔ Cosa NON si può proteggere, detto e non nascosto: gli altri lati
 * hanno il segreto in una `String` Java/JS, che è immutabile e non si
 * azzera. `ConsegnaComando.cancella()` azzera l'unica copia che questo
 * file possiede davvero — i byte spediti — e non promette di più.
 */
object TalosPonteSegreti {

    /**
     * Il flag che dice a `talos-exec.js` di leggere l'ambiente da stdin.
     * ⛔ Compare nella riga di comando (quindi nei log di `adbd`): è un
     * nome fisso, non dice niente di nessuno.
     */
    const val FLAG_AMBIENTE_STDIN = "--ambiente-da-stdin"

    /** Il flag che chiede a `talos-exec.js` di dichiarare la sua versione. */
    const val FLAG_VERSIONE = "--versione"

    /**
     * ⛔ La versione del PROTOCOLLO fra questo file e `talos-exec.js`,
     * non dell'app. `/data/local/tmp/talos/talos-exec.js` SOPRAVVIVE a
     * un `adb install -r`: senza chiedere, un telefono fermo alla v1
     * riceverebbe `--ambiente-da-stdin`, lo ignorerebbe come un
     * argomento sconosciuto, e il server partirebbe SENZA chiavi — in
     * silenzio, con l'errore che spunta molto più tardi e molto più
     * lontano. Stessa forma del "SESTO errore" del 28/8, sull'altro
     * albero di staging.
     */
    const val VERSIONE_TALOS_EXEC = "talos-exec/2"

    /**
     * ⛔ L'unica sintassi POSIX valida per un identificatore d'ambiente.
     * Il NOME è scelto da chi chiama, mai dal modello direttamente, ma
     * la disciplina "mai fidarsi di una stringa libera" vale comunque —
     * e `talos-exec.js` applica la STESSA grammatica per conto suo, così
     * nessuno dei due lati dipende dalla buona fede dell'altro.
     */
    private val NOME_VALIDO = Regex("^[A-Z_][A-Z0-9_]*$")

    fun nomeValido(nome: String): Boolean = NOME_VALIDO.matches(nome)

    /**
     * Gli argomenti da dare a `TalosPonteAdb.shell()` e i byte da
     * scriverne sullo stdin — costruiti insieme perché sono UNA cosa
     * sola: il flag c'è se e solo se ci sono byte da leggere, e viceversa
     * `talos-exec.js` che aspetta uno stdin che nessuno scriverà
     * resterebbe appeso fino al timeout del ponte.
     *
     * ⛔ `prefissiNonSegreti` sono i token `VAR=valore` che RESTANO nella
     * riga di comando: `LD_LIBRARY_PATH` (obbligatorio, vedi sopra) e le
     * costanti `TALOS_*` di questo repo. Nulla che venga dal chiamante
     * entra qui — se un giorno servisse, il posto giusto è `ambiente`.
     *
     * @throws IllegalArgumentException col SOLO nome offensivo nel
     *   messaggio, mai il valore: quel messaggio risale il ponte fino
     *   all'interfaccia.
     */
    fun consegna(
        prefissiNonSegreti: List<String>,
        binario: String,
        script: String,
        comandoBase64: String,
        ambiente: Map<String, String>,
    ): ConsegnaComando {
        for (nome in ambiente.keys) {
            if (!nomeValido(nome)) throw IllegalArgumentException(nome)
        }
        val coda = listOf(binario, script, comandoBase64)
        if (ambiente.isEmpty()) {
            return ConsegnaComando(prefissiNonSegreti + coda, null)
        }
        val json = JSONObject()
        for ((nome, valore) in ambiente) json.put(nome, valore)
        return ConsegnaComando(
            prefissiNonSegreti + coda + listOf(FLAG_AMBIENTE_STDIN),
            json.toString().toByteArray(Charsets.UTF_8),
        )
    }
}

/**
 * Cosa esce da questo processo, diviso in due: ciò che il mondo può
 * leggere (`argomenti`) e ciò che nessuno deve leggere (`ingresso`).
 *
 * ⛔ Non è una `data class` di proposito: l'`equals()` generato su un
 * `ByteArray` confronterebbe l'IDENTITÀ dell'array, e un `toString()`
 * generato stamperebbe i campi — cioè stamperebbe il segreto nel primo
 * log che qualcuno aggiungerà per caso. Meglio non averlo affatto.
 */
class ConsegnaComando(
    val argomenti: List<String>,
    val ingresso: ByteArray?,
) {
    /**
     * Azzera i byte del segreto dopo l'uso. Best effort dichiarato: è
     * l'unica copia che questo lato possiede in una forma azzerabile —
     * le `String` di Kotlin e di JS restano dove sono finché il GC non
     * passa, e non c'è modo di forzarlo.
     */
    fun cancella() {
        ingresso?.fill(0)
    }
}
