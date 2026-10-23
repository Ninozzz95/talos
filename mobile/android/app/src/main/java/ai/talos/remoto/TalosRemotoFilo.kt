package ai.talos.remoto

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): il taglio dei messaggi sullo
 * stream iroh, uguale a `harness-ui/src/remoto/filo.mjs` di r4 `aeab15222` (foglio `FILO-REMOTO-v1-2026-10-18.md` §1):
 * un messaggio = 4 byte di lunghezza big-endian + JSON in UTF-8, tetto 1 MiB sui byte del JSON, controllato PRIMA di leggere il corpo.
 * Qui solo i byte: la forma del JSON (`v`, `t`) la controlla il TypeScript (`filoRemoto.ts`). Dopo un errore chi legge chiude lo
 * stream: non si risincronizza un flusso a lunghezze.
 */
object TalosRemotoFilo {
    const val BYTE_MASSIMI = 1024 * 1024

    class ErroreFilo(val codice: String, messaggio: String) : IllegalStateException(messaggio)

    fun codifica(json: String): ByteArray {
        val corpo = json.toByteArray(Charsets.UTF_8)
        if (corpo.size > BYTE_MASSIMI) throw ErroreFilo("TOO_LARGE", "A message cannot exceed $BYTE_MASSIMI bytes.")
        return ByteBuffer.allocate(4 + corpo.size).putInt(corpo.size).put(corpo).array()
    }

    /** Riceve i pezzi nell'ordine dello stream e restituisce i messaggi interi (testo JSON). */
    class Lettore {
        private val accumulo = ByteArrayOutputStream()

        val inSospeso: Int get() = accumulo.size()

        fun aggiungi(pezzo: ByteArray): List<String> {
            accumulo.write(pezzo)
            val usciti = mutableListOf<String>()
            var byte = accumulo.toByteArray()
            var inizio = 0
            while (byte.size - inizio >= 4) {
                val lunghezza = ByteBuffer.wrap(byte, inizio, 4).int.toLong() and 0xFFFFFFFFL
                if (lunghezza > BYTE_MASSIMI) throw ErroreFilo("TOO_LARGE", "A message cannot exceed $BYTE_MASSIMI bytes.")
                if (byte.size - inizio - 4 < lunghezza) break
                usciti += utf8(byte, inizio + 4, lunghezza.toInt())
                inizio += 4 + lunghezza.toInt()
            }
            if (inizio > 0) {
                accumulo.reset()
                accumulo.write(byte, inizio, byte.size - inizio)
            }
            return usciti
        }

        private fun utf8(byte: ByteArray, da: Int, quanti: Int): String = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(byte, da, quanti)).toString()
        } catch (e: CharacterCodingException) {
            throw ErroreFilo("BAD_MESSAGE", "A message is not valid UTF-8.")
        }
    }
}
