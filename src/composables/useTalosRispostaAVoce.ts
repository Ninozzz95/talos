import { ref, watch } from 'vue'
import { talosProvenienzaVoce } from '@/lib/voice/provenienzaVoce'
import { useTalosSpeech } from '@/composables/useTalosSpeech'

/**
 * ⭐⭐ HAI PARLATO ⇒ TI RISPONDE A VOCE, mentre la risposta si scrive.
 *
 * Owner 2026-08-10: «se premo il pulsante in basso a destra per parlare, la
 * risposta deve essere automaticamente in TTS».
 *
 * ⛔ Sta in un modulo suo, caricato DOPO l'avvio, per una misura: tenendolo
 * dentro alla schermata il grafo iniziale passava da 597.141 a 600.958 byte su
 * un tetto di 600.000 (compito #51). Chi apre una chat per leggere non deve
 * pagare il pezzo che serve a chi parla.
 *
 * ⛔ Il ritardo non apre un buco: prima che qualcuno riesca a toccare il
 * microfono il modulo c'è già, e se per assurdo non ci fosse l'esito è
 * «risposta non letta» — cioè il comportamento di prima, non un guasto.
 */
export interface TalosRispostaAVoce {
    /**
     * Fra quali lingue puo' muoversi il riconoscitore in automatico.
     *
     * ⛔ Sta QUI e non nella schermata per la stessa misura: la regola che le
     * sceglie e il censimento del dispositivo pesavano sul grafo d'avvio, e
     * servono solo a chi tocca il microfono.
     */
    lingue: readonly string[]
    /** La dettatura ha scritto: `prima` la bozza com'era, `dopo` com'è. */
    dettatura(prima: string, dopo: string): void
    /** La bozza è cambiata a mano (o è stata svuotata). */
    aggiornaBozza(testo: string): void
    /** Si sta inviando: dice se il turno nasce dalla voce, e riparte pulito. */
    catturaInvio(): boolean
}

export function useTalosRispostaAVoce(input: {
    /** Il testo che sta arrivando dal modello, o `null` quando è finito. */
    streaming: () => string | null
    /** I messaggi della chat, per posare il segnalino su quello vero. */
    messaggi: () => readonly { id: string; role: string }[]
    /** La lingua in cui TALOS sta parlando adesso. */
    interfaccia: () => string
}): TalosRispostaAVoce {
    const provenienza = talosProvenienzaVoce()
    const lingue = ref<readonly string[]>([])
    void (async () => {
        const [{ talosLingueDichiarate }, { talosLingueDaAscoltare }] = await Promise.all([
            import('@/services/dictationCasa'),
            import('@/lib/voice/lingueDaAscoltare'),
        ])
        const dichiarate = await talosLingueDichiarate()
        lingue.value = talosLingueDaAscoltare({
            sistema: typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])],
            interfaccia: input.interfaccia(),
            preferita: dichiarate.preferred,
            supportate: dichiarate.languages,
        })
    })()
    const parla = useTalosSpeech()
    const attesa = ref(false)

    /**
     * ⛔ Durante lo streaming il messaggio VERO non esiste ancora — c'è solo il
     * testo. La lettura si apre quindi su un identificativo del TURNO, e il
     * segnalino si posa sul messaggio quando nasce. L'alternativa era aspettare
     * la fine per sapere l'id, cioè leggere una risposta già letta con gli
     * occhi: esattamente ciò che l'owner non vuole.
     */
    const ID_TURNO = 'voce:in-corso'
    let ultimoTesto = ''

    watch(input.streaming, (testo) => {
        if (!attesa.value) return
        if (testo) {
            if (parla.speakingId.value !== ID_TURNO && !parla.apriLetturaDiVoce(ID_TURNO)) {
                // Qualcosa si sta già leggendo: chi l'ha chiesto viene prima.
                attesa.value = false
                return
            }
            ultimoTesto = testo
            void parla.seguiIlTesto(ID_TURNO, testo, false)
            return
        }
        if (parla.speakingId.value === ID_TURNO) {
            void parla.seguiIlTesto(ID_TURNO, ultimoTesto, true)
            const ultima = [...input.messaggi()].reverse().find((m) => m.role === 'assistant')
            if (ultima) {
                parla.segnaLetta(ultima.id)
                // ⛔ E la lettura passa SOTTO il messaggio vero: cosi' la sua
                // riga di comandi mostra «ferma» finche' la voce parla, e un
                // tocco la interrompe. Senza, il pulsante resta altoparlante
                // mentre TALOS sta parlando — owner 2026-08-10.
                parla.rinominaLettura(ID_TURNO, ultima.id)
            }
        }
        attesa.value = false
        ultimoTesto = ''
    })

    return {
        get lingue() { return lingue.value },
        dettatura: (prima, dopo) => provenienza.dettatura(prima, dopo),
        aggiornaBozza: (testo) => provenienza.aggiornaBozza(testo),
        catturaInvio() {
            // ⛔ Si legge PRIMA che il campo si svuoti: dopo, la bozza è vuota e
            // la risposta sarebbe sempre «no».
            const diVoce = provenienza.nataDiVoce()
            provenienza.azzera()
            attesa.value = diVoce
            return diVoce
        },
    }
}
