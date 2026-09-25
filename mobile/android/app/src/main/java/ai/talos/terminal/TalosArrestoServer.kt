package ai.talos.terminal

/**
 * Come si ferma un server del Codice prima di accenderne un altro.
 *
 * ⛔⛔⛔ 24/09/2026 (difetto 6 del ledger B3, trovato sul Pad): dopo reinstallazione e riavvio dell'app restavano DUE
 * `node …/harness-ui/server.mjs`, entrambi PPID 1 (`setsid`, vedi `TalosTerminalPlugin.avviaServerHarness`). Il plugin
 * mandava UN `kill` al solo pid di `harness-ui.pid` e rilanciava subito: il vecchio non usciva (un flusso di eventi
 * aperto dall'app lo teneva vivo — curato anche nel server, `harness-ui/src/spegnimento.mjs`) e restava lì per sempre,
 * con l'app attaccata al codice vecchio. E un server rimasto da un giro ancora prima non era nemmeno più nel file.
 *
 * Cura, lo schema di `docker stop` — «The main process … will receive SIGTERM, and after a grace period, SIGKILL»
 * (https://docs.docker.com/reference/cli/docker/container/stop/, letto il 24/09/2026):
 *  - si trovano TUTTI i server in corso dall'elenco dei processi, non solo quello del file (`serverInCorso`);
 *  - a ognuno SIGTERM, che il server gestisce chiudendosi in ordine; si controlla con `kill -0` fino alla grazia;
 *  - se è ancora vivo, SIGKILL, e lo si ricontrolla; se sopravvive anche a quello lo si DICE (`ANCORA_VIVO`).
 * Serve anche per i server vecchi già sui telefoni, che la cura del server non ha: loro il SIGTERM non lo onorano.
 *
 * ⛔ Prima di qualunque segnale si legge `/proc/<pid>/cmdline`: un pid scritto ore fa può essere stato riassegnato a un
 * altro processo dello stesso utente, e un SIGKILL lì sarebbe un danno. Il confronto si fa QUI, su un numero già
 * scelto, mai con `pgrep -f` (che trova anche la shell che lo esegue: vedi la storia del 28/8 nel plugin).
 *
 * Tutto l'accesso al telefono arriva da fuori (le lambda), così le prove girano senza un telefono
 * (`TalosArrestoServerTest`).
 */
object TalosArrestoServer {

    enum class Esito { USCITO, FORZATO, ANCORA_VIVO, NON_NOSTRO }

    /** Dopo il SIGKILL si aspetta al massimo questo: il kernel lo esegue subito, serve solo a vederlo. */
    private const val ATTESA_DOPO_KILL_MS = 1_000L

    /**
     * I pid dei server del Codice in corso, dall'uscita di `ps -A -o PID,ARGS`: il programma è `node` (anche con il
     * percorso intero) e il suo primo argomento è ESATTAMENTE `percorsoServer`. Una shell che nomina quel file, un altro
     * `server.mjs` o un altro script di node restano fuori.
     */
    fun serverInCorso(uscitaPs: String, percorsoServer: String): List<String> =
        uscitaPs.lineSequence()
            .map { it.trim().split(Regex("\\s+")) }
            .filter { campi ->
                campi.size >= 3
                    && campi[0].all(Char::isDigit)
                    && (campi[1] == "node" || campi[1].endsWith("/node"))
                    && campi[2] == percorsoServer
            }
            .map { it[0] }
            .toList()

    /**
     * @param rigaDiComando il contenuto di `/proc/<pid>/cmdline` (argomenti separati da NUL), vuoto se il processo non
     *   c'è più.
     * @param vivo `kill -0 <pid>` riuscito.
     * @param segnala `kill <pid>` (segnale `null`, cioè SIGTERM) o `kill -9 <pid>`.
     */
    fun ferma(
        pid: String,
        percorsoServer: String,
        rigaDiComando: (String) -> String,
        vivo: (String) -> Boolean,
        segnala: (pid: String, segnale: String?) -> Unit,
        dormi: (Long) -> Unit,
        graziaMs: Long = 3_000,
        passoMs: Long = 200,
    ): Esito {
        val argomenti = rigaDiComando(pid).split('\u0000').filter { it.isNotEmpty() }
        if (percorsoServer !in argomenti) return Esito.NON_NOSTRO

        segnala(pid, null)
        if (aspettaUscita(pid, vivo, dormi, graziaMs, passoMs)) return Esito.USCITO
        segnala(pid, "-9")
        return if (aspettaUscita(pid, vivo, dormi, ATTESA_DOPO_KILL_MS, passoMs)) Esito.FORZATO else Esito.ANCORA_VIVO
    }

    /** Controlla SUBITO, poi a passi, fino a `limiteMs`: `true` appena il processo non c'è più. */
    private fun aspettaUscita(
        pid: String,
        vivo: (String) -> Boolean,
        dormi: (Long) -> Unit,
        limiteMs: Long,
        passoMs: Long,
    ): Boolean {
        var atteso = 0L
        while (true) {
            if (!vivo(pid)) return true
            if (atteso >= limiteMs) return false
            dormi(passoMs)
            atteso += passoMs
        }
    }
}
