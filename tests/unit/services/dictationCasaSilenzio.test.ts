import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ IL NUMERO DEVE ARRIVARE AL PONTE — e questo test esiste perché non ci era
 * arrivato mai.
 *
 * Owner 2026-08-11: «l'assistente parte, dice che ascolta, io parlo e non
 * succede nulla». Misurato sul Pad in `logcat`: il microfono si apriva e si
 * chiudeva dopo **2000 ms** netti, cioè il tempo di default del motore.
 * `silenceMillis` esisteva nel plugin nativo, nel tipo delle opzioni e nel
 * composable — e moriva nell'ULTIMO passo, dove `dictationCasa` costruisce
 * l'oggetto per il ponte a mano e semplicemente non lo copiava.
 *
 * ⛔ Un test sul tipo non l'avrebbe visto: il campo era dichiarato ovunque. Lo
 * vede solo un test che guarda **cosa arriva davvero dall'altra parte**, che è
 * la stessa lezione di `righe-per-il-modello-sullo-schermo`: la funzione pura
 * era giusta, sbagliava il chiamante.
 *
 * ⛔ E i due versi: che il numero passi quando c'è, e che NON compaia inventato
 * quando non c'è — un `silenceMillis: undefined` sul ponte è un valore, e i
 * `putExtra` nativi si accendono su `> 0`.
 */

const avvii: Array<Record<string, unknown>> = []

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: () => ({
        start: (opzioni: Record<string, unknown>) => {
            avvii.push(opzioni)
            return Promise.resolve({ started: true })
        },
        stop: () => Promise.resolve(),
        cancel: () => Promise.resolve(),
        checkPermissions: () => Promise.resolve({ microfono: 'granted' }),
        requestPermissions: () => Promise.resolve({ microfono: 'granted' }),
        addListener: () => Promise.resolve({ remove: () => Promise.resolve() }),
        removeAllListeners: () => Promise.resolve(),
    }),
}))

const eventi = {
    onPartial: () => undefined,
    onEnd: () => undefined,
    onError: () => undefined,
}

describe('⛔ il silenzio dichiarato attraversa il ponte', () => {
    beforeEach(() => { avvii.length = 0 })

    it('⭐ il numero chiesto ARRIVA al plugin nativo', async () => {
        const { creaMotoreDiCasa } = await import('@/services/dictationCasa')
        await creaMotoreDiCasa().start(eventi, { silenceMillis: 6000 })
        expect(avvii).toHaveLength(1)
        expect(avvii[0]).toMatchObject({ silenceMillis: 6000 })
    })

    it('⛔ senza richiesta la chiave NON compare: decide il motore, non un undefined', async () => {
        const { creaMotoreDiCasa } = await import('@/services/dictationCasa')
        await creaMotoreDiCasa().start(eventi, {})
        expect(avvii).toHaveLength(1)
        expect(Object.keys(avvii[0])).not.toContain('silenceMillis')
    })

    it('⛔ zero vale come «non chiesto»: i putExtra nativi si accendono su > 0', async () => {
        const { creaMotoreDiCasa } = await import('@/services/dictationCasa')
        await creaMotoreDiCasa().start(eventi, { silenceMillis: 0, minimumMillis: 0 })
        expect(Object.keys(avvii[0])).not.toContain('silenceMillis')
        expect(Object.keys(avvii[0])).not.toContain('minimumMillis')
    })

    /*
     * ⛔ I DUE TEMPI VIAGGIANO SEPARATI, ed è il punto: prima il minimo si
     * ricavava dal silenzio con un `× 5`, quindi accorciare l'invio accorciava
     * anche la pazienza. Questo caso fallisce se qualcuno li rilega.
     */
    it('⭐ la pausa «ho finito» e l’attesa «comincia pure» arrivano DIVERSE', async () => {
        const { creaMotoreDiCasa } = await import('@/services/dictationCasa')
        await creaMotoreDiCasa().start(eventi, { silenceMillis: 1500, minimumMillis: 8000 })
        expect(avvii[0]).toMatchObject({ silenceMillis: 1500, minimumMillis: 8000 })
    })
})
