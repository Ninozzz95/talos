/**
 * ⛔ Una capacità che si spegne va detta PRIMA che serva — e una sola volta.
 *
 * ## Da dove nasce
 *
 * Owner 2026-08-07: «ogni volta che i permessi si spengono per colpa dell'OS
 * dobbiamo segnalarlo in maniera efficace».
 *
 * Non è un caso limite. Shizuku vive come shell e **muore a ogni riavvio del
 * telefono**: chi ieri accendeva il Wi-Fi dalla chat, stamattina non può più, e
 * lo scopre chiedendolo. ColorOS revoca per conto suo; Android azzera i
 * permessi delle app inattive da mesi. Tre cause, un solo effetto.
 *
 * ## Cosa difende questo file
 *
 * Le tre metà della regola, e sono tre perché ognuna da sola fa danno:
 *
 * 1. **Solo ciò che si è spento.** Una capacità che non c'è mai stata non è una
 *    notizia: è la normalità di quel telefono. Annunciarla è rumore, e il
 *    rumore si impara a ignorare — compreso quello vero. È lo stesso errore che
 *    ho commesso oggi con le 22 righe della Libreria.
 * 2. **Una volta sola.** Tre riavvii in un pomeriggio devono lasciare una riga,
 *    non tre.
 * 3. **Chi torna si dimentica.** Senza, il guardiano parlerebbe una volta e poi
 *    tacerebbe per sempre.
 */
import { describe, expect, it } from 'vitest'
import {
    talosCapabilityLossKey,
    talosCapabilityLossWeight,
    talosCapabilityWatch,
} from '@/lib/device/capabilityWatch'

describe('il guardiano delle capacità', () => {
    it('SPENTA-01 ⛔ dice ciò che si è SPENTO', () => {
        const esito = talosCapabilityWatch(
            { device_wifi: true, device_torch: true },
            { device_wifi: false, device_torch: true },
        )

        expect(esito.lost.map((perdita) => perdita.id)).toEqual(['device_wifi'])
        expect(esito.regained).toEqual([])
    })

    it('SPENTA-02 ⛔ TACE su ciò che non c’è mai stato', () => {
        /*
         * La metà che protegge dal rumore. Su questo telefono Shizuku non
         * autorizzerà mai TALOS: annunciarlo a ogni avvio sarebbe un allarme
         * che suona sempre, e un allarme che suona sempre è spento.
         */
        const esito = talosCapabilityWatch(
            { device_wifi: false, device_torch: true },
            { device_wifi: false, device_torch: true },
        )

        expect(esito.lost).toEqual([])
    })

    it('SPENTA-03 chi torna non si annuncia, ma si dimentica', () => {
        const esito = talosCapabilityWatch(
            { device_wifi: false },
            { device_wifi: true },
        )

        expect(esito.lost).toEqual([])
        expect(esito.regained).toEqual(['device_wifi'])
        // ⛔ E lo stato nuovo dice «c'è»: così il prossimo spegnimento torna a
        // essere una notizia. Senza questo si parla una volta e poi mai più.
        expect(esito.next.device_wifi).toBe(true)
    })

    it('SPENTA-04 una capacità che l’app non conosce più NON è una perdita', () => {
        /*
         * Uno strumento tolto da una versione all'altra sparirebbe dalla
         * fotografia nuova. Chiamarlo «perso» manderebbe la persona a cercare
         * un interruttore che non esiste in nessuna schermata.
         */
        const esito = talosCapabilityWatch(
            { strumento_vecchio: true, device_torch: true },
            { device_torch: true },
        )

        expect(esito.lost).toEqual([])
    })

    it('SPENTA-05 ⛔ le due cause hanno DUE pesi, perché hanno due cure', () => {
        /*
         * Un ponte caduto si risolve in un tocco quando torni sull'app. Un
         * permesso revocato dal sistema è una decisione presa al posto tuo, e
         * va saputa anche se il telefono è in tasca. Dare a entrambi lo stesso
         * peso vuol dire non averli distinti — la stessa lezione del ripiego
         * che non separava «Shizuku spento» da «Shizuku che rifiuta».
         */
        expect(talosCapabilityLossWeight({ id: 'x', cause: 'bridge-down' })).toBe('notable')
        expect(talosCapabilityLossWeight({ id: 'x', cause: 'revoked' })).toBe('demanding')
    })

    it('SPENTA-06 la chiave è UNA per capacità: tre riavvii, una riga', () => {
        const prima = talosCapabilityLossKey({ id: 'device_wifi', cause: 'bridge-down' })
        const dopo = talosCapabilityLossKey({ id: 'device_wifi', cause: 'revoked' })

        // Stessa capacità ⇒ stessa chiave, anche se la causa cambia: il
        // registro sostituisce la riga invece di accumularne una per evento.
        expect(prima).toBe(dopo)
        expect(prima).not.toBe(talosCapabilityLossKey({ id: 'device_torch', cause: 'bridge-down' }))
    })

    it('SPENTA-07 morde: senza il confronto, ogni avvio annuncerebbe TUTTO', () => {
        /*
         * La prova che SPENTA-02 non passa per costruzione. Senza memoria del
         * «prima», l'unico modo di sapere cosa dire sarebbe elencare tutto ciò
         * che è spento adesso — su questo telefono, ogni singolo avvio.
         */
        const adesso = { device_wifi: false, device_bluetooth: false, device_torch: true }
        const senzaConfronto = Object.entries(adesso).filter(([, c_e]) => !c_e)
        expect(senzaConfronto).toHaveLength(2)

        const conConfronto = talosCapabilityWatch(adesso, adesso)
        expect(conConfronto.lost).toHaveLength(0)
    })
})
