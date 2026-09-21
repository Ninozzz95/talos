import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'

/**
 * ⛔⛔⛔ LA SCHEDA DELLA SVEGLIA — e i DUE difetti che ha portato con sé.
 *
 * Owner 2026-08-14: le schede su tutte le capacità, «sia da chat che da
 * assistente». La sveglia è la prima della lista, e la sua scheda serve a una
 * cosa sola: **far vedere l'ORA**. Lo stesso giorno «metti in agenda domani» è
 * finito due giorni più in là e nessuno se n'è accorto finché non ho
 * interrogato il provider; un'ora scritta grande si controlla in un colpo
 * d'occhio, e una sveglia alle 7 invece che alle 19 costa una giornata.
 *
 * ## I due difetti, visti sul Pad nella build appena spedita
 *
 * 1. Accanto a «07:30» compariva la stringa grezza
 *    **`tools.labels.device_alarm`**: avevo scritto la chiave a mano e quella
 *    chiave non esiste. È la regola «i nomi interni non si mostrano mai»,
 *    rotta dal file che la cita.
 * 2. Sotto compariva «**✓ Verificato sul telefono**» — e la sveglia **non si
 *    può rileggere**: l'API di Android non lo permette a un'app qualunque.
 *    Una spunta di verifica su una cosa non verificata è la bugia del «Fatto»
 *    con un segno sopra, e **invita a non controllare**.
 */

const RADICE = resolve(__dirname, '../../..')
const SCHEDA = 'src/components/chat/TalosMobileSchedaAzione.vue'
const sorgente = readFileSync(resolve(RADICE, SCHEDA), 'utf8')

describe('⛔ la scheda della sveglia', () => {
    it('mostra l’ora, e l’etichetta viene dal CATALOGO', () => {
        expect(sorgente).toContain('talos-sveglia-ora')
        /*
         * ⛔ `etichettaDi`, non una chiave scritta a mano: quella che avevo
         * messo (`tools.labels.device_alarm`) non esiste, e la stringa grezza
         * è finita sullo schermo accanto all'ora.
         */
        expect(sorgente).toContain("etichettaDi('device_alarm')")
        /*
         * ⛔ Si guarda l'USO nel template — `{{ … }}` — non la parola: il
         * commento qui sopra cita la chiave sbagliata come esempio del
         * difetto, ed è giusto che ci sia. È la stessa distinzione già presa
         * in `dictationTempiCondivisi`: «si guarda il PASSAGGIO dell'opzione,
         * non la parola».
         */
        expect(sorgente).not.toMatch(/\{\{\s*t\('tools\.labels\./)
        // E la chiave dev'esserci davvero nel catalogo, se no si ricasca.
        expect(TALOS_TOOL_LABEL_KEYS.device_alarm).toBeTruthy()
    })

    it('⛔⛔ NON dice «verificato»: una sveglia non si può rileggere', () => {
        /*
         * La torcia si rilegge (`dumpsys media.camera`), l'agenda si rilegge
         * (il provider): quelle due la meritano. La sveglia la possiede
         * l'orologio del telefono, e noi sappiamo solo di aver consegnato una
         * richiesta.
         */
        expect(sorgente).toMatch(/v-if="!eSveglia\(s\)"[\s\S]{0,200}?talos-prova/)
    })

    it('⛔ e NON porta un comando «annulla», che non funzionerebbe', () => {
        /*
         * `ACTION_DISMISS_ALARM` su questa ColorOS non cancella niente —
         * misurato per orario, per «la prossima» e per «tutte», con e senza
         * `SKIP_UI`. Una levetta che non spegne è la bugia del «Fatto» con un
         * dito sopra.
         */
        const blocco = sorgente.match(/v-if="eSveglia\(s\)"[\s\S]*?<\/div>/)?.[0] ?? ''
        expect(blocco).toBeTruthy()
        expect(blocco).not.toContain('<button')
        expect(blocco).not.toContain('talos-levetta')
    })

    it('⛔ una sveglia SENZA ora non si disegna', () => {
        // È il dato per cui la scheda esiste: un riquadro vuoto direbbe
        // «guarda» senza niente da guardare.
        expect(sorgente).toMatch(/r\.tipo === 'sveglia'\) return typeof r\.quando === 'string' && r\.quando !== ''/)
    })
})
