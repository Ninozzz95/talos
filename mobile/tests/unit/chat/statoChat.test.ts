import { describe, expect, it } from 'vitest'
import { statoChat, type TalosStatoChat, type TalosStatoChatIngresso } from '@/lib/chat/statoChat'

/**
 * B3 · F1 — lo stato di una chat nell'elenco, dai fatti che il telefono ha già.
 *
 * Riferimento desktop (sola lettura): `components/session-item.js:69-111`. Lì il
 * difetto del 06/09 fu una PRECEDENZA sbagliata: quattro sessioni dicevano «in
 * corso» ore dopo la morte del processo, perché un campo ne intercettava un
 * altro. Qui la precedenza si prova caso per caso, e sulla griglia intera.
 */

const NESSUNO = { permessoInAttesa: false, inCorso: false, vociInCoda: 0 }

function con(parziale: Partial<TalosStatoChatIngresso>): TalosStatoChatIngresso {
    return { ...NESSUNO, ultimoMessaggio: { ruolo: 'assistant', stato: 'persisted' }, ...parziale }
}

describe('B3 · stato della chat nell\'elenco', () => {
    it('STATO-01 nessun messaggio ⇒ vuota', () => {
        expect(statoChat(con({ ultimoMessaggio: null }))).toBe('vuota')
    })

    it('STATO-02 ultima risposta completa ⇒ conclusa', () => {
        expect(statoChat(con({}))).toBe('conclusa')
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'assistant' } }))).toBe('conclusa')
    })

    it('STATO-03 ⛔ un permesso d\'attrezzo in attesa vince su TUTTO: la chat aspetta te', () => {
        expect(statoChat(con({ permessoInAttesa: true, inCorso: true, vociInCoda: 3 }))).toBe('aspetta-te')
        expect(statoChat(con({ permessoInAttesa: true, ultimoMessaggio: null }))).toBe('aspetta-te')
    })

    it('STATO-04 giro vivo ⇒ in corso, anche con voci in coda e un ultimo messaggio fallito', () => {
        expect(statoChat(con({ inCorso: true, vociInCoda: 2 }))).toBe('in-corso')
        expect(statoChat(con({ inCorso: true, ultimoMessaggio: { ruolo: 'system', stato: 'failed' } }))).toBe('in-corso')
        // Un giro vivo sopra un messaggio utente appena scritto NON è interrotto.
        expect(statoChat(con({ inCorso: true, ultimoMessaggio: { ruolo: 'user', stato: 'persisted' } }))).toBe('in-corso')
    })

    it('STATO-05 voci in coda a giro fermo ⇒ in coda (anche sopra un errore o un\'interruzione)', () => {
        expect(statoChat(con({ vociInCoda: 1 }))).toBe('in-coda')
        expect(statoChat(con({ vociInCoda: 1, ultimoMessaggio: { ruolo: 'system', stato: 'failed' } }))).toBe('in-coda')
        expect(statoChat(con({ vociInCoda: 1, ultimoMessaggio: { ruolo: 'assistant', interrotto: true } }))).toBe('in-coda')
    })

    /*
     * CODA-PAUSA (25/09/2026, owner «in pausa»): dopo lo Stop la coda va in pausa e parte solo se la invii tu; l'elenco
     * diceva «in coda» mentre la chat diceva «1 in pausa». Stesso posto nella precedenza, parola diversa.
     */
    it('STATO-12 voci in coda con la coda in pausa ⇒ in pausa; senza voci la pausa non parla', () => {
        expect(statoChat(con({ vociInCoda: 1, codaInPausa: true }))).toBe('in-pausa')
        expect(statoChat(con({ vociInCoda: 1, codaInPausa: false }))).toBe('in-coda')
        expect(statoChat(con({ vociInCoda: 0, codaInPausa: true }))).toBe('conclusa')
        // Un giro vivo o un permesso vincono anche sulla pausa.
        expect(statoChat(con({ inCorso: true, vociInCoda: 1, codaInPausa: true }))).toBe('in-corso')
        expect(statoChat(con({ permessoInAttesa: true, vociInCoda: 1, codaInPausa: true }))).toBe('aspetta-te')
        // Solo `true` mette in pausa: un dato storto non inventa una pausa.
        expect(statoChat(con({ vociInCoda: 1, codaInPausa: 'si' as never }))).toBe('in-coda')
    })

    it('STATO-06 errore ⇒ fallita: il riquadro d\'errore è un messaggio `system` in stato `failed` (chat.ts:1833, :1930)', () => {
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'system', stato: 'failed' } }))).toBe('fallita')
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'assistant', stato: 'failed' } }))).toBe('fallita')
        // Un avviso di sistema andato a buon fine non è un errore.
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'system', stato: 'persisted' } }))).toBe('conclusa')
    })

    it('STATO-07 risposta fermata a metà ⇒ interrotta (metadata.interrupted, chat.ts:1919)', () => {
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'assistant', stato: 'persisted', interrotto: true } }))).toBe('interrotta')
        // Una risposta rimasta «pending» senza nessun giro vivo: nessuno la sta scrivendo.
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'assistant', stato: 'pending' } }))).toBe('interrotta')
    })

    it('STATO-08 ⛔ l\'ultimo messaggio è della persona e nessun giro è vivo ⇒ interrotta, mai «in corso» per sempre', () => {
        // Il difetto del desktop del 06/09: dopo la morte del processo la riga restava viva.
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'user', stato: 'persisted' } }))).toBe('interrotta')
        // Anche a metà di un giro con attrezzi (ultimo un risultato d'attrezzo, nessuna risposta finale).
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'tool', stato: 'persisted' } }))).toBe('interrotta')
    })

    it('STATO-09 l\'errore vince sull\'interruzione (stesso messaggio con entrambi i segni)', () => {
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'assistant', stato: 'failed', interrotto: true } }))).toBe('fallita')
    })

    it('STATO-10 griglia completa: la precedenza è una sola, e ogni esito è uno dei sette', () => {
        const validi: TalosStatoChat[] = ['aspetta-te', 'in-corso', 'in-coda', 'in-pausa', 'fallita', 'interrotta', 'conclusa', 'vuota']
        const ultimi: TalosStatoChatIngresso['ultimoMessaggio'][] = [
            null,
            { ruolo: 'user', stato: 'persisted' },
            { ruolo: 'assistant', stato: 'persisted' },
            { ruolo: 'assistant', stato: 'persisted', interrotto: true },
            { ruolo: 'system', stato: 'failed' },
            { ruolo: 'tool' },
        ]
        for (const permessoInAttesa of [false, true]) {
            for (const inCorso of [false, true]) {
                for (const vociInCoda of [0, 1, 10]) {
                    for (const codaInPausa of [false, true]) {
                        for (const ultimoMessaggio of ultimi) {
                            const esito = statoChat({ permessoInAttesa, inCorso, vociInCoda, codaInPausa, ultimoMessaggio })
                            expect(validi).toContain(esito)
                            if (permessoInAttesa) expect(esito).toBe('aspetta-te')
                            else if (inCorso) expect(esito).toBe('in-corso')
                            else if (vociInCoda > 0) expect(esito).toBe(codaInPausa ? 'in-pausa' : 'in-coda')
                            else expect(['fallita', 'interrotta', 'conclusa', 'vuota']).toContain(esito)
                        }
                    }
                }
            }
        }
    })

    it('STATO-11 ingressi storti (da JS o dal disco) non lanciano: coda negativa o non numerica non conta', () => {
        expect(statoChat(con({ vociInCoda: -3 }))).toBe('conclusa')
        expect(statoChat(con({ vociInCoda: Number.NaN }))).toBe('conclusa')
        expect(statoChat(con({ vociInCoda: '2' as never }))).toBe('conclusa')
        expect(statoChat(con({ ultimoMessaggio: { ruolo: 'boh' as never } }))).toBe('conclusa')
    })
})
