import { describe, expect, it } from 'vitest'
import { TALOS_METADATA_DETTATO } from '@/lib/tools/tracciaAzione'
import { talosProvenienzaVoce } from '@/lib/voice/provenienzaVoce'

/**
 * ⛔⛔ IL MICROFONO STAVA SULLA COSA SBAGLIATA.
 *
 * Owner 2026-08-11: «quando premo il pulsante sound spunta l'icona microfono
 * accanto al testo. Questo non deve succedere. L'icona microfono deve spuntare
 * solo quando uso il microfono per parlare io con la voce».
 *
 * La riga era `message.role === 'assistant' && parla.lette.has(message.id)`:
 * il microfono marcava «TALOS ha LETTO questo» — cioè il momento in cui TALOS
 * parla e nessuno sta ascoltando. Il marcatore non si sposta: cambia
 * proprietario, e va sul messaggio che la persona ha DETTATO.
 */
describe('⛔ la chiave del dettato', () => {
    it('è quella che il componente legge, e non cambia per sbaglio', () => {
        // ⛔ Il CONTROLLO vive nel template (`metadata?.dictated === true`),
        // perché una funzione esportata costava byte a un grafo d'avvio che sta
        // a meno di cento dal tetto. Questo caso tiene insieme i due lati: se
        // qualcuno rinomina la chiave qui, il componente smette di trovarla e i
        // casi in `TalosMobileMessageList.test.ts` diventano rossi.
        expect(TALOS_METADATA_DETTATO).toBe('dictated')
    })
})

/**
 * ⛔ I CASI DELL'OWNER, sulla provenienza che decide il segno.
 *
 * Non è una prova sul marcatore: è la prova che chi glielo dice risponde bene
 * nei casi che una persona fa davvero. La provenienza esisteva già per leggere
 * la risposta a chi aveva parlato — qui si verifica che regga anche per questo.
 */
describe('⛔ chi decide: la provenienza, nei cinque casi', () => {
    it('(a) detta e manda → è di voce', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        expect(p.nataDiVoce()).toBe(true)
    })

    it('(b) detta e poi corregge due parole → è ANCORA di voce', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        p.aggiornaBozza('accendi la torcia per favore')
        expect(p.nataDiVoce()).toBe(true)
    })

    it('(c) detta, cancella TUTTO e riscrive a mano → NON è di voce', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        p.aggiornaBozza('')
        p.aggiornaBozza('spegni la torcia')
        expect(p.nataDiVoce()).toBe(false)
    })

    it('(d) scrive a mano dall\'inizio → NON è di voce', () => {
        const p = talosProvenienzaVoce()
        p.aggiornaBozza('accendi la torcia')
        expect(p.nataDiVoce()).toBe(false)
    })

    it('(e) turno chiuso: il prossimo riparte pulito', () => {
        const p = talosProvenienzaVoce()
        p.dettatura('', 'accendi la torcia')
        p.azzera()
        expect(p.nataDiVoce()).toBe(false)
    })
})
