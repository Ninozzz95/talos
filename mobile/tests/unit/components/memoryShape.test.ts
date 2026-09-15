import { describe, expect, it } from 'vitest'
import {
    talosMemoryKindLabelKey,
    talosMemoryKindOf,
    talosMemoryPreview,
    talosMemoryScope,
    talosMemoryStateLabelKey,
    talosMemoryStateOf,
} from '@/components/talos/memory/memoryShape'
import { talosMemoryRowActions } from '@/components/talos/memory/memoryActions'

const ETICHETTE = {
    open: 'apri',
    edit: 'modifica',
    activate: 'attiva',
    pause: 'pausa',
    exportText: 'esporta',
    remove: 'elimina',
    removeNamed: 'elimina X',
}

describe('che cos’è una memoria, letto dalla riga vera', () => {
    it('riconosce i quattro tipi e NON inventa un ripiego per il quinto', () => {
        expect(talosMemoryKindOf('preference')).toBe('preference')
        expect(talosMemoryKindOf('policy_note')).toBe('policy_note')
        // ⛔ Il verso contrario: `rejected` esiste nel modello dati e NON è uno
        // dei quattro. Cadere su «Preferenza» scriverebbe una cosa falsa con
        // l'aria di saperla.
        expect(talosMemoryKindOf('rejected')).toBeNull()
        expect(talosMemoryKindOf(undefined)).toBeNull()
        expect(talosMemoryKindLabelKey('rejected')).toBe('memory.kindReview')
        expect(talosMemoryKindLabelKey('procedure')).toBe('memory.procedure')
    })

    /**
     * Tre stati, e si leggono da DUE campi. Guardarne uno solo lascerebbe
     * passare per attiva una proposta che nessuno ha approvato.
     */
    it('legge lo stato dallo `status` E dal `kind`', () => {
        expect(talosMemoryStateOf({ status: 'active', kind: 'preference' })).toBe('active')
        expect(talosMemoryStateOf({ status: 'disabled', kind: 'preference' })).toBe('paused')
        expect(talosMemoryStateOf({ status: 'quarantined', kind: 'preference' })).toBe('review')
        expect(talosMemoryStateOf({ status: 'rejected', kind: 'preference' })).toBe('review')
        // Stato perfettamente normale, tipo che non lo è.
        expect(talosMemoryStateOf({ status: 'active', kind: 'rejected' })).toBe('review')
        expect(talosMemoryStateLabelKey('paused')).toBe('memory.statePaused')
    })

    it('dice dove vale una memoria, e non scrive «Globale» su tutto', () => {
        expect(talosMemoryScope({ scope_type: 'global' })).toEqual({ key: 'memory.global' })
        expect(talosMemoryScope({ scope_type: 'session' })).toEqual({ key: 'memory.chatScope' })
        expect(talosMemoryScope({ scope_type: 'project', scope_id: 'avm' }))
            .toEqual({ key: 'memory.projectScoped', params: { id: 'avm' } })
        // Un progetto senza id non è «Progetto · undefined».
        expect(talosMemoryScope({ scope_type: 'project', scope_id: null })).toEqual({ key: 'memory.project' })
    })

    it('taglia l’anteprima alle parole, e tiene gli a capo che danno la forma', () => {
        expect(talosMemoryPreview('1. Prova\n2. Controlla')).toBe('1. Prova\n2. Controlla')
        // Gli spazi DENTRO una riga si schiacciano, le righe fra loro no.
        expect(talosMemoryPreview('  molti     spazi  ')).toBe('molti spazi')
        const lungo = 'parola '.repeat(60)
        const corto = talosMemoryPreview(lungo, 40)
        expect(corto.length).toBeLessThanOrEqual(40)
        expect(corto.endsWith('…')).toBe(true)
        // Sotto il limite non si tocca niente: un taglio che scatta sempre è un
        // taglio che non si è mai provato spento.
        expect(talosMemoryPreview('corta', 40)).toBe('corta')
    })
})

/**
 * ⛔ Le voci del menu dicono cosa SUCCEDE, non in che stato si è — il contrario
 * dell'etichetta dell'interruttore, che per WAI-ARIA APG non cambia mai.
 */
describe('le azioni di una memoria', () => {
    it('offre le stesse cinque voci, con l’interruttore che dice l’effetto', () => {
        const attiva = talosMemoryRowActions({ status: 'active', kind: 'preference' }, ETICHETTE)
        expect(attiva.map((voce) => voce.id)).toEqual(['open', 'edit', 'toggle', 'export', 'delete'])
        expect(attiva.find((voce) => voce.id === 'toggle')?.label).toBe('pausa')

        const spenta = talosMemoryRowActions({ status: 'disabled', kind: 'preference' }, ETICHETTE)
        expect(spenta.find((voce) => voce.id === 'toggle')?.label).toBe('attiva')

        // E una proposta da rivedere si ACCENDE, non si mette in pausa.
        const proposta = talosMemoryRowActions({ status: 'active', kind: 'rejected' }, ETICHETTE)
        expect(proposta.find((voce) => voce.id === 'toggle')?.label).toBe('attiva')
    })

    it('stacca «Elimina» e gli dà un nome che dice cosa si elimina', () => {
        const voci = talosMemoryRowActions({ status: 'active', kind: 'preference' }, ETICHETTE)
        const elimina = voci.find((voce) => voce.id === 'delete')

        expect(elimina?.danger).toBe(true)
        expect(elimina?.ariaLabel).toBe('elimina X')
        // Il colore non è mai l'unico segnale: le altre voci NON sono danger.
        expect(voci.filter((voce) => voce.danger).length).toBe(1)
    })
})
