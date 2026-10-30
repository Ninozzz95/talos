/**
 * ELENCO-CODICE-01..07 — la logica dell'elenco delle sessioni del Codice nella grammatica delle Chat (UI-111, owner 29/10 sera).
 * ⛔ PEZZO VERO: va in `tests/unit/harness/elencoSessioniCodice.test.ts` così com'è (SCHEDA-DI-CONSEGNA.md, voce 1), cambiando solo
 * l'import in `@/lib/harness/elencoSessioniCodice`.
 */
import { describe, expect, it } from 'vitest'
import type { TalosHarnessSessionStatus } from '@/lib/harness/harnessUiSessionStatus'
import { contaSchede, corrisponde, filtraSessioni, statoDellaSessione, vociDove, type StatoDellaSessione } from '@/lib/harness/elencoSessioniCodice'

const s = (o: Partial<TalosHarnessSessionStatus>): TalosHarnessSessionStatus => ({ conclusa: true, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: null, ...o })
const RIGHE = [
    { id: 'a', title: 'Sistema il test del login che fallisce', progetto: 'talos-app', pcId: null, stato: 'concluse' as StatoDellaSessione },
    { id: 'b', title: 'Aggiungi la pagina delle impostazioni', progetto: 'talos-app', pcId: 'pc1', stato: 'da-riprendere' as StatoDellaSessione },
    { id: 'c', title: 'Scrivi il README del progetto', progetto: 'sito', pcId: 'pc1', stato: 'in-corso' as StatoDellaSessione },
]
const statoDi = (r: typeof RIGHE[number]) => r.stato

describe('ELENCO-CODICE la logica dell\'elenco delle sessioni', () => {
    it('ELENCO-CODICE-01 lo stato segue la precedenza di statusBadge (HarnessScreen.vue:292-305)', () => {
        expect(statoDellaSessione(s({ inAttesaApprovazione: true, conclusa: false }), true)).toBe('aspettano-te')
        expect(statoDellaSessione(s({ interrotta: true, conclusa: false }), true)).toBe('interrotte')
        expect(statoDellaSessione(s({ interrotta: true, conclusa: false }), false)).toBe('in-corso')
        expect(statoDellaSessione(s({ conclusa: false }), false)).toBe('in-corso')
        expect(statoDellaSessione(s({ interrotta: true }), false)).toBe('interrotte')
        expect(statoDellaSessione(s({ ultimoEsito: 'errore' }), true)).toBe('da-riprendere')
        expect(statoDellaSessione(s({}), true)).toBe('concluse')
        expect(statoDellaSessione(null, true)).toBe('concluse')
    })

    it('ELENCO-CODICE-02 la ricerca guarda titolo e cartella, senza maiuscole né accenti, tutte le parole', () => {
        expect(corrisponde(RIGHE[0]!, 'LOGIN')).toBe(true)
        expect(corrisponde(RIGHE[2]!, 'sito readme')).toBe(true)
        expect(corrisponde(RIGHE[2]!, 'sito login')).toBe(false)
        expect(corrisponde({ id: 'x', title: 'Città' }, 'citta')).toBe(true)
        expect(corrisponde(RIGHE[0]!, '   ')).toBe(true)
    })

    // owner 29/10 notte («come le Chat», `ChatsScreen.vue:175-181`): i numeri seguono «Dove» del foglio, non la ricerca
    it('ELENCO-CODICE-03 i numeri delle schede contano il posto, non la ricerca', () => {
        expect(contaSchede(RIGHE, { dove: 'tutte' }, statoDi)).toEqual({ 'tutte': 3, 'in-corso': 1, 'aspettano-te': 0, 'concluse': 1, 'da-riprendere': 1, 'interrotte': 0 })
        expect(contaSchede(RIGHE, { dove: 'pc1' }, statoDi).tutte).toBe(2)
        expect(contaSchede(RIGHE, { dove: 'qui' }, statoDi)).toEqual({ 'tutte': 1, 'in-corso': 0, 'aspettano-te': 0, 'concluse': 1, 'da-riprendere': 0, 'interrotte': 0 })
    })

    it('ELENCO-CODICE-04 la scheda filtra, «Tutte» mostra tutto', () => {
        expect(filtraSessioni(RIGHE, { scheda: 'tutte', testo: '', dove: 'tutte' }, statoDi).map((r) => r.id)).toEqual(['a', 'b', 'c'])
        expect(filtraSessioni(RIGHE, { scheda: 'in-corso', testo: '', dove: 'tutte' }, statoDi).map((r) => r.id)).toEqual(['c'])
        expect(filtraSessioni(RIGHE, { scheda: 'aspettano-te', testo: '', dove: 'tutte' }, statoDi)).toEqual([])
    })

    it('ELENCO-CODICE-05 «Dove»: qui = senza PC, un PC = le sue', () => {
        expect(filtraSessioni(RIGHE, { scheda: 'tutte', testo: '', dove: 'qui' }, statoDi).map((r) => r.id)).toEqual(['a'])
        expect(filtraSessioni(RIGHE, { scheda: 'tutte', testo: '', dove: 'pc1' }, statoDi).map((r) => r.id)).toEqual(['b', 'c'])
    })

    it('ELENCO-CODICE-06 le voci di «Dove» coi numeri, un PC una volta sola', () => {
        expect(vociDove(RIGHE, () => 'DESKTOP-LAVORO', { tutte: 'Tutte', qui: 'Qui' })).toEqual([
            { value: 'tutte', label: 'Tutte', count: 3 }, { value: 'qui', label: 'Qui', count: 1 }, { value: 'pc1', label: 'DESKTOP-LAVORO', count: 2 },
        ])
    })

    it('ELENCO-CODICE-07 tutto insieme: scheda, ricerca e posto', () => {
        expect(filtraSessioni(RIGHE, { scheda: 'da-riprendere', testo: 'impostazioni', dove: 'pc1' }, statoDi).map((r) => r.id)).toEqual(['b'])
        expect(filtraSessioni(RIGHE, { scheda: 'da-riprendere', testo: 'impostazioni', dove: 'qui' }, statoDi)).toEqual([])
    })
})
