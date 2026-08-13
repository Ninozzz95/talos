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

    /**
     * ⛔⛔ L'ECCEZIONE AL VETO SU `R4` SI CONTA, e vale UNA sola riga.
     *
     * Owner 2026-08-12: «il consenti sempre si riferiva al controllo del
     * dispositivo, da modalità ASSISTENTE». Decisione sua, presa dopo un mio
     * rifiuto e una sua riconferma — e il perché, col compromesso, sta su
     * `TalosToolSecurity.sempreConsentibile`.
     *
     * ⛔ Il rischio vero non è il tool a cui l'eccezione è stata data: è il
     * **prossimo `R4`** che nasce e se la porta dietro perché qualcuno ha
     * copiato la riga sopra. Questo test è l'unica cosa che sta fra quel copia-
     * incolla e un permesso permanente su un'azione che non si annulla. Se
     * diventa rosso non si aggiorna il numero: si decide, e si scrive perché.
     */
    /*
     * ⛔⛔ L'ELENCO È CHIUSO, e cresce solo con una decisione dell'owner.
     *
     * `sempreConsentibile` toglie una domanda che la grammatica dei permessi
     * farebbe: ogni voce qui dentro è una difesa in meno, e deve essere stata
     * decisa da una persona invece che scivolata dentro con una modifica.
     *
     * Le due voci, e perché sono diverse:
     *
     * - `device_screen_drive` — R4: prende in mano lo schermo. L'eccezione è
     *   dell'owner, 2026-08-13: «voglio che metti quel maledetto pulsante
     *   consenti sempre e ci deve essere anche per il controllo dispositivo.
     *   Non voglio nessuna eccezione. Sarà l'utente a consentirlo».
     * - `app_azione` — R3: apre UNA schermata con i dati già scritti, e non
     *   tocca niente al posto della persona. Rischio più basso, stessa
     *   eccezione, per la stessa ragione: è una cosa che si fa venti volte al
     *   giorno, e chiederla venti volte è un modo per farsi disattivare.
     */
    it('⛔ SOLO DUE possono essere consentiti per sempre, e sappiamo quali', () => {
        const conEccezione = Object.entries(TALOS_TOOL_SECURITY)
            .filter(([, riga]) => (riga as { sempreConsentibile?: true }).sempreConsentibile)
            .map(([id]) => id)

        expect(conEccezione.sort()).toEqual(['app_azione', 'device_screen_drive'])
    })
})
