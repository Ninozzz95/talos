import { describe, expect, it } from 'vitest'
import { talosRispostaVuotaDopoStrumenti, talosStrumentiPartiti } from '@/lib/chat/rispostaVuota'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

/**
 * ⛔ MISURATO sul Pad il 2026-08-09, motore locale Qwen3-1.7B, «elenca le
 * notifiche»: scheda di consenso mostrata, tool partito, richiesta gestita — e
 * il messaggio finale con ZERO caratteri. Con Claude Sonnet 5 la stessa
 * richiesta produce l'elenco.
 */
describe('la bolla vuota dopo che gli strumenti sono partiti', () => {
    /*
     * ⛔ ART-L-10 (Pad, vc151, 23/10): il blocco html tagliato al tetto lascia il testo vuoto e mette già la riga onesta
     * «Un'azione si è interrotta…». Dire IN PIÙ «gli strumenti sono partiti, ma il modello non ha scritto nessuna
     * risposta» sotto quella riga è doppio e fuorviante: il fatto è già detto.
     */
    it('ART-L-10 quando il fatto è già detto (chiamata interrotta), niente bolla vuota', () => {
        expect(talosRispostaVuotaDopoStrumenti('', 1, true)).toBe(false)
        expect(talosRispostaVuotaDopoStrumenti('', 1, false)).toBe(true)
    })

    it('il caso del Pad: nessun testo e uno strumento eseguito', () => {
        expect(talosRispostaVuotaDopoStrumenti('', 1)).toBe(true)
    })

    it('anche di soli a capo: per chi guarda e vuota lo stesso', () => {
        // E' cio' che un modello piccolo produce quando si ferma dopo il blocco
        // della chiamata: non stringa vuota, ma spazi e ritorni a capo.
        expect(talosRispostaVuotaDopoStrumenti('\n\n   \n', 2)).toBe(true)
    })

    it('⛔ NON scatta quando una risposta c e', () => {
        // Altrimenti si sostituirebbe una risposta vera con un avviso.
        expect(talosRispostaVuotaDopoStrumenti('Ecco le notifiche: 1. WhatsApp', 1)).toBe(false)
    })

    it('⛔ NON scatta quando nessuno strumento e partito', () => {
        // Un turno senza tool che torna vuoto e' un altro problema, e questo
        // avviso direbbe una cosa falsa: che qualcosa e' stato fatto.
        expect(talosRispostaVuotaDopoStrumenti('', 0)).toBe(false)
        expect(talosRispostaVuotaDopoStrumenti('   ', 0)).toBe(false)
    })

    it('⛔ IL CASO DEL PAD: cinque chiamate uguali NON sono cinque strumenti', () => {
        // MISURATO il 2026-08-09: alla prima versione l'avviso diceva «(5)».
        // Il modello locale aveva chiesto `notification_list` cinque volte; la
        // rete anti-ripetizione ne ha eseguita UNA e alle altre ha risposto
        // «già fatto, non l'ho rifatto» — ma tutte e cinque restano in
        // `executed`. Un avviso che nasce per non far credere cose false non
        // può cominciare con un numero gonfiato.
        const cinqueVolteLoStesso = Array.from({ length: 5 }, () => ({
            call: { name: 'notification_list' },
        }))
        expect(talosStrumentiPartiti(cinqueVolteLoStesso)).toBe(1)
    })

    it('⛔ N13-STR-01 (Pad, 11/10): cinque ricerche con domande DIVERSE sono cinque, non «(1)»', () => {
        // MISURATO sul Pad l'11/10/2026 con LFM2.5: cinque `web_search` vere,
        // ognuna con la sua domanda, e l'avviso diceva «Gli strumenti sono
        // partiti (1)». La rete anti-ripetizione salta solo le chiamate con gli
        // STESSI argomenti: sono quelle, e solo quelle, da non contare.
        const cinqueRicerche = ['meteo Roma', 'meteo Milano', 'treni', 'cinema', 'farmacie'].map((q) => ({
            call: { name: 'web_search', arguments: JSON.stringify({ query: q }) },
        }))
        expect(talosStrumentiPartiti(cinqueRicerche)).toBe(5)
    })

    it('N13-STR-02: la stessa chiamata scritta con spazi o chiavi in altro ordine resta UNA', () => {
        // È la stessa chiave della rete anti-ripetizione: se il ciclo la tratta
        // come un doppione e non la riesegue, qui non si conta due volte.
        expect(talosStrumentiPartiti([
            { call: { name: 'device_torch', arguments: '{"on":true,"level":2}' } },
            { call: { name: 'device_torch', arguments: '{ "level" : 2, "on" : true }' } },
        ])).toBe(1)
    })

    it('conta gli strumenti DIVERSI, non le chiamate', () => {
        expect(talosStrumentiPartiti([
            { call: { name: 'notification_list' } },
            { call: { name: 'device_torch' } },
            { call: { name: 'notification_list' } },
        ])).toBe(2)
        expect(talosStrumentiPartiti([])).toBe(0)
    })

    it('il ripiego dice QUANTI strumenti, e non riassume i risultati', () => {
        // ⛔ La frase deve affermare solo cio' che sappiamo per certo. Se un
        // domani qualcuno ci mettesse dentro l'esito, questa riga si accorge
        // che il segnaposto del conteggio e' sparito.
        for (const dizionario of [TALOS_IT_MESSAGES, TALOS_EN_MESSAGES]) {
            const frase = (dizionario as { chat: Record<string, string> }).chat.emptyAnswerAfterTools
            expect(frase).toBeTypeOf('string')
            expect(frase).toContain('{count}')
        }
    })
})
