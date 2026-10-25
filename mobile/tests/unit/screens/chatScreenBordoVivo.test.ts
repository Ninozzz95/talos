import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⛔ D-VIS-1 seconda metà e D-VIS-4 (Pad, vc153, 23/10).
 *
 * - Il dito risultava giù da minuti e la lista non seguiva il documento che arrivava. Un `touchend` che non risale fino
 *   al contenitore lo lascia appeso; la fine del tocco si ascolta sul DOCUMENTO, in cattura, come `use-stick-to-bottom`
 *   tiene lo stato del puntatore a livello di documento (`useStickToBottom.ts:135-146`).
 * - Durante il prefill compaiono righe nuove (intestazione, stato) e nessuno riportava giù: il compositore le copriva.
 *   Il contenuto della lista si osserva, come il `ResizeObserver` sul contenuto di `use-stick-to-bottom`.
 *
 * Il comportamento vive nel montaggio di ChatScreen, che si prova sul Pad: questo cancello sul sorgente lo rende rosso
 * se una delle due vie sparisce.
 */
describe('il bordo vivo della chat', () => {
    const sorgente = readFileSync(resolve(process.cwd(), 'src/screens/ChatScreen.vue'), 'utf8')

    it('EDGE-03 la fine del tocco si ascolta sul documento, in cattura, e si toglie allo smontaggio', () => {
        expect(sorgente).toMatch(/document\.addEventListener\('touchend', fineDelTocco, \{ capture: true, passive: true \}\)/)
        expect(sorgente).toMatch(/document\.addEventListener\('touchcancel', fineDelTocco, \{ capture: true, passive: true \}\)/)
        expect(sorgente).toMatch(/document\.removeEventListener\('touchend', fineDelTocco, \{ capture: true \}\)/)
        expect(sorgente).toMatch(/document\.removeEventListener\('touchcancel', fineDelTocco, \{ capture: true \}\)/)
        expect(sorgente).toMatch(/liveEdge\.touchEnd\('touches' in evento \? \(evento as TouchEvent\)\.touches\.length : 0\)/)
    })

    it('EDGE-01 sul contenitore il tocco dal compositore si dice tale', () => {
        expect(sorgente).toMatch(/@touchstart\.passive="liveEdge\.touchStart\(dalCompositore\(\$event\)\)"/)
    })

    // ⛔ Revisione del Desktop (23/10): non `firstElementChild` letto una volta: un riferimento al contenitore del contenuto,
    // ri-osservato se l'elemento cambia (un nodo staccato non manda più niente).
    it('EDGE-04 il contenuto della lista è osservato, e ri-osservato se l’elemento cambia', () => {
        expect(sorgente).toMatch(/ref="contenutoChat"/)
        expect(sorgente).toMatch(/watch\(contenutoChat, \(nuovo, vecchio\) => \{[\s\S]{0,200}heightObserver\.unobserve\(vecchio\)[\s\S]{0,120}heightObserver\.observe\(nuovo\)/)
        expect(sorgente).not.toMatch(/firstElementChild/)
    })
})

// ⛔ Parità chat↔Codice (owner 23/10): il Codice r4 usa lo stesso bordo vivo, e lo stesso `touchend` perso lo bloccherebbe.
describe('il bordo vivo del Codice r4', () => {
    const sorgente = readFileSync(resolve(process.cwd(), 'src/screens/CodiceR4Screen.vue'), 'utf8')

    it('EDGE-05 la fine del tocco si ascolta sul documento, in cattura, e si toglie allo smontaggio', () => {
        expect(sorgente).toMatch(/document\.addEventListener\('touchend', fineDelTocco, \{ capture: true, passive: true \}\)/)
        expect(sorgente).toMatch(/document\.addEventListener\('touchcancel', fineDelTocco, \{ capture: true, passive: true \}\)/)
        expect(sorgente).toMatch(/document\.removeEventListener\('touchend', fineDelTocco, \{ capture: true \}\)/)
        expect(sorgente).toMatch(/document\.removeEventListener\('touchcancel', fineDelTocco, \{ capture: true \}\)/)
        expect(sorgente).not.toMatch(/@touchend\.passive="bordoVivo\.touchEnd\(\)"/)
    })
})
