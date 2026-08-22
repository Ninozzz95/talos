package ai.talos.voice

import android.content.Context
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Owner 22/8, live durante la prova sul Pad: un crash del sistema (pressione
 * di memoria, non un difetto TALOS - vedi la voce di memoria sul crash OOM
 * di questa stessa sessione) ha cancellato tutte e 12 le frasi appena
 * accettate, tutte in `enrollmentSlots` — solo in memoria nativa, mai
 * scritte. «I dati della registrazione dovrebbero essere memorizzati a ogni
 * step... se un crash succede si può riprendere da dove si lascia».
 *
 * ⛔ Questo NON è il "temporary-PCM step" che la classe doc di
 * `TalosVoiceEnrollment` dice non esistere "apposta, non per omissione" —
 * quella nota argomentava contro un file temporaneo IN CHIARO. Questo è
 * cifrato a riposo con la STESSA disciplina Keystore del profilo salvato
 * ([TalosVoiceProfileCipher], AES-256-GCM, mai la chiave grezza in memoria
 * applicativa), e cancellato (file + alias Keystore, erasure crittografica)
 * nel momento esatto in cui la sessione finisce - commit riuscito o
 * annullamento esplicito, mai lasciato in giro. Owner, stesso turno: fra
 * "solo il progresso" e "le frasi cifrate e ripristinabili", ha scelto la
 * seconda - la resa del tradeoff è sua, non una mia interpretazione.
 *
 * Una sola sessione alla volta per costruzione (stesso invariante di
 * `enrollmentSlots`/`pendingProfile` nel plugin: mai due arruolamenti
 * in corso insieme) - id fisso, non un UUID per tentativo.
 */
internal class TalosVoiceEnrollmentSessionStore(private val context: Context) {

    private val sessionDir: File
        get() = File(context.filesDir, "voice/enrollment-session").apply { mkdirs() }

    private val keyId: String = "enrollment-session.v1"

    private fun slotFile(slotIndex: Int): File = File(sessionDir, "slot-$slotIndex.tve")

    /** Una frase ACCETTATA, scritta subito - mai una rifiutata, per lo stesso motivo per cui `enrollmentSlots` non le tiene. Stessa disciplina fsync-poi-rename di `TalosVoiceProfileStore.save`: un crash a metà scrittura non deve mai lasciare un file mezzo scritto al posto vero. */
    fun saveSlot(slotIndex: Int, capture: TalosVoiceCaptureResult) {
        val plaintext = encodeCapture(capture)
        val sealed = TalosVoiceProfileCipher.encrypt(keyId, plaintext)
        val target = slotFile(slotIndex)
        val tmp = File(target.parentFile, "${target.name}.tmp")
        FileOutputStream(tmp).use { out ->
            DataOutputStream(out).apply {
                writeInt(sealed.nonce.size)
                write(sealed.nonce)
                write(sealed.ciphertext)
                flush()
            }
            out.fd.sync()
        }
        if (!tmp.renameTo(target)) {
            tmp.delete()
            error("Failed to atomically commit enrollment slot file: ${target.absolutePath}")
        }
    }

    /**
     * Ogni frase già persistita, per indice - quella che il wizard può
     * saltare invece di far ri-registrare. Un file corrotto o illeggibile
     * (chiave Keystore persa dopo un aggiornamento del sistema, per esempio)
     * si scarta silenziosamente: quella frase torna semplicemente da
     * rifare, non blocca il ripristino delle altre.
     */
    fun loadPersistedSlots(): Map<Int, TalosVoiceCaptureResult> {
        val files = sessionDir.listFiles { file -> file.name.startsWith("slot-") && file.extension == "tve" }
            ?: return emptyMap()
        val result = HashMap<Int, TalosVoiceCaptureResult>()
        for (file in files) {
            val slotIndex = file.nameWithoutExtension.removePrefix("slot-").toIntOrNull() ?: continue
            val capture = runCatching { readSlot(file) }.getOrNull() ?: continue
            result[slotIndex] = capture
        }
        return result
    }

    private fun readSlot(file: File): TalosVoiceCaptureResult {
        val bytes = file.readBytes()
        val input = DataInputStream(ByteArrayInputStream(bytes))
        val nonceLength = input.readInt()
        require(nonceLength in 1..64) { "Corrupted enrollment slot file (implausible nonce length $nonceLength): ${file.absolutePath}" }
        val nonce = ByteArray(nonceLength).also { input.readFully(it) }
        val ciphertext = ByteArray(bytes.size - 4 - nonceLength).also { input.readFully(it) }
        val plaintext = TalosVoiceProfileCipher.decrypt(keyId, TalosVoiceCiphertext(nonce, ciphertext))
        return decodeCapture(plaintext)
    }

    /** Erasure crittografica dell'intera sessione - commit riuscito, o la persona ha annullato. Entrambe le metà, sempre: stessa disciplina di `TalosVoiceProfileStore.delete`. */
    fun clearSession() {
        sessionDir.listFiles { file -> file.name.startsWith("slot-") }?.forEach { it.delete() }
        TalosVoiceProfileCipher.deleteKey(keyId)
    }

    private fun encodeCapture(capture: TalosVoiceCaptureResult): ByteArray {
        val buffer = java.io.ByteArrayOutputStream()
        DataOutputStream(buffer).apply {
            writeInt(capture.sampleRate)
            writeBoolean(capture.clientSilencedObserved)
            writeInt(capture.droppedReadCount)
            writeBoolean(capture.cancelled)
            writeInt(capture.pcm16Mono.size)
            for (sample in capture.pcm16Mono) writeShort(sample.toInt())
            flush()
        }
        return buffer.toByteArray()
    }

    private fun decodeCapture(bytes: ByteArray): TalosVoiceCaptureResult {
        val input = DataInputStream(ByteArrayInputStream(bytes))
        val sampleRate = input.readInt()
        val clientSilencedObserved = input.readBoolean()
        val droppedReadCount = input.readInt()
        val cancelled = input.readBoolean()
        val sampleCount = input.readInt()
        require(sampleCount in 0..(TalosVoiceRecorder.TARGET_SAMPLE_RATE * 60)) {
            "Corrupted enrollment slot (implausible sample count $sampleCount)"
        }
        val samples = ShortArray(sampleCount) { input.readShort() }
        return TalosVoiceCaptureResult(
            pcm16Mono = samples,
            sampleRate = sampleRate,
            clientSilencedObserved = clientSilencedObserved,
            droppedReadCount = droppedReadCount,
            cancelled = cancelled,
        )
    }
}
