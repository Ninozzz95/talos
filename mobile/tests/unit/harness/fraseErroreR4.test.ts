import { describe, expect, it } from 'vitest'
import { fraseDelMotivoR4, fraseErroreR4 } from '@/lib/harness/r4/fraseErroreR4'
import { messaggioErroreModelloR4 } from '@/lib/harness/r4/modelloR4'
import { messaggioErroreServerR4 } from '@/lib/harness/r4/pianoR4'
import remoti from '@/lib/harness/r4/testi/errori-remoti-r4.json'
import sessioni from '@/lib/harness/r4/testi/errori-sessioni-r4.json'

/**
 * ⛔ FRASI-UNICHE (censimento «Avvisi ed errori», punto b; Desktop 27/10/2026): una regola sola, `testoErroreServer` del desktop
 * (`components/errori.js:1206` @ r4 79ea996de), per la riga d'errore, i fogli e gli avvisi. Le voci inglesi sono i testi LETTERALI del
 * server: la voce vale solo se il suo inglese coincide col testo del server, i motivi prima del codice; se no resta il testo del server.
 */
describe('FRASI-UNICHE — il rifiuto del PC nella lingua dell’app, con la regola del desktop', () => {
    it('FU-01 il testo del server che coincide con un motivo dice la frase di quel motivo, anche se il motivo manca nella busta', () => {
        const modo = { code: 'SESSION_NOT_READY', message: 'The working mode is changed between turns, not while the model is working' }
        expect(fraseErroreR4(modo, 'it')).toBe('La modalità di lavoro si cambia fra un giro e l’altro, non mentre il modello sta lavorando')
        expect(fraseErroreR4({ ...modo, reason: 'mode-change-while-running' }, 'en')).toBe(modo.message)
    })

    it('FU-02 AL CONTRARIO: un testo del server diverso resta con le sue parole, mai la frase generica del codice', () => {
        const preciso = { code: 'SESSION_NOT_READY', message: 'Wait: the summary of this chat is being written right now (3 s left)' }
        expect(fraseErroreR4(preciso, 'it')).toBe(preciso.message)
        expect(fraseErroreR4(preciso, 'it')).not.toBe('Sessione non pronta per questa azione')
    })

    it('FU-03 i codici del censimento che arrivavano in inglese: SESSION_LEASED, UNKNOWN_OPERATION, i motivi di OPERATION_FAILED', () => {
        expect(fraseErroreR4({ code: 'SESSION_LEASED', message: remoti.en['SESSION_LEASED.message'] }, 'it')).toBe(remoti.it['SESSION_LEASED.message'])
        expect(fraseErroreR4({ code: 'UNKNOWN_OPERATION', message: remoti.en['UNKNOWN_OPERATION.message'] }, 'it')).toBe(remoti.it['UNKNOWN_OPERATION.message'])
        expect(fraseErroreR4({ code: 'OPERATION_FAILED', message: remoti.en['OPERATION_FAILED.timeout'] }, 'it')).toBe(remoti.it['OPERATION_FAILED.timeout'])
    })

    it('FU-04 senza testo del server la frase del codice; senza codice né testo, niente; mai un codice grezzo', () => {
        expect(fraseErroreR4({ code: 'SESSION_LEASED' }, 'it')).toBe(remoti.it['SESSION_LEASED.message'])
        expect(fraseErroreR4({}, 'it')).toBe('')
        expect(fraseErroreR4({ code: 'MAI_VISTO', message: 'Something odd' }, 'it')).toBe('Something odd')
    })

    it('FU-05 ogni voce estratta torna se stessa: l’inglese letterale del server diventa la sua frase italiana', () => {
        for (const tabella of [remoti, sessioni]) {
            for (const [chiave, inglese] of Object.entries(tabella.en)) {
                if (/\{/u.test(inglese)) continue // le voci coi parametri si provano con la busta vera
                if (/\.(title|explanation|action)$/u.test(chiave)) continue // parti della carta, non testi del server
                const [codice] = chiave.split('.')
                expect(fraseErroreR4({ code: codice, message: inglese }, 'it'), chiave).toBe((tabella.it as Record<string, string>)[chiave])
            }
        }
    })

    it('FU-06 la riga d’errore e il foglio del modo dicono la stessa frase (una regola sola)', () => {
        const busta = { code: 'SESSION_LEASED', message: remoti.en['SESSION_LEASED.message'] }
        expect(messaggioErroreModelloR4(busta, 'it')).toBe(remoti.it['SESSION_LEASED.message'])
        expect(messaggioErroreServerR4(busta, 'it')).toBe(remoti.it['SESSION_LEASED.message'])
        const modo = { code: 'SESSION_NOT_READY', message: 'Session not ready for this action' }
        expect(messaggioErroreServerR4(modo, 'it')).toBe('Sessione non pronta per questa azione')
    })

    it('FU-07 la frase del motivo (`fraseDelMotivo`) cerca in tutte le tabelle, e vale solo se `explanation` è il suo inglese', () => {
        const precisa = 'The working mode is changed between turns, not while the model is working'
        const busta = { code: 'SESSION_NOT_READY', message: 'Session not ready for this action', reason: 'mode-change-while-running', explanation: precisa }
        // la voce sta in `errori-sessioni`, non fra i motivi dei file: prima della regola unica qui tornava ''
        expect(fraseDelMotivoR4(busta, 'it')).toBe('La modalità di lavoro si cambia fra un giro e l’altro, non mentre il modello sta lavorando')
        expect(fraseDelMotivoR4(busta, 'en')).toBe(precisa)
        expect(fraseDelMotivoR4({ ...busta, explanation: 'Session not ready for this action' }, 'it')).toBe('')
        expect(fraseDelMotivoR4({ ...busta, reason: undefined }, 'it')).toBe('')
        expect(fraseDelMotivoR4({ ...busta, reason: 'motivo-mai-visto' }, 'it')).toBe('')
    })
})
