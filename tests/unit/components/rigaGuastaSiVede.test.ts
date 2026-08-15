// @vitest-environment jsdom
/**
 * ⛔ E il segno si VEDE nell'elenco, non solo nella banca dati.
 *
 * La riconciliazione marca la riga guasta; questo file difende l'altra metà —
 * che quella marcatura arrivi agli occhi. Visto sul Pad il 2026-08-08: la riga
 * di `button_a.png` era identica alle altre, e il file non c'era da un giorno.
 *
 * Una marcatura che non si vede è una marcatura che non esiste: la persona
 * continua a credere di avere un file che non ha.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileLibraryFileRow from '@/components/talos/library/TalosMobileLibraryFileRow.vue'

function riga(status: string) {
    return mount(TalosMobileLibraryFileRow, {
        props: {
            file: {
                id: 'f1',
                display_name: 'button_a.png',
                media_type: 'image/png',
                size_bytes: 100,
                status,
                metadata: {},
            } as never,
            openLabel: 'Apri button_a.png',
        },
        global: { mocks: { $t: (chiave: string) => chiave } },
    })
}

describe('la riga della Libreria dice quando il file non c’è', () => {
    it('MANCANTE-01 ⛔ una riga guasta lo dichiara', () => {
        const wrapper = riga('failed')
        expect(wrapper.find('[data-testid="talos-library-file-missing"]').exists()).toBe(true)
    })

    it('MANCANTE-02 una riga sana NON si allarma', () => {
        // L'altra metà: un avviso su ogni riga sarebbe rumore, e il rumore si
        // impara a ignorare — compreso quello vero.
        const wrapper = riga('available')
        expect(wrapper.find('[data-testid="talos-library-file-missing"]').exists()).toBe(false)
    })

    it('MANCANTE-03 la riga guasta RESTA nell’elenco e si può ancora toccare', () => {
        /*
         * Sparire sarebbe una seconda perdita silenziosa dopo la prima: la
         * persona può volerla cancellare, o ricordarsi da dove veniva.
         */
        const wrapper = riga('failed')
        expect(wrapper.text()).toContain('button_a.png')
        expect(wrapper.find('[data-talos-library-name-button]').exists()).toBe(true)
    })
})
