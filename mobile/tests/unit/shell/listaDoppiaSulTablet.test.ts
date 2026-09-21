import { describe, expect, it } from 'vitest'
import { talosTabletLeavesChatsRoute } from '@/lib/tabletLayout'

/**
 * ⛔⛔ LISTA-DOPPIA-01 — la stessa lista, disegnata due volte, affiancata.
 *
 * ## Fotografato dall'owner il 2026-08-20
 *
 * Tablet in verticale: a sinistra la barra laterale con l'elenco delle chat, a
 * destra — dove va la conversazione — **lo stesso identico elenco**, con la sua
 * intestazione «Chat» e la sua freccia indietro. Venti righe a sinistra, le
 * stesse venti a destra.
 *
 * ## Perché succedeva
 *
 * Sul tablet la barra laterale **è** l'elenco delle chat: c'è sempre. La rotta
 * `chats` disegna quell'elenco nel riquadro principale, e sul telefono è
 * giusto — lì la barra non c'è. Sul tablet le due cose si sommano.
 *
 * ⛔ E il codice lo sapeva già: all'avvio, se la stazione ricordata era
 * `chats` e il dispositivo è un tablet, non la ripristinava — con accanto il
 * commento «sheet right next to the identical panel». Ma quella guardia
 * copriva **solo l'avvio a freddo**. Ci si arriva anche a caldo: dal telefono
 * si tocca «Tutte le chat», poi si allarga la finestra o si ruota, ed eccole
 * due.
 *
 * ⇒ La domanda è una sola e va risposta in un posto solo: su un tablet la
 * rotta `chats` non ha ragione di esistere, perché il pannello la sta già
 * mostrando.
 */

describe('LISTA-DOPPIA-01', () => {
    it('⛔ su TABLET la rotta «chats» va lasciata: il pannello la mostra già', () => {
        expect(talosTabletLeavesChatsRoute(true, 'chats')).toBe(true)
    })

    it('⛔ e al contrario, sul TELEFONO resta: lì la barra laterale non c\'è', () => {
        expect(talosTabletLeavesChatsRoute(false, 'chats')).toBe(false)
    })

    it('nessun\'altra rotta viene toccata, su nessuno dei due', () => {
        for (const rotta of ['chat', 'settings', 'research', 'context']) {
            expect(talosTabletLeavesChatsRoute(true, rotta)).toBe(false)
            expect(talosTabletLeavesChatsRoute(false, rotta)).toBe(false)
        }
    })

    it('⛔ una rotta assente non fa decidere niente', () => {
        // Durante il primo giro del router il nome può non esserci ancora, e
        // una redirezione decisa lì porterebbe via da una pagina che la persona
        // non ha ancora visto.
        expect(talosTabletLeavesChatsRoute(true, null)).toBe(false)
        expect(talosTabletLeavesChatsRoute(true, undefined)).toBe(false)
    })
})
