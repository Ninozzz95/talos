package ai.talos.voice.pocket

import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Profilo di energia di un tratto di PCM, una cifra per finestra di 10 ms,
 * in dBFS RMS arrotondati (0 = pieno, -60 e sotto = silenzio).
 *
 * Log permanente della GIUNTURA fra frasi (12/09/2026, owner: «dopo "manico
 * di legno," c'e' una pausa troppo lunga prima di "usato per"»): la coda di
 * ogni frase e l'attacco della successiva si leggono qui, nel logcat, senza
 * una sessione diagnostica. Il testo e' corto (150 numeri per 1,5 s).
 */
internal fun talosPocketSeamContour(pcm: FloatArray, sampleRate: Int, windowMs: Int = 10): String {
    val window = (sampleRate.toLong() * windowMs / 1_000L).toInt().coerceAtLeast(1)
    val windows = pcm.size / window
    if (windows <= 0) return "(vuoto)"
    val out = StringBuilder(windows * 4)
    for (index in 0 until windows) {
        val start = index * window
        var sumSquares = 0.0
        for (sample in start until start + window) {
            val value = pcm[sample].toDouble()
            sumSquares += value * value
        }
        val rms = sqrt(sumSquares / window)
        val db = if (rms <= 1e-6) -120 else (20.0 * log10(rms)).toInt()
        if (index > 0) out.append(' ')
        out.append(db)
    }
    return out.toString()
}

/** Il log Android, se c'e'; nei test JVM la classe e' uno stub e il richiamo viene ignorato. */
internal fun talosPocketSeamLog(message: String) {
    runCatching { android.util.Log.i("TalosPocketSeam", message) }
}
