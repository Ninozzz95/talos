package ai.talos.parola

/**
 * ⭐ A0-4 (21/10/2026) — «hey TALOS» si crede solo dopo `fotogrammi` punteggi DI FILA sopra soglia.
 *
 * Prima bastava un punteggio: un picco isolato (una parola simile, un rumore) apriva la barra. Hermes conferma su più fotogrammi
 * (`wake-word.md:172-202`, `confirmation_frames` 3) e Home Assistant fa la media su una finestra (`WakeWordListener.kt`): qui la
 * forma di Hermes, perché si spiega in una riga. Un punteggio sotto soglia azzera la serie; dopo lo scatto si riparte da zero.
 * Pura, senza Android: provata sul PC (`TalosConfermaParolaTest`).
 */
class TalosConfermaParola(val fotogrammi: Int = 3, private val soglia: Float) {
    private var diFila = 0

    /** Vero quando questo punteggio completa la serie: la parola è sentita. */
    fun ascolta(punteggio: Float): Boolean {
        diFila = if (punteggio >= soglia) diFila + 1 else 0
        if (diFila < fotogrammi) return false
        diFila = 0
        return true
    }

    fun azzera() {
        diFila = 0
    }
}
