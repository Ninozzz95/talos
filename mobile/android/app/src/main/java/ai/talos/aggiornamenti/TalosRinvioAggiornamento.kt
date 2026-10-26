package ai.talos.aggiornamenti

import ai.talos.TalosModelDownloadPolicy
import ai.talos.TalosTransferRunner
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Un rinvio che non si deve seguire: definitivo, non si riprova (D-UPD-1). `motivo` finisce nella fase FALLITA. */
class TalosRinvioRifiutato(val motivo: String) : Exception(motivo)

/**
 * ⛔ D-UPD-1 (26/10/2026): dove sta DAVVERO l'APK di una release. GitHub non lo dà a `…/releases/download/<tag>/<file>`: risponde
 * SEMPRE con un 302 verso un indirizzo firmato su un altro host (`release-assets.githubusercontent.com`, firma `se=` di circa
 * un'ora; altrove si è vista `X-Amz-Expires=300`). Il runner condiviso coi modelli i rinvii non li segue di proposito
 * (`TalosTransferRunner.open`): per i modelli li risolve `TalosTransferSession.resolveOn`, per l'aggiornamento mancava, e
 * l'aggiornatore della 0.1.44 e della 0.1.45 prendeva un 302 a ogni richiesta, senza mai un byte.
 *
 * Lo stesso passo di `resolveOn`, con le regole di Obtainium (`http_service.dart:185-240`): HEAD senza seguire, i rinvii sullo
 * stesso host si seguono (al massimo [MASSIMO_SALTI]), il primo indirizzo su un altro host si torna SENZA richiederlo (lo scarica
 * il runner, con Range), mai da https a http, nessuna credenziale (l'aggiornatore non ne ha). L'integrità non dipende dall'host:
 * il manifesto è firmato e lo SHA-512 si controlla sui byte che Android installa (`TalosInstallatoreAggiornamento`).
 */
object TalosRinvioAggiornamento {

    const val MASSIMO_SALTI = 5
    private const val ATTESA_MS = 15_000
    private val DATA_AMZ = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")

    /**
     * Bloccante. Un guasto di rete esce come `IOException` (il runner aspetta e riprova); un rinvio da non seguire come
     * [TalosRinvioRifiutato] (definitivo). `adesso` è l'orologio monotono del runner (`SystemClock.elapsedRealtime`).
     */
    fun risolvi(origine: String, apri: (URL) -> HttpURLConnection, adesso: () -> Long): TalosTransferRunner.Resolved {
        var corrente = URL(origine)
        for (salto in 0..MASSIMO_SALTI) {
            val connessione = apri(corrente)
            try {
                connessione.instanceFollowRedirects = false
                connessione.connectTimeout = ATTESA_MS
                connessione.readTimeout = ATTESA_MS
                connessione.requestMethod = "HEAD"
                connessione.setRequestProperty("Accept-Encoding", "identity")
                val stato = connessione.responseCode
                if (stato !in 300..399) return TalosTransferRunner.Resolved(corrente.toString(), Long.MIN_VALUE)
                val dove = connessione.getHeaderField("Location") ?: throw TalosRinvioRifiutato("rinvio-senza-indirizzo")
                val prossimo = URL(corrente, dove)
                if (!sicuro(corrente, prossimo)) throw TalosRinvioRifiutato("rinvio-non-sicuro")
                if (!stessoHost(corrente, prossimo)) {
                    val firmato = prossimo.toString()
                    return TalosTransferRunner.Resolved(firmato, scadenza(firmato, connessione.getHeaderFieldDate("Date", 0L), adesso))
                }
                corrente = prossimo
            } finally {
                connessione.disconnect()
            }
        }
        throw TalosRinvioRifiutato("troppi-rinvii")
    }

    /** https sempre; http solo da http verso 127.0.0.1 (la fonte di prova della copia affiancata, via `adb reverse`). */
    private fun sicuro(da: URL, verso: URL): Boolean = when (verso.protocol) {
        "https" -> true
        "http" -> da.protocol == "http" && verso.host == "127.0.0.1"
        else -> false
    }

    private fun stessoHost(a: URL, b: URL) =
        a.protocol == b.protocol && a.host.equals(b.host, ignoreCase = true) && a.port == b.port

    /**
     * La scadenza della firma in tempo monotono: dalla data del server, come `TalosTransferSession.deadlineOf`, così l'orologio
     * del dispositivo (il Pad è avanti di ~2 minuti) non conta. Senza `Date` o senza scadenza leggibile: ignota (il 403 alla
     * scadenza fa comunque risolvere di nuovo, `TalosModelDownloadPolicy.applyStatus`).
     */
    private fun scadenza(firmato: String, dataServerMs: Long, adesso: () -> Long): Long {
        if (dataServerMs <= 0L) return Long.MIN_VALUE
        val parametri = parametri(firmato)
        val scadeMs = runCatching {
            parametri["se"]?.let { Instant.parse(it).toEpochMilli() }
                ?: parametri["X-Amz-Date"]?.let { data ->
                    val secondi = parametri["X-Amz-Expires"]?.toLong() ?: return@let null
                    LocalDateTime.parse(data, DATA_AMZ).toInstant(ZoneOffset.UTC).toEpochMilli() + secondi * 1000L
                }
        }.getOrNull() ?: return Long.MIN_VALUE
        val vive = scadeMs - dataServerMs
        // ⛔ Una firma che vive meno del margine del runner (`RESOLVE_MARGIN_MS`, 5 minuti) nasce già «in scadenza»: il runner la
        // risolverebbe di nuovo SUBITO, senza attesa, all'infinito. Visto sul Pad il 26/10 con una firma di 20 s: 11 379 HEAD in un
        // minuto, zero byte. Altrove GitHub ha dato firme da 300 s. Allora la scadenza resta ignota: alla fine della firma arriva
        // il 403 e il runner rifirma (`applyStatus`), coi byte che azzerano il conto dei guasti.
        return if (vive > TalosModelDownloadPolicy.RESOLVE_MARGIN_MS) adesso() + vive else Long.MIN_VALUE
    }

    private fun parametri(indirizzo: String): Map<String, String> =
        URL(indirizzo).query.orEmpty().split('&').mapNotNull { coppia ->
            val uguale = coppia.indexOf('=')
            if (uguale <= 0) null else coppia.substring(0, uguale) to URLDecoder.decode(coppia.substring(uguale + 1), "UTF-8")
        }.toMap()
}
