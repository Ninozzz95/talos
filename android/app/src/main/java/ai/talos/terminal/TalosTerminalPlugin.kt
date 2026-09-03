package ai.talos.terminal

import ai.talos.agent.TalosPonteAdb
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * ⛔⛔⛔ 3/9 — spostata da `debug` a `main`, insieme a
 * [ai.talos.harness.TalosHarnessUiPlugin] (vedi il suo commento di classe
 * per il perché e la citazione dell'owner): Codice, terminale incluso, ora
 * spedisce nella build di rilascio. `assets/talos-node-lib/` (il binario
 * Node + le sue dipendenze) si è spostato con lei — stessa cartella
 * `main`, non più `debug`. R8 (release, minify+shrink ON) ora vede questa
 * classe: `Class.forName("ai.talos.terminal.TalosTerminalPlugin")` in
 * `MainActivity` è tenuta esplicita in `proguard-rules.pro`, per lo
 * stesso motivo del plugin harness — una ricerca per stringa che R8 non
 * traccia da solo.
 *
 * ⭐⭐⭐ 28/8 — owner, testuale: «voglio che trovi questa ricerca, procedi a
 * fare funzionare al cento per cento un terminale sandboxato nella sezione
 * Codice [...] usando il nostro ponte a DB che abbiamo già usato per la
 * chat [...] senza usare un ponte, un collegamento a DB col computer.
 * Questo è il vincolo obbligatorio». Il "ponte a DB" che la persona
 * descrive non è una metafora: è [ai.talos.agent.TalosPonteAdb], lo stesso
 * `adb` bundlato nell'APK (travestito `libadb.so`, stesso trucco jniLibs
 * di `pocket-tts-runtime`) che TALOS usa GIÀ per i tool della chat
 * (`TalosPrivilegePlugin`/`TalosDevicePlugin`) — accoppiato UNA VOLTA via
 * Debug wireless (Android 11+, tutto sullo schermo del telefono) e da
 * allora riagganciato da solo, mai un PC in mezzo.
 *
 * ## ⛔⛔ CORREZIONE DI ROTTA — la prima versione di questo file era sbagliata
 *
 * La primissima stesura (stesso giorno) faceva girare `libtalosnode.so`
 * DENTRO al processo dell'app via `ProcessBuilder` — compilava, impacchettava,
 * ma è l'architettura SBAGLIATA: `TALOS-RICERCHE/2026-08-20-android-coding-
 * agent-execution-plane.md` (3795 righe, MAI letto prima di scrivere quella
 * prima versione — errore mio, il ledger di questa fase impone di leggerlo
 * per primo) lo dice esplicitamente in apertura: *"Il coding agent non deve
 * eseguire il progetto nel processo di TALOS. Deve orchestrare un execution
 * plane separato, raggiunto attraverso il ponte ADB esistente e operante
 * come `shell` in `/data/local/tmp/talos`"*. Il motivo tecnico è preciso:
 * il dominio SELinux `untrusted_app` (il processo dell'app) è più
 * restrittivo — un seccomp/SELinux capace di negare syscall a un binario
 * complesso come Node con un "Bad system call" mai visto via `adb shell`
 * (dominio `shell`, molto meno ristretto — ricerca 28/8, u1f383.github.io).
 * Passare per QUESTO ponte invece di uno nuovo risolve il problema
 * spostando l'esecuzione nel dominio giusto, riusando codice già
 * verificato (pairing, riaggancio, timeout, `LD_LIBRARY_PATH`) invece di
 * duplicarlo.
 *
 * ⇒ Questa versione implementa la "Fase A — Reality PoC" del documento
 * (§37): provare che il binario Node (già verificato bit-per-bit via
 * `adb shell` esterno, ledger FASE-3-SHELL-SUL-TELEFONO) risponde anche
 * quando il PONTE è quello DENTRO l'app, non un `adb shell` da un PC. Le
 * fasi successive del documento (runner nativo C++, job protocol,
 * sandbox Landlock/seccomp, provisioning transazionale) restano APERTE,
 * dichiarate, non implementate qui — vedi il ledger.
 *
 * ## Cosa fa
 *
 * 1. **Provisioning** (`assicuraRuntimeSulTelefono`): copia il binario
 *    Node + le sue 9 dipendenze (incluso libc++_shared.so, aggiunto 28/8 dopo un secondo crollo reale) da `assets/talos-node-lib/` (dentro
 *    l'APK) alla cartella privata dell'app, poi li `push`a via
 *    `TalosPonteAdb.esegui(["push", ...])` in `/data/local/tmp/talos/` —
 *    la stessa area che il dominio `shell` può scrivere ED eseguire
 *    (§2.2 del documento). Idempotente: se `node --version` risponde già
 *    lì, salta la copia.
 * 2. **Esecuzione** (`eseguiComando`): `TalosPonteAdb.shell(...)` con
 *    `ammessi = {"/data/local/tmp/talos/node"}` — il modello non
 *    ottiene mai una shell generica, solo questo unico programma,
 *    esattamente come `TalosPrivilegePlugin` fa per `cmd`/`settings`/
 *    `dumpsys`/`pm`/`am`. Dentro, Node esegue il comando vero tramite
 *    `/system/bin/sh` (pipe/redirect/glob reali).
 *
 * ## Cosa NON fa ancora — dichiarato, non nascosto
 *
 * ⛔ Nessun runner nativo C++ (§7 del documento): niente process group
 * dedicato, niente cancellazione pulita di un albero di processi, niente
 * stato persistito fra un riavvio dell'app e l'altro — un job lungo
 * "sparisce" se il ponte cade, invece di finire in uno stato `Unknown`
 * riconciliabile.
 * ⛔ Nessun provisioning transazionale (§6): un push interrotto a metà
 * lascia file parziali in `/data/local/tmp/talos/` — non c'è staging
 * atomico né rollback.
 * ⛔ Nessun sandbox oltre l'allowlist del primo programma (§14): chi
 * ottiene questo strumento ottiene Node, e Node può fare quasi tutto ciò
 * che il dominio `shell` permette — non c'è ancora Landlock/seccomp.
 * ⛔ MAI verificato su un device reale: richiede installare una build di
 * debug (vedi ledger — l'APK si consegna, non si installa da soli).
 */
@CapacitorPlugin(name = "TalosTerminal")
class TalosTerminalPlugin : Plugin() {

    companion object {
        private const val TAG = "TalosTerminal"
        private const val ASSET_DIR = "talos-node-lib"
        private const val NOME_BINARIO = "node"
        private const val AREA_REMOTA = "/data/local/tmp/talos"
        private const val BINARIO_REMOTO = "$AREA_REMOTA/$NOME_BINARIO"
        private const val EXEC_JS_REMOTO = "$AREA_REMOTA/talos-exec.js"
        /**
         * ⛔⛔ SECONDO ERRORE trovato sul device vero (28/8), dopo il crash
         * dell'asset compresso: `TalosPonteAdb.shell()` esegue `adb shell
         * <comando>`, e `adb shell` NON eredita l'ambiente del processo
         * locale (l'app) — è una sessione NUOVA sul device. Il binario Node
         * moriva con `CANNOT LINK EXECUTABLE ".../node": library
         * "libz.so.1" not found`, identico al difetto già risolto in
         * `TalosPonteAdb.kt` stesso per `adb` (`libadb.so`) — ma lì il
         * `LD_LIBRARY_PATH` è nel `ProcessBuilder` LOCALE, che qui non
         * esiste: la libreria manca dall'ALTRA parte del ponte.
         *
         * Ricerca 28/8 (groups.google.com/g/android-ndk, thread NDK
         * ufficiale): la forma che NON richiede un `sh -c` esplicito è
         * `adb shell LD_LIBRARY_PATH=<dir> <programma> <argomenti...>` —
         * un assegnamento come primo token, sintassi POSIX valida che la
         * shell remota interpreta da sé. Questo assegnamento sostituisce
         * `BINARIO_REMOTO` come "primo programma" agli occhi
         * dell'allowlist: `comando[0]` diventa questa stringa fissa, mai
         * influenzata dall'utente o dal modello.
         */
        private const val PREFISSO_LD = "LD_LIBRARY_PATH=$AREA_REMOTA"
        private val PROGRAMMA_AMMESSO = setOf(PREFISSO_LD)

        /**
         * ⭐⭐⭐ 28/8, "procedi in ordine" punto 2 — dove atterra ognuna delle
         * tre cartelle sorelle che `harness-ui/server.mjs` si aspetta,
         * VERIFICATO a mano sul device prima di scriverlo qui (ledger
         * FASE-5-EXECUTION-PLANE): gli `import` relativi di
         * `task-catalog.mjs`/`workspace-tree.mjs` (`../../../AVM-harness/...`)
         * risolvono correttamente SOLO se questi tre percorsi restano
         * sorelle fra loro con questi nomi esatti — non è una scelta
         * arbitraria di questo file, è un vincolo del codice che gira.
         */
        private const val ASSET_DIR_SERVER = "talos-harness-ui"
        private const val AREA_AVM = "$AREA_REMOTA/AVM"
        private const val AREA_AVM_HARNESS = "$AREA_REMOTA/AVM-harness"
        private const val HARNESS_UI_REMOTO = "$AREA_AVM/harness-ui"
        private const val SERVER_JS_REMOTO = "$HARNESS_UI_REMOTO/server.mjs"
        private const val PUBLIC_DIR_REMOTO = "$AREA_AVM/mobile/public/harness-ui"
        // ⭐ Stessa cartella di destinazione degli import relativi già
        // verificati a mano (`workspace-tree.mjs` → `../../../AVM-harness/
        // mobile/scripts/harness-talos/talosHarness.mjs`): il kernel deve
        // atterrare ESATTAMENTE qui, non altrove.
        private const val KERNEL_DIR_REMOTO = "$AREA_AVM_HARNESS/mobile/scripts/harness-talos"
        // ⛔ 3/9 — il nome di questa cartella nominava il banco di ricerca
        // interno: questo file è appena arrivato in `main/` (vedi la sua
        // storia di classe), e il cancello di pubblicazione l'ha trovato —
        // mai uscito prima perché il file viveva in `debug/`, fuori dalla
        // scansione del cancello. Il valore è un percorso arbitrario scelto
        // da questo file, non un contratto con `config.mjs` (quello è solo
        // il nome della variabile d'ambiente qui sotto, invariato):
        // renderlo generico non cambia nessun comportamento.
        private const val BANCO_STUB_REMOTO = "$AREA_REMOTA/banco-locale"
        /**
         * ⭐⭐⭐ 29/8 — trovato dall'owner sul telefono VERO (screenshot):
         * "Nessuna cartella progetto configurata sul server — imposta
         * TALOS_HARNESS_UI_PROJECT_DIRS e riavvia" — un errore onesto (il
         * client, §8, si rifiuta di tentare senza sapere quale cartella
         * usare), ma un requisito manuale che rompe "100% on-device, niente
         * PC" per chi apre Codice la prima volta. Una cartella DI DEFAULT,
         * sotto la stessa area già provata scrivibile da questo intero file
         * (mai `/sdcard`: permessi storage scoped che variano per versione/
         * vendor Android, non ancora verificati qui — questa area invece è
         * già l'unica su cui OGNI riga sopra scrive con successo). Vedi
         * LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §11.5/§11.6: il server
         * standalone ora ha SEMPRE almeno una cartella, senza configurazione
         * manuale — chi vuole un percorso diverso resta libero di passare
         * `ambiente` con un `TALOS_HARNESS_UI_PROJECT_DIRS` proprio.
         */
        private const val AREA_WORKSPACE_DEFAULT = "$AREA_REMOTA/workspace"
        /**
         * ⭐⭐⭐ 2/9 — R1, trovato da una review esterna (Fable) leggendo
         * QUESTO file: `.sessions-store/`/`.automations/` (server.mjs)
         * stavano ACCANTO a `server.mjs`, cioè DENTRO `HARNESS_UI_REMOTO`
         * — l'ALBERO CHE QUESTO STESSO PLUGIN CANCELLA CON `rm -rf` E
         * RISPINGE AD OGNI AVVIO (vedi `svuotaCartellaRemota`/il blocco
         * push qualche riga sotto). La cronologia di una sessione non
         * spariva perché la scrittura fallisse (verificato, LEDGER §44:
         * scriveva davvero) — spariva perché il lancio SUCCESSIVO la
         * cancellava, sempre, ad ogni riavvio dell'app. Sorella di
         * AREA_WORKSPACE_DEFAULT: MAI dentro un albero che questo file
         * rispinge.
         */
        private const val AREA_STATO_REMOTO = "$AREA_REMOTA/state"
        private const val LOG_SERVER_REMOTO = "$AREA_REMOTA/harness-ui.log"
        private const val PID_FILE_REMOTO = "$AREA_REMOTA/harness-ui.pid"
        private const val PORTA_SERVER = 4174
        // Nomi ESATTI letti da `harness-ui/src/config.mjs` (INITIAL_CAMPAIGNS)
        // il 28/8 prima di scrivere questa lista — non a memoria.
        private val CAMPAGNE_INIZIALI = listOf("esiti-22ago-progetti", "esiti-22ago-storia")
    }

    /**
     * Copia gli asset dell'APK (binario + 9 dipendenze) nella cartella
     * privata dell'app — un `AssetManager` non è un percorso che `adb push`
     * possa leggere, serve un file reale sul disco prima.
     *
     * ⛔⛔⛔ CROLLATO SUL DEVICE VERO il 28/8, stack reale (non un'ipotesi
     * della prima stesura di questo file, che indovinava un rischio
     * SELinux/seccomp — quello NON era la causa):
     *
     *   FileNotFoundException: This file can not be opened as a file
     *   descriptor; it is probably compressed
     *     at AssetManager.nativeOpenAssetFd
     *     at TalosTerminalPlugin.stagingLocale (usava am.openFd(...) SOLO
     *       per leggere la dimensione attesa, prima di decidere se copiare)
     *
     * Ricerca 28/8 (github.com/google/filament#5696 e sorgenti simili):
     * `AssetManager.openFd()` richiede che l'asset sia salvato NON
     * compresso nell'APK (serve un file descriptor diretto con
     * offset/lunghezza dentro lo zip) — ma Android comprime di default gli
     * asset con estensioni che non riconosce come "già compresse", e né
     * `.so` sotto `assets/` (a differenza di `jniLibs/`, dove
     * `useLegacyPackaging=true` li tiene grezzi) né un binario senza
     * estensione lo sono. La cura documentata quando non si vuole toccare
     * `build.gradle` (nessun `noCompress` da tenere sincronizzato con la
     * lista file): mai `openFd()`, solo `open()` — uno stream, funziona
     * indipendentemente dalla compressione. L'idempotenza si controlla
     * sull'ESISTENZA del file copiato, non sulla sua dimensione contro
     * l'APK; la copia è atomica (file temporaneo + rename), mai un file a
     * metà se il processo muore a metà copia.
     *
     * ⇒ Mai visto in build, mai visto senza un telefono vero — esattamente
     * il motivo per cui l'owner ha reso vincolante provare sul device,
     * 28/8: "hai a disposizione tutti gli strumenti per provarlo... devi
     * provare tu stesso".
     */
    private fun stagingLocale(): File {
        val dest = File(context.filesDir, "talos-node-staging")
        if (!dest.exists()) dest.mkdirs()
        val am = context.assets
        val nomi = am.list(ASSET_DIR) ?: emptyArray()
        for (nome in nomi) {
            val out = File(dest, nome)
            if (out.exists()) continue
            val tmp = File(dest, "$nome.tmp")
            am.open("$ASSET_DIR/$nome").use { input ->
                tmp.outputStream().use { output -> input.copyTo(output) }
            }
            if (!tmp.renameTo(out)) {
                tmp.delete()
                throw java.io.IOException("rename fallito per $nome")
            }
        }
        return dest
    }

    /**
     * Come `stagingLocale()`, ma per un ALBERO (`talos-harness-ui/`, il
     * backend + gli asset web + il kernel — 30 file, sottocartelle
     * incluse), non un elenco piatto: `AssetManager.list()` non è
     * ricorsivo di sua natura, quindi questa funzione scende da sé
     * (una cartella senza figli propri, cioè una foglia, è un file — non
     * c'è un modo diretto di chiedere "è una cartella?" ad `AssetManager`,
     * quindi si prova a elencarla e si tratta un elenco vuoto come file).
     */
    /**
     * ⛔⛔⛔ SESTO errore trovato sul device vero (28/8): `stagingRicorsivo`
     * (giusto sotto) è idempotente per ESISTENZA — salta un file già
     * copiato, mai per CONTENUTO o VERSIONE. Corretto per il caso in cui
     * l'ho progettata (evitare di ricopiare 30 file a ogni avvio del
     * server), sbagliato per il caso che ho trovato provando dal vivo: la
     * cartella privata dell'app (`context.filesDir`) SOPRAVVIVE a
     * `adb install -r` — un APK più recente, coi file .mjs sotto
     * `harness-ui/src/` aggiornati (es. il supporto a `modello`,
     * "procedi in ordine" punto 4), veniva pushato sul telefono ANCORA
     * VECCHIO: `avviaServerHarness`
     * rispondeva `ok:true`, il server partiva per davvero, ma serviva il
     * codice di ieri — un `POST {messaggio, modello}` reale falliva con
     * QUERY_INVALID perché quel server non sapeva ancora della chiave
     * `modello`. Trovato riproducendo end-to-end, non ipotizzato.
     *
     * Cura: `PackageInfo.lastUpdateTime` (cambia a OGNI `adb install`,
     * anche a `versionName` invariato — è il momento dell'installazione,
     * non un numero che questo progetto dovrebbe incrementare a mano per
     * un debug locale) come marcatore. Diverso da quello scritto l'ultima
     * volta ⇒ l'intera cartella di staging si svuota e si ricostruisce da
     * zero: mai un aggiornamento parziale file-per-file, che lascerebbe
     * l'albero remoto in uno stato incoerente (alcuni file nuovi, altri
     * vecchi) — lo stesso principio già dichiarato per `adb push` su una
     * cartella esistente, qui applicato un livello più a monte.
     */
    /**
     * ⭐⭐⭐ 29/8 — estratta dal corpo di `svuotaStagingSeApkAggiornato`
     * (sotto), che la usava SOLO per decidere se svuotare lo staging
     * LOCALE. Ora serve anche ad `avviaServerHarness()` per decidere se
     * il processo REMOTO già vivo va considerato scaduto — vedi il
     * commento lì per il bug reale che questo risolve.
     */
    private fun installazioneApkCorrente(): String? = try {
        context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
    } catch (e: android.content.pm.PackageManager.NameNotFoundException) {
        Log.w(TAG, "PackageInfo non trovato, salto il controllo versione: ${e.message}")
        null
    }

    private fun svuotaStagingSeApkAggiornato(staging: File) {
        val marcatore = File(staging, ".apk-last-update-time")
        val installazioneAttuale = installazioneApkCorrente() ?: return
        val installazionePrecedente = if (marcatore.exists()) marcatore.readText().trim() else null
        if (installazionePrecedente == installazioneAttuale) return

        if (staging.exists() && !staging.deleteRecursively()) {
            throw java.io.IOException("impossibile svuotare lo staging obsoleto ($staging)")
        }
        staging.mkdirs()
        marcatore.writeText(installazioneAttuale)
    }

    private fun stagingRicorsivo(percorsoAsset: String, dest: File) {
        val am = context.assets
        val figli = am.list(percorsoAsset) ?: emptyArray()
        if (figli.isEmpty()) {
            if (dest.exists()) return
            dest.parentFile?.mkdirs()
            val tmp = File(dest.parentFile, "${dest.name}.tmp")
            am.open(percorsoAsset).use { input ->
                tmp.outputStream().use { output -> input.copyTo(output) }
            }
            if (!tmp.renameTo(dest)) {
                tmp.delete()
                throw java.io.IOException("rename fallito per $percorsoAsset")
            }
            return
        }
        dest.mkdirs()
        for (figlio in figli) {
            stagingRicorsivo("$percorsoAsset/$figlio", File(dest, figlio))
        }
    }

    /**
     * Idempotente: se il binario risponde già in `/data/local/tmp/talos`,
     * non ripete un push da ~88 MB. Gate P0.3 del documento — "Node" —
     * verificato attraverso QUESTO ponte, non solo via adb esterno.
     */
    private fun assicuraRuntimeSulTelefono(): TalosPonteAdb.Esito {
        // ⛔ Verifica il percorso VERO che `eseguiComando` usa (binario +
        // `talos-exec.js` insieme), non solo `node --version`: un
        // provisioning parziale (fatto prima che questo script esistesse,
        // o interrotto) farebbe credere pronto un telefono a cui manca il
        // file che l'esecuzione vera invoca — trovato riprovando dopo
        // averlo aggiunto, il solo binario rispondeva già "pronto".
        val comandoProva = android.util.Base64.encodeToString(
            "exit 0".toByteArray(Charsets.UTF_8), android.util.Base64.NO_WRAP,
        )
        val giaPronto = TalosPonteAdb.shell(
            context, listOf(PREFISSO_LD, BINARIO_REMOTO, EXEC_JS_REMOTO, comandoProva),
            ammessi = PROGRAMMA_AMMESSO, riagganciaSeStaccato = false,
        )
        if (giaPronto.ok) return giaPronto

        val locale = stagingLocale()
        TalosPonteAdb.esegui(context, listOf("shell", "mkdir", "-p", AREA_REMOTA))
        val file = locale.listFiles() ?: emptyArray()
        for (f in file) {
            val remoto = if (f.name == "talos-node-bin") BINARIO_REMOTO else "$AREA_REMOTA/${f.name}"
            val push = TalosPonteAdb.esegui(
                context, listOf("push", f.absolutePath, remoto), attesaMs = 120_000,
            )
            if (!push.ok) {
                Log.e(TAG, "push fallito per ${f.name}: ${push.motivo} ${push.errore}")
                return push
            }
        }
        TalosPonteAdb.esegui(context, listOf("shell", "chmod", "755", BINARIO_REMOTO))
        return TalosPonteAdb.shell(
            context, listOf(PREFISSO_LD, BINARIO_REMOTO, EXEC_JS_REMOTO, comandoProva),
            ammessi = PROGRAMMA_AMMESSO,
        )
    }

    private fun Esito.toJs(campoOutput: String = "output"): JSObject {
        val res = JSObject()
        res.put("ok", ok)
        res.put(campoOutput, uscita)
        res.put("stderr", errore)
        res.put("exitCode", codice)
        res.put("motivo", motivo ?: JSObject.NULL)
        return res
    }

    /**
     * Prova minima — Gate P0.1 (identità shell) + P0.3 (Node) del
     * documento, attraverso IL PONTE DENTRO L'APP, non `adb shell`
     * esterno: è esattamente il punto mai verificato finora.
     */
    @PluginMethod
    fun sonda(call: PluginCall) {
        if (!TalosPonteAdb.disponibile(context)) {
            call.resolve(JSObject().put("ok", false).put("motivo", "bridge-not-packaged"))
            return
        }
        val identita = TalosPonteAdb.shell(
            context, listOf("id"), ammessi = setOf("id"),
        )
        val nodeEsito = assicuraRuntimeSulTelefono()
        val res = JSObject()
        res.put("ok", nodeEsito.ok)
        res.put("identita", identita.toJs("output"))
        res.put("node", nodeEsito.toJs("output"))
        call.resolve(res)
    }

    /**
     * Esegue un comando di shell VERO — pipe, redirect, glob, tutto quello
     * che `/system/bin/sh` di Android offre — attraverso Node nel dominio
     * `shell` (via `TalosPonteAdb`), non nel processo dell'app.
     *
     * ⛔⛔⛔ TERZO ERRORE trovato sul device vero (28/8): la primissima
     * versione passava lo script Node INLINE via `-e "<...>"` attraverso
     * `adb shell` — e la SHELL REMOTA rispondeva `syntax error: unexpected
     * '('` PRIMA ancora che Node lo vedesse. Ricerca 28/8
     * (github.com/advisories/GHSA-r7qv-8r2h-pg27, delphix/sdb#219): `adb
     * shell` ha limiti noti, non ben documentati, nel preservare argomenti
     * con `(`/`{`/`;`/righe multiple come UN solo token — uno script di
     * poche righe con `require('child_process')` basta a romperlo. Cura:
     * lo script (`talos-exec.js`) è ora un file STATICO, pushato una sola
     * volta insieme al binario — mai più ritrasmesso — e il comando VERO
     * arriva in **base64** (solo `[A-Za-z0-9+/=]`, mai interpretabile da
     * nessuna shell) invece che come testo libero passato per argv.
     *
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 1 — `ambiente`: il ponte per
     * far arrivare un segreto (oggi: `OPENROUTER_API_KEY`, letto da
     * `secureKeyStore.ts`/Android Keystore lato JS) fino al processo Node
     * remoto, senza che TALOS lo scriva mai su disco né lo logghi.
     *
     * Ricerca 28/8 (nodejs-security.com, smallstep.com/blog/command-line-
     * secrets): dei tre modi comuni di passare un segreto a un processo
     * figlio — variabile d'ambiente, file, stdin — il rischio reale non è
     * la variabile d'ambiente in sé (il rischio citato più spesso è
     * ARGV/`ps`/`cmdline`, che qui non si tocca affatto: il segreto non
     * diventa mai un argomento del programma) ma (a) finire loggato per
     * sbaglio e (b) `/proc/<pid>/environ`, leggibile da chi condivide lo
     * stesso UID. Qui (a) non succede — nessun `Log.*` tocca `ambiente` o
     * `prefissiAmbiente` — e (b) è lo stesso confine di fiducia già
     * dichiarato per l'intero dominio `shell` in `TalosPonteAdb.kt` ("con
     * una shell vera in mano... chi controlla gli argomenti di cmd può
     * fare molto più di ciò che quella lista lascia intendere"): non un
     * rischio nuovo introdotto qui. La forma scelta — `VAR=valore` come
     * token PRIMA del programma, sintassi POSIX che la shell remota
     * interpreta da sé — è la STESSA già provata per `LD_LIBRARY_PATH`,
     * generalizzata a un elenco fornito dal chiamante. `execSync` dentro
     * `talos-exec.js` eredita `process.env` per costruzione (comportamento
     * di default di Node, non aggiunto qui): un `VAR=valore` messo prima
     * di `node` arriva quindi anche a QUALUNQUE comando shell lanciato
     * dallo script, esattamente come serve per un server (`talosHarness.mjs`
     * che a sua volta chiama un provider) che eredita da chi lo avvia.
     *
     * ⛔ Il NOME della variabile è validato (`[A-Z_][A-Z0-9_]*`, l'unica
     * sintassi POSIX valida per un identificatore d'ambiente): scelto da
     * chi chiama la funzione, mai dal modello direttamente, ma la stessa
     * disciplina "mai fidarsi di una stringa libera in un comando" vale
     * comunque. Il VALORE non è ristretto (è un segreto, può contenere
     * qualunque carattere) — arriva come token argv separato ad `adb`, mai
     * concatenato in una stringa shell da questo codice.
     *
     * ⛔ VERIFICATO sul device (28/8): un valore con uno SPAZIO viene
     * separato in due dalla shell remota quando `talos-exec.js` lo passa a
     * `execSync` senza racchiuderlo fra virgolette — limite noto, non
     * nascosto. Una chiave API reale (OpenRouter, `sk-or-v1-...`) non
     * contiene mai spazi, quindi non blocca l'uso previsto; se in futuro
     * servisse un valore con spazi, la cura è quotare dentro
     * `talos-exec.js`, non qui.
     */
    @PluginMethod
    fun eseguiComando(call: PluginCall) {
        val comando = call.getString("comando")
        if (comando.isNullOrBlank()) {
            call.reject("comando mancante")
            return
        }
        val ambiente = call.getObject("ambiente")
        val prefissiAmbiente = mutableListOf<String>()
        if (ambiente != null) {
            val nomiValidi = Regex("^[A-Z_][A-Z0-9_]*$")
            for (nome in ambiente.keys()) {
                if (!nomiValidi.matches(nome)) {
                    call.reject("nome variabile d'ambiente non valido: $nome")
                    return
                }
                val valore = ambiente.getString(nome) ?: ""
                prefissiAmbiente.add("$nome=$valore")
            }
        }
        val pronto = assicuraRuntimeSulTelefono()
        if (!pronto.ok) {
            call.resolve(pronto.toJs("stdout"))
            return
        }
        val comandoBase64 = android.util.Base64.encodeToString(
            comando.toByteArray(Charsets.UTF_8), android.util.Base64.NO_WRAP,
        )
        // ⛔ `ammessi` resta ancorato a `PREFISSO_LD`: è SEMPRE il primo
        // token (`comando[0]`), indipendentemente da quanti altri
        // `VAR=valore` seguano prima del binario — l'allowlist di
        // TalosPonteAdb.shell controlla solo il primissimo elemento.
        val esito = TalosPonteAdb.shell(
            context,
            listOf(PREFISSO_LD) + prefissiAmbiente + listOf(BINARIO_REMOTO, EXEC_JS_REMOTO, comandoBase64),
            ammessi = PROGRAMMA_AMMESSO,
        )
        call.resolve(esito.toJs("stdout"))
    }

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 2 — fa partire il server
     * `harness-ui` (lo stesso backend/UI già verificati a mano nel ledger
     * FASE-5-EXECUTION-PLANE: `curl` reale su `/api/v1/health`,
     * `/api/v1/tasks`, `POST /api/v1/sessions`) **DALL'APP STESSA**, non
     * più da un `adb shell` lanciato a mano da una sessione Claude.
     *
     * ## Idempotenza — QUARTO errore trovato sul device vero (28/8)
     *
     * Prova cheap PRIMA, agisce solo se serve: un server già vivo non si
     * ferma né si riavvia, e il push di 30 file non si ripete a ogni
     * chiamata. La PRIMA versione usava `pgrep -f $SERVER_JS_REMOTO` — e
     * si è AUTO-INGANNATA a ogni singola chiamata: `giaAttivo:true` anche
     * subito dopo aver confermato (`ps -A`, `curl` fallito) che NESSUN
     * server era vivo. Causa, isolata con un test diretto (stessa
     * disciplina "si strumenta sempre, mai ipotesi"): `pgrep -f PATTERN`
     * cerca `PATTERN` nella riga di comando di OGNI processo — inclusa
     * quella del comando `/system/bin/sh -c "pgrep -f <path>"` che `adb
     * shell` stesso crea per eseguirlo, la quale CONTIENE il pattern
     * cercato come testo letterale. Confermato con un pgrep di prova che
     * ha "trovato" se stesso: `15365 /system/bin/sh -c ... pgrep -a -f
     * server.mjs ...`. Ricerca 28/8 (mywiki.wooledge.org/ProcessManagement,
     * man7.org/linux/man-pages/man1/pgrep.1.html): la cura standard non è
     * un pattern più specifico (il wrapper lo conterrebbe comunque) ma
     * evitare la corrispondenza testuale — un **pid file**: il lancio
     * scrive `$!` (il pid del job appena messo in background) su
     * `PID_FILE_REMOTO`, e la prova successiva è `kill -0 <pid>` (segnale
     * nullo, testa solo l'esistenza) su un NUMERO, mai su un testo che
     * possa ri-descrivere se stesso.
     *
     * ## `adb push` su una cartella che esiste già — quirk verificato (28/8)
     *
     * Ricerca 28/8 (xdaforums.com/t/adb-help-how-to-push-an-entire-directory,
     * stesso comportamento di `cp -r`): se la destinazione NON esiste,
     * `adb push locale remoto` mette il CONTENUTO di `locale` dentro
     * `remoto`; se `remoto` esiste GIÀ come cartella, `locale` diventa una
     * SOTTOCARTELLA di `remoto` — romperebbe silenziosamente ogni import
     * relativo. Cura: `rm -rf` del solo bersaglio (una cartella di
     * staging che possediamo noi, sotto `AREA_REMOTA`) subito prima di
     * ogni push, cosicché parta sempre pulito — sia al primo avvio sia
     * dopo una build più recente di questo stesso APK.
     *
     * ## Il server VERO parte per LO STESSO canale di `eseguiComando`
     *
     * Mai un secondo modo di eseguire codice sul telefono: il comando
     * (`setsid node <server.mjs> > <log> 2>&1 &`) passa per lo stesso
     * `talos-exec.js` + base64 già verificato. Ricerca 28/8
     * (blog.margrop.net/en/post/setsid-daemon-process-survival,
     * ibm.com/support/pages/nohup-or-setsid): `setsid` (non `nohup`) è la
     * scelta giusta qui — crea una sessione NUOVA, fuori dal process
     * group che muore quando `execSync` chiude la sua `sh -c`, mentre
     * `nohup` da solo lascerebbe il processo nello STESSO process group
     * e non lo protegge se quel gruppo viene reclamato tutto insieme
     * (esattamente il caso di un comando lanciato via `adb shell`, senza
     * terminale di controllo fin dall'inizio).
     *
     * Le variabili d'ambiente (le tre fisse — nomi letti da
     * `harness-ui/src/config.mjs` il 28/8, non a memoria — più quelle
     * eventuali del chiamante, es. `OPENROUTER_API_KEY`) arrivano come
     * prefissi `VAR=valore` PRIMA di `node talos-exec.js`, esattamente
     * come già fa `eseguiComando`: `execSync` dentro lo script eredita
     * `process.env`, quindi le vede anche il comando che lancia dentro.
     *
     * ⛔ `TALOS_HARNESS_UI_HOST` non è passato: resta `127.0.0.1` (il
     * default di `config.mjs`, l'unico valore che passa la sua allowlist
     * loopback) — server raggiungibile solo dal telefono stesso o da un
     * PC con `adb reverse` (opzionale), mai dalla rete.
     *
     * ## Cosa NON fa ancora — dichiarato, non nascosto
     *
     * ⛔ Nessun provisioning transazionale: un push interrotto a metà (per
     * esempio l'app uccisa durante la copia) lascia l'albero remoto a
     * metà, e la prossima chiamata lo sovrascrive da capo (corretto per
     * costruzione, ma non atomico). ⛔ Nessuna verifica che il processo
     * avviato sia VIVO dopo il fork (solo che il comando di lancio sia
     * partito con successo) — quella prova è compito del chiamante, via
     * un secondo giro (`sonda`/una richiesta HTTP reale), non di questo
     * metodo.
     */
    @PluginMethod
    fun avviaServerHarness(call: PluginCall) {
        val ambiente = call.getObject("ambiente")
        val nomiValidi = Regex("^[A-Z_][A-Z0-9_]*$")
        val prefissiChiamante = mutableListOf<String>()
        if (ambiente != null) {
            for (nome in ambiente.keys()) {
                if (!nomiValidi.matches(nome)) {
                    call.reject("nome variabile d'ambiente non valido: $nome")
                    return
                }
                prefissiChiamante.add("$nome=${ambiente.getString(nome) ?: ""}")
            }
        }

        val pronto = assicuraRuntimeSulTelefono()
        if (!pronto.ok) {
            val res = pronto.toJs("stdout")
            res.put("giaAttivo", false)
            call.resolve(res)
            return
        }

        /*
         * ⭐⭐⭐⭐ 29/8 — SETTIMO errore trovato sul device vero, e il più
         * serio: l'owner ha installato l'APK nuovo (Doctor/Hooks/
         * Automazioni/cartella-di-default portati oggi) e ha visto
         * ESATTAMENTE lo stesso errore di prima — "confermo l'errore e
         * l'apk che ho installato è l'ultimo, mai dubitare di me". Aveva
         * ragione: il gate `giaAttivo` qui sotto controllava SOLO se il
         * processo remoto rispondeva (`kill -0`), MAI se l'APK fosse nel
         * frattempo cambiato. Un `setsid` (riga ~500) sposta il processo
         * in una sessione NUOVA, riagganciata a init (PPID 1, verificato
         * oggi con `ps -A` sul device reale, non un'ipotesi) — sopravvive
         * a un `force-stop`/riavvio dell'APP per costruzione, perché non
         * è mai stato un suo figlio. Il marcatore `.apk-last-update-time`
         * esisteva già (28/8, sesto errore) ma serviva SOLO a decidere se
         * ri-fare lo STAGING locale — non veniva mai raggiunto quando un
         * processo vecchio era ancora vivo, perché quel ramo usciva
         * PRIMA con `return`. Risultato: ogni `adb install -r` lasciava
         * il server VECCHIO a rispondere per sempre (fino al riavvio del
         * telefono), file nuovi sul disco, processo vecchio in memoria.
         *
         * Cura: lo stesso marcatore, letto QUI, prima del gate. Se l'APK
         * è cambiato da quando quel pid è partito, il processo si
         * considera scaduto A PRESCINDERE dal fatto che risponda ancora
         * — fermato con SIGTERM (non `-9`): `server.mjs` (stesso giorno)
         * ha già un handler `process.once('SIGTERM', shutdown)` che
         * ferma lo scheduler automazioni e chiude il server in ordine,
         * non un colpo secco. Il codice sotto (staging+push+rilancio)
         * segue invariato, come se il pid non fosse mai stato trovato.
         */
        val staging = File(context.filesDir, "talos-harness-ui-staging")
        val marcatoreStaging = File(staging, ".apk-last-update-time")
        val apkCambiatoDallUltimoAvvio = installazioneApkCorrente()?.let { attuale ->
            val precedente = if (marcatoreStaging.exists()) marcatoreStaging.readText().trim() else null
            precedente != attuale
        } ?: false

        val pidSalvato = TalosPonteAdb.esegui(context, listOf("shell", "cat", PID_FILE_REMOTO))
            .uscita.trim()
        val pidValido = pidSalvato.isNotEmpty() && pidSalvato.all { it.isDigit() }
        if (apkCambiatoDallUltimoAvvio && pidValido) {
            TalosPonteAdb.esegui(context, listOf("shell", "kill", pidSalvato))
            Log.i(TAG, "APK aggiornato dall'ultimo avvio del server: fermato il processo scaduto (pid $pidSalvato)")
        } else if (pidValido) {
            val vivo = TalosPonteAdb.esegui(context, listOf("shell", "kill", "-0", pidSalvato))
            if (vivo.ok) {
                val res = JSObject()
                res.put("ok", true)
                res.put("giaAttivo", true)
                res.put("stdout", pidSalvato)
                res.put("motivo", JSObject.NULL)
                call.resolve(res)
                return
            }
        }
        try {
            svuotaStagingSeApkAggiornato(staging)
            stagingRicorsivo(ASSET_DIR_SERVER, staging)
        } catch (e: java.io.IOException) {
            Log.e(TAG, "staging harness-ui fallito: ${e.message}")
            call.reject("staging fallito: ${e.message}")
            return
        }

        val destinazioni = listOf(
            File(staging, "harness-ui").absolutePath to HARNESS_UI_REMOTO,
            File(staging, "kernel").absolutePath to KERNEL_DIR_REMOTO,
            File(staging, "mobile-public").absolutePath to PUBLIC_DIR_REMOTO,
        )
        for ((locale, remoto) in destinazioni) {
            TalosPonteAdb.esegui(context, listOf("shell", "rm", "-rf", remoto))
            val push = TalosPonteAdb.esegui(
                context, listOf("push", locale, remoto), attesaMs = 120_000,
            )
            if (!push.ok) {
                Log.e(TAG, "push fallito per $remoto: ${push.motivo} ${push.errore}")
                val res = push.toJs("stdout")
                res.put("giaAttivo", false)
                call.resolve(res)
                return
            }
        }

        // ⭐ 29/8 — AREA_WORKSPACE_DEFAULT nella STESSA chiamata: mai un
        // secondo giro di rete per una singola mkdir, stesso principio già
        // in uso qui per le cartelle campagna. ⭐ 2/9 — AREA_STATO_REMOTO
        // aggiunta qui per lo stesso motivo (R1).
        TalosPonteAdb.esegui(
            context,
            listOf("shell", "mkdir", "-p") + CAMPAGNE_INIZIALI.map { "$BANCO_STUB_REMOTO/$it" } + listOf(AREA_WORKSPACE_DEFAULT, AREA_STATO_REMOTO),
        )

        // ⛔⛔ QUINTO errore trovato sul device vero (28/8): la primissima
        // stesura usava il nome nudo `node`, non `BINARIO_REMOTO` — e la
        // shell remota (nessun `$PATH` con `/data/local/tmp/talos` dentro)
        // rispondeva `setsid: exec node: No such file or directory`,
        // scritto nel log ma MAI sollevato come errore Kotlin (il comando
        // di lancio è backgroundato: `esito.ok` riflette solo che LA RIGA
        // è partita, non che `node` sia stato trovato — letto nel log
        // dopo, non ipotizzato). Stesso percorso assoluto già usato da
        // `eseguiComando`/`assicuraRuntimeSulTelefono`, mai un secondo modo
        // di nominare lo stesso binario.
        //
        // ⛔ `\$!` (non `$!`) — dentro una stringa Kotlin `$` introduce
        // un'interpolazione: serve l'escape per ottenere il letterale `$!`
        // che la SHELL REMOTA leggerà come "pid dell'ultimo job in
        // background", subito dopo averlo backgroundato con `&`.
        val comandoAvvio =
            "setsid $BINARIO_REMOTO $SERVER_JS_REMOTO > $LOG_SERVER_REMOTO 2>&1 & echo \$! > $PID_FILE_REMOTO"
        val comandoBase64 = android.util.Base64.encodeToString(
            comandoAvvio.toByteArray(Charsets.UTF_8), android.util.Base64.NO_WRAP,
        )
        val prefissiServer = listOf(
            // ⛔⛔⛔ 3/9 — owner, dopo aver verificato una build di rilascio:
            // lo strumento `shell` falliva sempre per una sessione ospitata
            // qui (talosHarness.mjs cercava un adb.exe da PC per raggiungere
            // "il" telefono, ma il telefono È questo processo — vedi il
            // commento di `eseguiComandoSandboxato` per la storia intera).
            // Un fatto sull'AMBIENTE di questo processo kernel, impostato
            // UNA VOLTA qui all'avvio: il kernel non smette di essere "sul
            // telefono" a seconda di quale sessione lo chiama.
            "TALOS_KERNEL_SUL_TELEFONO=1",
            "TALOS_BANCO_DIR=$BANCO_STUB_REMOTO",
            "TALOS_HARNESS_UI_PUBLIC_DIR=$PUBLIC_DIR_REMOTO",
            "TALOS_HARNESS_UI_PORT=$PORTA_SERVER",
            // ⭐ 2/9 — R1: la cartella dove la sessione/le automazioni
            // sopravvivono a un `rm -rf` dell'albero server, vedi
            // AREA_STATO_REMOTO sopra.
            "TALOS_HARNESS_UI_STATE_DIR=$AREA_STATO_REMOTO",
            // ⭐ 29/8 — default onesto: `prefissiChiamante` (sotto, dopo
            // questa lista) può SOVRASCRIVERLO — un `VAR=valore` successivo
            // nella stessa riga di comando vince sempre sul precedente,
            // stesso principio POSIX già sfruttato per LD_LIBRARY_PATH.
            "TALOS_HARNESS_UI_PROJECT_DIRS=$AREA_WORKSPACE_DEFAULT",
        )
        val esito = TalosPonteAdb.shell(
            context,
            listOf(PREFISSO_LD) + prefissiServer + prefissiChiamante +
                listOf(BINARIO_REMOTO, EXEC_JS_REMOTO, comandoBase64),
            ammessi = PROGRAMMA_AMMESSO,
        )
        val res = esito.toJs("stdout")
        res.put("giaAttivo", false)
        call.resolve(res)
    }
}

private typealias Esito = TalosPonteAdb.Esito
