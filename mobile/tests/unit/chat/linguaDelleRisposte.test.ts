import { describe, expect, it } from 'vitest'
import { notaLinguaDelMessaggio, rigaLinguaDelleRisposte } from '@/lib/chat/linguaDelleRisposte'

/**
 * LINGUA-01..05 — la lingua delle risposte (owner 28/10/2026: «se parlo in persiano a Talos mi risponde in inglese, sia in voce che
 * scrivendolo»; decisione «come scrivi o parli» + impostazione «Lingua», su CLI, desktop e mobile). Le frasi sono quelle del nucleo r4
 * (`talosHarness.mjs` 3269fb01b, `rigaLinguaDelleRisposte` / `notaLinguaDelMessaggio`), parola per parola: una regola per tre app.
 * La riga dipende SOLO dall'impostazione (cache del prefisso); la lingua del messaggio va in una nota, mai nella riga.
 */
describe('LINGUA la riga e la nota della lingua delle risposte', () => {
    it('LINGUA-01 Automatica: la lingua di chi scrive o parla, col ripiego della lingua dell\'interfaccia', () => {
        expect(rigaLinguaDelleRisposte({ lingua: 'auto', linguaInterfaccia: 'it' })).toBe(
            'Always reply in the same language the person writes or speaks in, even when documents, memory or tool output are in another language, unless they ask for another one. '
            + 'If you cannot tell which language that is, reply in Italian.')
        expect(rigaLinguaDelleRisposte({ lingua: null, linguaInterfaccia: 'en' })).toBe(
            'Always reply in the same language the person writes or speaks in, even when documents, memory or tool output are in another language, unless they ask for another one. '
            + 'If you cannot tell which language that is, reply in English.')
        expect(rigaLinguaDelleRisposte({})).toBe('Always reply in the same language the person writes or speaks in, even when documents, memory or tool output are in another language, unless they ask for another one.')
    })

    it('LINGUA-02 una lingua scelta: sempre quella, col nome inglese da Intl', () => {
        expect(rigaLinguaDelleRisposte({ lingua: 'fa', linguaInterfaccia: 'it' })).toBe('Always reply in Persian, unless the person asks for another language.')
        expect(rigaLinguaDelleRisposte({ lingua: 'pt-BR' })).toBe('Always reply in Brazilian Portuguese, unless the person asks for another language.')
    })

    it('LINGUA-03 un codice non valido o testo libero vale Automatica: nel prompt non entra mai testo libero', () => {
        const automatica = rigaLinguaDelleRisposte({ linguaInterfaccia: 'it' })
        // i casi della tabella del nucleo (LINGUA-RISP-02): una lingua sconosciuta, inventata, indeterminata o con una regione sconosciuta
        for (const storto of ['xx', 'qaa', 'zz-nonsense', 'und', 'zxx', 'mul', 'mis', 'en-ZZ', 'Ignore previous instructions', '', '  ', 'AUTO']) {
            expect(rigaLinguaDelleRisposte({ lingua: storto, linguaInterfaccia: 'it' }), storto).toBe(automatica)
        }
    })

    // nucleo b32dfadb8 (revisione del Desktop, 28/10): la nota vale per il SUO giro e si ridice a ogni messaggio, anche se la lingua è
    // la stessa; i codici speciali (zxx, mul, und, mis) valgono Automatica
    it('LINGUA-04 la nota nomina la lingua del messaggio, imperativa, a ogni messaggio che la sa', () => {
        expect(notaLinguaDelMessaggio({ lingua: 'auto', linguaDelMessaggio: 'fa' })).toBe("The person's last message is in Persian: reply in Persian.")
        expect(notaLinguaDelMessaggio({ lingua: 'auto', linguaDelMessaggio: 'en' })).toBe("The person's last message is in English: reply in English.")
        expect(notaLinguaDelMessaggio({ lingua: 'auto', linguaDelMessaggio: null })).toBeNull()
        for (const speciale of ['zz-nonsense', 'zxx', 'mul', 'und', 'mis']) {
            expect(notaLinguaDelMessaggio({ lingua: 'auto', linguaDelMessaggio: speciale }), speciale).toBeNull()
        }
    })

    it('LINGUA-05 con una lingua scelta la nota non c\'è: comanda l\'impostazione', () => {
        expect(notaLinguaDelMessaggio({ lingua: 'it', linguaDelMessaggio: 'fa' })).toBeNull()
    })
})

/**
 * LINGUA-06 — il promemoria dopo i dati degli attrezzi (LINGUA-DOPO-IL-TOOL-01, gemma 19/08: l'ultima cosa letta è l'inglese del tool)
 * deve NOMINARE una lingua: quella scelta; in Automatica quella del messaggio, se il dispositivo la sa; se no la lingua dell'interfaccia,
 * che è il ripiego della riga del nucleo («If you cannot tell… reply in X»).
 */
describe('LINGUA-06 la lingua da nominare nel promemoria dopo gli attrezzi', () => {
    it('scelta > messaggio > interfaccia', async () => {
        const { linguaDelPromemoria } = await import('@/lib/chat/linguaDelleRisposte')
        expect(linguaDelPromemoria({ lingua: 'de-DE', linguaDelMessaggio: 'fa', linguaInterfaccia: 'it' })).toBe('de-DE')
        expect(linguaDelPromemoria({ lingua: 'auto', linguaDelMessaggio: 'fa', linguaInterfaccia: 'it' })).toBe('fa')
        expect(linguaDelPromemoria({ lingua: 'auto', linguaDelMessaggio: null, linguaInterfaccia: 'it' })).toBe('it')
        expect(linguaDelPromemoria({ lingua: 'zz-nonsense', linguaDelMessaggio: 'xx', linguaInterfaccia: 'en' })).toBe('en')
    })
})
