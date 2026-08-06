import { describe, expect, it } from 'vitest'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'
import { TALOS_TOOL_SECURITY } from '@/lib/tools/securityCatalog'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'
import { talosSecurityMatchesActions } from '@/lib/tools/security'

/**
 * Nessun tool senza la sua riga di sicurezza.
 *
 * È lo stesso principio del catalogo dei tool — «nessun tool senza la sua riga»
 * — applicato dove costa di più dimenticarsene. Un tool che nasce senza
 * dichiarare cosa tocca non viene fermato da niente: il predefinito prudente lo
 * salva a runtime, ma nel frattempo la trifecta si calcola su un dato inventato,
 * e chi ha scritto il tool non sa di aver saltato un passo.
 *
 * Questo test non guarda una lista scritta a mano: confronta il catalogo con
 * l'elenco vero degli id. Se domani nasce un tool, questo test diventa rosso il
 * giorno stesso.
 */
describe('ogni tool dichiara la propria sicurezza', () => {
    it('il catalogo copre TUTTI gli id, senza doppioni e senza avanzi', () => {
        const nelCatalogo = TALOS_AGENT_TOOL_CONTROLS.map((c) => c.id)
        expect(new Set(nelCatalogo).size).toBe(nelCatalogo.length)
        expect([...nelCatalogo].sort()).toEqual([...TALOS_AGENT_TOOL_IDS].sort())
    })

    /**
     * I due cataloghi vivono in file diversi perché si pagano in momenti
     * diversi — le Impostazioni all'avvio, la sicurezza solo quando si esegue.
     * Separati devono restare ALLINEATI, o il secondo diventa una lista che
     * qualcuno dimentica di aggiornare.
     */
    it('il catalogo della sicurezza copre gli stessi id, uno per uno', () => {
        expect(Object.keys(TALOS_TOOL_SECURITY).sort()).toEqual([...TALOS_AGENT_TOOL_IDS].sort())
    })

    it('ogni riga porta le quattro dimensioni, e nessuna è lasciata indovinare', () => {
        for (const id of TALOS_AGENT_TOOL_IDS) {
            const controllo = { id }
            const s = TALOS_TOOL_SECURITY[id]
            expect(s, controllo.id).toBeDefined()
            expect(['R0', 'R1', 'R2', 'R3', 'R4'], controllo.id).toContain(s.risk)
            expect(['read-only', 'reversible', 'compensable', 'irreversible'], controllo.id)
                .toContain(s.reversibility)
            for (const bandiera of ['readsPrivateData', 'readsUntrustedContent', 'canTransmit'] as const) {
                expect(typeof s[bandiera], `${controllo.id}.${bandiera}`).toBe('boolean')
            }
        }
    })

    /**
     * Il buco peggiore possibile: un tool che trasmette senza chiedere
     * `outbound`. Un «mai» su «uscire in rete» non lo fermerebbe, e chi ha
     * creduto di chiudere quella porta non avrebbe modo di accorgersene.
     */
    it('chi trasmette chiede outbound, e chi legge soltanto non chiede di scrivere', () => {
        for (const controllo of TALOS_AGENT_TOOL_CONTROLS) {
            const sicurezza = TALOS_TOOL_SECURITY[controllo.id]
            expect(
                talosSecurityMatchesActions(sicurezza, controllo.actions),
                `${controllo.id}: ${JSON.stringify(sicurezza)} contro ${controllo.actions.join('+')}`,
            ).toBe(true)
        }
    })

    /**
     * Una dichiarazione che non corrisponde a niente è peggio di nessuna
     * dichiarazione, perché sembra una risposta. Questi tre casi li conosciamo
     * uno per uno e li teniamo fermi: se qualcuno cambia idea su uno di loro,
     * deve farlo di proposito.
     */
    it('i casi che abbiamo deciso a mano restano quelli', () => {
        const per = (id: string) => TALOS_TOOL_SECURITY[id as keyof typeof TALOS_TOOL_SECURITY]

        // L'unico tool che non tocca niente di nessuno.
        expect(per('time_now')).toEqual({
            risk: 'R0', reversibility: 'read-only',
            readsPrivateData: false, readsUntrustedContent: false, canTransmit: false,
        })

        // Due terzi della trifecta in un tool solo: esce E porta dentro.
        expect(per('web_search').canTransmit).toBe(true)
        expect(per('web_search').readsUntrustedContent).toBe(true)
        expect(per('web_search').readsPrivateData).toBe(false)

        // Cambiare chi può vedere cosa è una modifica di SICUREZZA, non di
        // contenuto: sta un gradino sopra le altre scritture.
        expect(per('library_context_policy_update').risk).toBe('R3')

        // Cancellare non si annulla: non esiste un cestino.
        expect(per('notes_delete').reversibility).toBe('irreversible')
        expect(per('tasks_delete').reversibility).toBe('irreversible')
    })
})
