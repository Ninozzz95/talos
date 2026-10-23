import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chiaveDellaVista } from '@/lib/chiaveDellaVista'

/**
 * ⛔ D-RM4-7 (dal Pad, 20/10/2026): dalla sessione di un PC (`computer-codice`) un tocco su «Codice» (`codice-r4`) teneva la STESSA
 * istanza di `CodiceR4Screen` (la vista delle rotte in `App.vue` non aveva una chiave): `pcRemoto` si legge una volta sola, quindi il
 * Codice «del telefono» restava attaccato al ponte del PC, col suo errore, e il r4 del telefono non partiva nemmeno.
 * La chiave separa i MODI (il telefono, ogni PC); dentro lo stesso modo la schermata resta quella (la sessione la cambia lei).
 */
describe('la chiave della vista delle rotte', () => {
    it('CHV-01 il Codice del telefono, quello di un PC e quello di un altro PC non sono la stessa schermata', () => {
        const locale = chiaveDellaVista({ name: 'codice-r4', params: {} })
        const pcUno = chiaveDellaVista({ name: 'computer-codice', params: { pcId: 'uno', id: 's1' } })
        const pcDue = chiaveDellaVista({ name: 'computer-codice', params: { pcId: 'due', id: 's1' } })
        expect(new Set([locale, pcUno, pcDue]).size).toBe(3)
        // nemmeno un PC con l'id vuoto (una rotta storta) può avere la chiave del telefono
        expect(chiaveDellaVista({ name: 'computer-codice', params: { pcId: '' } })).not.toBe(locale)
    })

    it('CHV-02 dentro lo stesso modo la chiave non cambia (cambiare sessione non rimonta la schermata); le altre rotte non ne hanno', () => {
        expect(chiaveDellaVista({ name: 'codice-r4', params: { id: 'a' } })).toBe(chiaveDellaVista({ name: 'codice-r4', params: {} }))
        expect(chiaveDellaVista({ name: 'computer-codice', params: { pcId: 'uno', id: 'a' } }))
            .toBe(chiaveDellaVista({ name: 'computer-codice', params: { pcId: 'uno' } }))
        expect(chiaveDellaVista({ name: 'chat', params: {} })).toBeUndefined()
    })

    it('CHV-03 App.vue usa la chiave su tutte e due le viste delle rotte (anche quella di ripiego)', () => {
        const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
        expect(app.match(/:key="chiaveDellaVista\(/gu)?.length ?? 0).toBeGreaterThanOrEqual(2)
    })
})
