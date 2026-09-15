import { describe, expect, it } from 'vitest'
import { TALOS_REASONING_MIN_INTERVAL_MS, talosCreateReasoningGate } from '@/lib/chat/reasoningGate'

/**
 * Il ritmo con cui il ragionamento diventa schermo.
 *
 * Owner 2026-08-06: sotto un modello locale lo scorrimento è duro, e il blocco
 * del ragionamento è il pezzo peggiore. La causa, confermata dalla ricerca sul
 * rendering in WebView: **il lavoro diventa DOM troppo presto** — una scrittura
 * reattiva per token, migliaia in una risposta, quasi tutte invisibili perché il
 * testo della traccia non è nemmeno montato finché non si apre il cassetto.
 *
 * Queste prove guardano il ritmo da solo, perché è lì che vive la decisione:
 * il primo pezzo passa subito, quelli dentro la finestra no, e niente si perde.
 */
describe('il ritmo del ragionamento', () => {
    function orologio(): { avanza(ms: number): void; ora(): number } {
        let adesso = 1_000
        return { avanza: (ms) => { adesso += ms }, ora: () => adesso }
    }

    it('il primo pezzo passa subito: la riga «sto ragionando» non si fa aspettare', () => {
        const tempo = orologio()
        const ritmo = talosCreateReasoningGate(TALOS_REASONING_MIN_INTERVAL_MS, tempo.ora)
        expect(ritmo.accept()).toBe(true)
    })

    it('dentro la finestra trattiene, fuori lascia passare', () => {
        const tempo = orologio()
        const ritmo = talosCreateReasoningGate(66, tempo.ora)
        expect(ritmo.accept()).toBe(true)

        tempo.avanza(20)
        expect(ritmo.accept()).toBe(false)
        tempo.avanza(20)
        expect(ritmo.accept()).toBe(false)
        // 65ms dal passaggio precedente: ancora dentro.
        tempo.avanza(25)
        expect(ritmo.accept()).toBe(false)
        tempo.avanza(1)
        expect(ritmo.accept()).toBe(true)
    })

    /**
     * ⛔ La prova che rende il ritmo onesto. Trattenere è accettabile solo se
     * ciò che resta indietro viene liberato: il primo carattere della risposta
     * significa che il ragionamento è finito, e la traccia va mostrata intera.
     */
    it('quello che resta indietro esce col primo carattere della risposta', () => {
        const tempo = orologio()
        const ritmo = talosCreateReasoningGate(66, tempo.ora)
        ritmo.accept()
        tempo.avanza(10)
        expect(ritmo.accept()).toBe(false)

        expect(ritmo.release()).toBe(true)
        // Una volta liberato, non c'è più niente da liberare.
        expect(ritmo.release()).toBe(false)
    })

    it('se non c\'è niente di trattenuto, la risposta non fa scrivere niente', () => {
        const tempo = orologio()
        const ritmo = talosCreateReasoningGate(66, tempo.ora)
        expect(ritmo.release()).toBe(false)
        ritmo.accept()
        expect(ritmo.release()).toBe(false)
    })

    /**
     * `release()` conta come un passaggio: senza, il token subito successivo
     * scriverebbe di nuovo e il ritmo salterebbe proprio dove serve di più.
     */
    it('liberare riavvia la finestra', () => {
        const tempo = orologio()
        const ritmo = talosCreateReasoningGate(66, tempo.ora)
        ritmo.accept()
        tempo.avanza(10)
        ritmo.accept()
        ritmo.release()
        tempo.avanza(10)
        expect(ritmo.accept()).toBe(false)
    })

    it('un ragionamento nuovo riparte dal primo fotogramma', () => {
        const tempo = orologio()
        const ritmo = talosCreateReasoningGate(66, tempo.ora)
        ritmo.accept()
        tempo.avanza(5)
        expect(ritmo.accept()).toBe(false)

        ritmo.reset()
        expect(ritmo.accept()).toBe(true)
        // …e non si porta dietro il trattenuto del ragionamento precedente.
        expect(ritmo.release()).toBe(false)
    })

    /**
     * Il numero non è un'opinione: 66ms sono ~15 aggiornamenti al secondo,
     * dentro la finestra 10-20 Hz che la ricerca indica come il punto in cui un
     * umano legge «continuo» e il ponte verso la vista nativa respira.
     */
    it('la finestra sta fra 10 e 20 aggiornamenti al secondo', () => {
        const alSecondo = 1000 / TALOS_REASONING_MIN_INTERVAL_MS
        expect(alSecondo).toBeGreaterThanOrEqual(10)
        expect(alSecondo).toBeLessThanOrEqual(20)
    })
})
