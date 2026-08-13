import { describe, expect, it } from 'vitest'
import {
    TALOS_CAPACITA_INTENT,
    talosCapacita,
    talosComponiUri,
    talosParametriMancanti,
} from '@/lib/intenti/registro'

/**
 * ⭐⭐ IL MOTORE DEGLI INTENT si prova SENZA telefono.
 *
 * È il vantaggio vero di aver fatto un registro invece di otto tool: la forma
 * di ogni URI è un dato, e un dato si controlla in un test che dura
 * millisecondi. Col pilota dello schermo la stessa garanzia costava 27,8 s di
 * corsa su un tablet vero — e falliva.
 */
describe('⭐ il registro degli intent', () => {
    it('preferisce HTTPS agli schemi custom, dove esiste', () => {
        /*
         * ⛔ Non è estetica: `https://wa.me/…` apre il web se WhatsApp non è
         * installato, `whatsapp://` fallisce e basta. La prima via dichiarata è
         * quella che si prova per prima, quindi l'ordine È il comportamento.
         */
        for (const capacita of TALOS_CAPACITA_INTENT) {
            const https = capacita.vie.findIndex((v) => v.tipo === 'https')
            const schema = capacita.vie.findIndex((v) => v.tipo === 'schema')
            if (https >= 0 && schema >= 0) expect(https).toBeLessThan(schema)
        }
    })

    /*
     * ⛔⛔ IL CASO CHE FA DAVVERO MALE, e che un test «funziona» non vede.
     *
     * Un messaggio è testo di una persona, e può contenere `&`, `?`, `=`. Senza
     * codifica quei caratteri diventano SEPARATORI: il resto del messaggio
     * viene letto come altri parametri, e il destinatario o il testo cambiano.
     * ⇒ Il messaggio parte, sembra riuscito, ed è sbagliato. È il difetto
     * peggiore, perché non si presenta come errore.
     */
    it('⛔ un testo con & ? = NON può dirottare i parametri', () => {
        const capacita = talosCapacita('whatsapp_messaggio')
        expect(capacita).not.toBeNull()
        const uri = talosComponiUri(capacita!.vie[0], {
            numero: '393331112222',
            testo: 'vieni? sì & poi phone=666 fine',
        })
        // Un solo `?`: quello del modello. Se ne comparisse un secondo, il
        // testo avrebbe aperto una nuova sezione di query.
        expect(uri.split('?').length - 1).toBe(1)
        // E nessun `&` grezzo: sarebbe l'inizio di un parametro non nostro.
        expect(uri.split('?')[1]).not.toContain('&')
        expect(uri).toContain('phone%3D666')
        expect(uri.startsWith('https://wa.me/393331112222?text=')).toBe(true)
    })

    it('dice COSA manca, non solo che qualcosa manca', () => {
        const capacita = talosCapacita('whatsapp_messaggio')!
        expect(talosParametriMancanti(capacita, { numero: '393331112222' }))
            .toEqual(['testo'])
        // ⛔ Uno spazio non è un valore: chi manda «   » non ha scritto niente.
        expect(talosParametriMancanti(capacita, { numero: '39333', testo: '   ' }))
            .toEqual(['testo'])
        expect(talosParametriMancanti(capacita, { numero: '39333', testo: 'ciao' }))
            .toEqual([])
    })

    /*
     * ⛔ `esce` è DICHIARATO, non dedotto dal nome: decide se serve la conferma
     * con anteprima, e un'azione che spedisce senza chiedere è irreversibile.
     */
    it('ogni azione che ESCE dal dispositivo è marcata', () => {
        const escono = TALOS_CAPACITA_INTENT.filter((c) => c.esce).map((c) => c.id)
        expect(escono).toContain('whatsapp_messaggio')
        expect(escono).toContain('telegram_messaggio')
        expect(escono).toContain('sms_messaggio')
        expect(escono).toContain('email_scrivi')
        // Cercare o navigare non manda niente a nessuno.
        expect(escono).not.toContain('mappe_naviga')
        expect(escono).not.toContain('spotify_cerca')
    })

    it('ogni voce è coerente: id unici, parametri usati, vie non vuote', () => {
        const visti = new Set<string>()
        for (const c of TALOS_CAPACITA_INTENT) {
            expect(visti.has(c.id)).toBe(false)
            visti.add(c.id)
            expect(c.vie.length).toBeGreaterThan(0)
            for (const via of c.vie) {
                // ⛔ Un segnaposto che nessun parametro riempie diventa stringa
                // vuota a runtime: l'URI parte monco e l'errore si vede solo
                // sul telefono di qualcun altro.
                const segnaposti = [...via.modello.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
                for (const s of segnaposti) expect(c.parametri).toContain(s)
            }
        }
    })
})
