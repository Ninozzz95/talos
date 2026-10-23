package ai.talos.aggiornamenti

import ai.talos.BuildConfig
import android.content.Context
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Base64

sealed class TalosEsitoControllo {
    data class Trovata(val trovata: TalosStatoAggiornamento.Trovata) : TalosEsitoControllo()
    object Aggiornata : TalosEsitoControllo()
    /** `impronta`: lo SHA-512 dei byte del manifesto, perché non si riprovi lo stesso (tavola 7). */
    data class Rifiutato(val motivo: String, val impronta: String) : TalosEsitoControllo()
    object GiaRifiutato : TalosEsitoControllo()
    data class Irraggiungibile(val motivo: String) : TalosEsitoControllo()
}

/**
 * Il controllo, nell'ordine del desktop (`aggiornamenti.mjs:76-88`): elenco → release del mobile più alta → se è più nuova,
 * manifesto + firma → firma verificata PRIMA di tutto il resto → versione firmata = versione del tag → più nuova
 * dell'installata. Solo allora si può scaricare l'APK.
 */
object TalosControlloAggiornamenti {

    const val MANIFESTO = "latest-android.yml"
    const val FIRMA = "latest-android.yml.sig"
    private const val MASSIMO_ELENCO = 2 * 1024 * 1024
    private const val MASSIMA_FIRMA = 1024
    private const val TEMPO_MS = 15_000

    fun improntaDi(byte: ByteArray): String =
        Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-512").digest(byte))

    /** La decisione sui byte già letti: pura, provata in `TalosControlloAggiornamentiTest`. */
    fun decidi(
        scelta: TalosReleaseScelta,
        manifesto: ByteArray,
        firmaBase64: String,
        pubblicaPem: String,
        installata: String,
        rifiutato: String?,
    ): TalosEsitoControllo {
        val impronta = improntaDi(manifesto)
        if (impronta == rifiutato) return TalosEsitoControllo.GiaRifiutato
        if (!TalosFirmaAggiornamento.verifica(manifesto, firmaBase64, pubblicaPem)) {
            return TalosEsitoControllo.Rifiutato("firma", impronta)
        }
        val letto = try {
            TalosLettoreManifesto.leggi(manifesto)
        } catch (rifiuto: TalosManifestoRifiutato) {
            return TalosEsitoControllo.Rifiutato("manifesto-${rifiuto.motivo}", impronta)
        }
        if (letto.version != scelta.versione) return TalosEsitoControllo.Rifiutato("versione-del-tag", impronta)
        // la forma del desktop la lascia facoltativa; al mobile serve per prenotare lo spazio e riprendere lo scaricamento
        if (letto.size == null) return TalosEsitoControllo.Rifiutato("manifesto-dimensione", impronta)
        if (!TalosVersioneAggiornamento.piuNuova(letto.version, installata)) return TalosEsitoControllo.Aggiornata
        return TalosEsitoControllo.Trovata(
            TalosStatoAggiornamento.Trovata(scelta.tag, letto.version, "", scelta.pagina, letto.path, letto.sha512, letto.size),
        )
    }

    /** La fonte di questa installazione; null = file di prova malformato (l'aggiornatore si ferma). */
    fun fonte(context: Context): TalosFonteAggiornamenti? {
        val prova = File(context.filesDir, "aggiornamenti-prova.json").takeIf { it.isFile }?.readText()
        val pubblica = context.assets.open("aggiornamenti-pubblica.pem").use { String(it.readBytes(), Charsets.UTF_8) }
        return TalosFonteAggiornamenti.scegli(BuildConfig.APPLICATION_ID.endsWith(".dev"), prova, pubblica)
    }

    /** Il controllo vero, con la rete. Bloccante: lo chiamano il job e il plugin, mai il thread principale. */
    fun controlla(context: Context): TalosEsitoControllo {
        val fonte = fonte(context) ?: return TalosEsitoControllo.Irraggiungibile("fonte-di-prova")
        val installata = BuildConfig.VERSION_NAME
        val esito = try {
            val scelta = TalosSceltaRelease.scegli(String(leggi(fonte.elenco, MASSIMO_ELENCO), Charsets.UTF_8))
            if (scelta == null || !TalosVersioneAggiornamento.piuNuova(scelta.versione, installata)) {
                TalosEsitoControllo.Aggiornata
            } else {
                val manifesto = leggi(fonte.file(scelta.tag, MANIFESTO), TalosLettoreManifesto.MASSIMO_BYTE)
                val firma = String(leggi(fonte.file(scelta.tag, FIRMA), MASSIMA_FIRMA), Charsets.US_ASCII)
                val deciso = decidi(scelta, manifesto, firma, fonte.pubblica, installata, TalosStatoAggiornamento.rifiutato(context))
                if (deciso is TalosEsitoControllo.Trovata) {
                    TalosEsitoControllo.Trovata(deciso.trovata.copy(note = note(fonte, scelta, fonte.pubblica)))
                } else deciso
            }
        } catch (guasto: IOException) {
            TalosEsitoControllo.Irraggiungibile(guasto.message ?: "rete")
        }
        TalosStatoAggiornamento.segnaControllo(context, System.currentTimeMillis())
        return esito
    }

    /** Le novità in en+it, se ci sono e sono firmate; altrimenti "" (non bloccano mai l'aggiornamento). */
    private fun note(fonte: TalosFonteAggiornamenti, scelta: TalosReleaseScelta, pubblica: String): String = try {
        val byte = leggi(fonte.file(scelta.tag, TalosNoteAggiornamento.NOTE), TalosNoteAggiornamento.MASSIMO_BYTE)
        val firma = String(leggi(fonte.file(scelta.tag, TalosNoteAggiornamento.FIRMA), MASSIMA_FIRMA), Charsets.US_ASCII)
        TalosNoteAggiornamento.verificate(scelta.versione, byte, firma, pubblica) ?: ""
    } catch (assenti: IOException) {
        ""
    }

    /** GET con tetto ai byte: una risposta più lunga del previsto non è nostra. */
    internal fun leggi(indirizzo: String, massimo: Int): ByteArray {
        val connessione = URL(indirizzo).openConnection() as HttpURLConnection
        try {
            connessione.connectTimeout = TEMPO_MS
            connessione.readTimeout = TEMPO_MS
            connessione.instanceFollowRedirects = true
            connessione.setRequestProperty("User-Agent", "TALOS-mobile/${BuildConfig.VERSION_NAME}")
            connessione.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream;q=0.9, */*;q=0.1")
            val codice = connessione.responseCode
            if (codice !in 200..299) throw IOException("http-$codice")
            connessione.inputStream.use { flusso ->
                val uscita = ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val letti = flusso.read(buffer)
                    if (letti < 0) break
                    if (uscita.size() + letti > massimo) throw IOException("troppo-grande")
                    uscita.write(buffer, 0, letti)
                }
                return uscita.toByteArray()
            }
        } finally {
            connessione.disconnect()
        }
    }
}
