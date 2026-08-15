import { describe, expect, it, vi } from 'vitest'
import { talosChiudiSuStop } from '@/lib/chat/stopSuAttesa'

/**
 * ⛔⭐⭐ La richiesta ORFANA: la chat diceva «una richiesta di autorizzazione è
 * in attesa» e a schermo non c'era niente da toccare. Vista tre volte in una
 * notte, su entrambi i motori.
 *
 * La catena: Stop col piano aperto → nessuno risolve la promessa e `planRequest`
 * resta non nullo → il foglio del piano vince ogni altra superficie → la scheda
 * di consenso e il pulsante «Controlla azioni» non hanno più dove apparire.
 */
describe('lo Stop chiude anche le attese aperte', () => {
    it('⛔ fermare l\'invio chiude l\'attesa, che altrimenti resta per sempre', () => {
        const controllo = new AbortController()
        const chiudi = vi.fn()

        talosChiudiSuStop(controllo.signal, () => true, chiudi)
        expect(chiudi).not.toHaveBeenCalled()

        controllo.abort()
        expect(chiudi).toHaveBeenCalledTimes(1)
    })

    /**
     * ⛔ Il pezzo davvero delicato. Lo stesso segnale può arrivare a piano già
     * risposto — e in quel momento può essercene aperto un ALTRO, di un altro
     * invio. Senza questa condizione lo Stop di ieri chiude il piano di oggi:
     * un difetto peggiore di quello riparato, e invisibile finché non capita.
     */
    it('⛔ ma NON tocca un\'attesa che non è la sua', () => {
        const controllo = new AbortController()
        const chiudi = vi.fn()

        // «Quella che aspettavo non è più aperta»: è il caso del piano già
        // risposto, con un secondo piano che nel frattempo si è aperto.
        talosChiudiSuStop(controllo.signal, () => false, chiudi)
        controllo.abort()

        expect(chiudi).not.toHaveBeenCalled()
    })

    it('staccato, lo Stop non arriva più — l\'attesa era già finita', () => {
        const controllo = new AbortController()
        const chiudi = vi.fn()

        const stacca = talosChiudiSuStop(controllo.signal, () => true, chiudi)
        stacca()
        controllo.abort()

        expect(chiudi).not.toHaveBeenCalled()
    })

    it('senza segnale non esplode, e staccare è comunque lecito', () => {
        const chiudi = vi.fn()
        expect(() => talosChiudiSuStop(null, () => true, chiudi)()).not.toThrow()
        expect(() => talosChiudiSuStop(undefined, () => true, chiudi)()).not.toThrow()
        expect(chiudi).not.toHaveBeenCalled()
    })

    /**
     * La condizione si legge AL MOMENTO dello stop, non quando si aggancia:
     * fra i due istanti c'è tutta la vita dell'attesa, ed è lì che cambia.
     */
    it('la condizione si legge quando lo Stop arriva, non prima', () => {
        const controllo = new AbortController()
        const chiudi = vi.fn()
        let aperta = false

        talosChiudiSuStop(controllo.signal, () => aperta, chiudi)
        aperta = true
        controllo.abort()

        expect(chiudi).toHaveBeenCalledTimes(1)
    })
})
