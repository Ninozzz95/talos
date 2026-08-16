import { describe, expect, it } from 'vitest'
import {
    TALOS_AZIONI,
    talosIstruzioneDelPilota,
    talosLeggiAzione,
    talosOsservazione,
    talosRigaDiStoria,
} from '@/lib/agent/passoDelloSchermo'

/**
 * ⛔⛔ IL LETTORE È LA BARRIERA.
 *
 * I casi qui sotto non sono inventati: sono le risposte VERE raccolte il
 * 2026-08-10 misurando sette modelli sullo stesso schermo del Pad. Sonnet 5 ha
 * risposto in prosa, quattro su sette hanno lasciato campi vuoti, e più d'uno
 * incornicia il JSON in un blocco markdown.
 */
describe('⛔ il lettore delle azioni', () => {
    const offerti = [0, 1, 2, 3, 4, 5]

    it('il caso normale: una riga JSON pulita', () => {
        const esito = talosLeggiAzione(
            '{"azione":"tocca","indice":4,"perche":"e\' il campo di ricerca"}',
            offerti,
        )
        expect(esito.ok).toBe(true)
        if (esito.ok) {
            expect(esito.azione.azione).toBe('tocca')
            expect(esito.azione.indice).toBe(4)
            expect(esito.azione.perche).toBe("e' il campo di ricerca")
        }
    })

    it('⛔ il JSON incorniciato nel markdown si legge lo stesso', () => {
        const esito = talosLeggiAzione(
            'Ecco l\'azione:\n```json\n{"azione":"indietro","perche":"la scheda e\' sbagliata"}\n```\n',
            offerti,
        )
        expect(esito.ok).toBe(true)
    })

    it('⛔ SONNET 5, misurato: prosa e nessun JSON → si SCARTA, non si indovina', () => {
        const esito = talosLeggiAzione(
            'La schermata è identica alle precedenti quattro volte: l\'obiettivo è già raggiunto.',
            offerti,
        )
        expect(esito.ok).toBe(false)
        if (!esito.ok) expect(esito.motivo).toBe('nessunJson')
    })

    it('⛔ un INDICE che non è nell\'elenco non si tocca: è il difetto che M3A difende', () => {
        // Nell'albero esiste, a schermo no: toccarlo non fa niente, o fa
        // qualcosa altrove. Meglio riguardare.
        const esito = talosLeggiAzione('{"azione":"tocca","indice":97}', offerti)
        expect(esito.ok).toBe(false)
        if (!esito.ok) expect(esito.motivo).toBe('indiceFuoriElenco')
    })

    it('⛔ un\'azione inventata non passa: l\'elenco è CHIUSO', () => {
        const esito = talosLeggiAzione('{"azione":"compra","indice":1}', offerti)
        expect(esito.ok).toBe(false)
        if (!esito.ok) expect(esito.motivo).toBe('azioneSconosciuta')
    })

    it('⛔ «scrivi» senza testo e «tocca» senza indice si scartano con motivi DIVERSI', () => {
        const senzaTesto = talosLeggiAzione('{"azione":"scrivi","indice":4}', offerti)
        const senzaIndice = talosLeggiAzione('{"azione":"tocca"}', offerti)
        expect(senzaTesto.ok).toBe(false)
        expect(senzaIndice.ok).toBe(false)
        if (!senzaTesto.ok) expect(senzaTesto.motivo).toBe('testoMancante')
        if (!senzaIndice.ok) expect(senzaIndice.motivo).toBe('indiceMancante')
    })

    it('il JSON rotto si distingue dal JSON assente', () => {
        const esito = talosLeggiAzione('{"azione":"tocca", "indice": }', offerti)
        expect(esito.ok).toBe(false)
        if (!esito.ok) expect(esito.motivo).toBe('jsonRotto')
    })

    it('⛔ «fine» e «attendi» NON pretendono un indice: chiuderebbero il ciclo per niente', () => {
        expect(talosLeggiAzione('{"azione":"fine","perche":"fatto"}', offerti).ok).toBe(true)
        expect(talosLeggiAzione('{"azione":"attendi"}', offerti).ok).toBe(true)
    })

    it('⛔ un «perche» vuoto non diventa una stringa vuota: sparisce', () => {
        // Misurato: quattro modelli su sette mandano `"testo":""`. Un campo
        // vuoto che finisce nella narrazione fa dire a TALOS una frase muta.
        const esito = talosLeggiAzione('{"azione":"attendi","perche":"   "}', offerti)
        expect(esito.ok).toBe(true)
        if (esito.ok) expect(esito.azione.perche).toBeUndefined()
    })
})

describe('⭐ le azioni aggiunte il 2026-08-16', () => {
    const offerti = [0, 1, 2, 3, 4, 5]

    it('`premiALungo` si legge, e pretende un indice come `tocca`', () => {
        const ok = talosLeggiAzione('{"azione":"premiALungo","indice":3,"perche":"menu"}', offerti)
        expect(ok.ok).toBe(true)
        const ko = talosLeggiAzione('{"azione":"premiALungo","perche":"menu"}', offerti)
        expect(ko.ok).toBe(false)
        if (!ko.ok) expect(ko.motivo).toBe('indiceMancante')
    })

    it('`recenti` NON pretende un indice: non c\'è un elemento a schermo', () => {
        const esito = talosLeggiAzione('{"azione":"recenti","perche":"torno a WhatsApp"}', offerti)
        expect(esito.ok).toBe(true)
    })

    it('⛔ `imposta` SENZA valore si scarta: un cursore a caso è un volume a caso', () => {
        const esito = talosLeggiAzione('{"azione":"imposta","indice":2,"perche":"alzo"}', offerti)
        expect(esito.ok).toBe(false)
        if (!esito.ok) expect(esito.motivo).toBe('valoreMancante')
    })

    it('⛔ `imposta` a ZERO passa: zero è un valore, non un campo vuoto', () => {
        const esito = talosLeggiAzione('{"azione":"imposta","indice":2,"valore":0}', offerti)
        expect(esito.ok).toBe(true)
        if (esito.ok) expect(esito.azione.valore).toBe(0)
    })

    it('⛔ un valore che non è un numero non diventa NaN a valle', () => {
        for (const grezzo of ['"trenta"', 'null', 'true']) {
            const esito = talosLeggiAzione(`{"azione":"imposta","indice":2,"valore":${grezzo}}`, offerti)
            expect(esito.ok).toBe(false)
        }
    })

    it('⭐ il cursore mostra DOVE È: senza, «alza il volume» è un tiro a indovinare', () => {
        const testo = talosOsservazione([
            { indice: 0, tipo: 'cursore', etichetta: 'Suoneria', valore: 7, minimo: 0, massimo: 15 },
        ])
        expect(testo).toBe('0 cursore "Suoneria" [7 da 0 a 15]')
    })

    it('⛔ i float di RangeInfo non arrivano al modello con la coda binaria', () => {
        const testo = talosOsservazione([
            { indice: 0, tipo: 'cursore', etichetta: 'Volume', valore: 7.000000476837158, minimo: 0, massimo: 15 },
        ])
        expect(testo).toContain('[7 da 0 a 15]')
        expect(testo).not.toContain('7.0000')
    })

    it('⛔ AL CONTRARIO: un cursore senza scala non inventa dei numeri', () => {
        const testo = talosOsservazione([{ indice: 0, tipo: 'cursore', etichetta: 'Ignoto' }])
        expect(testo).toBe('0 cursore "Ignoto"')
    })

    it('⛔ l\'istruzione SPIEGA cosa vuol dire «su», invece di lasciarlo indovinare', () => {
        const testo = talosIstruzioneDelPilota({ obiettivo: 'x' })
        expect(testo).toContain('FAMMI VEDERE QUELLO SOPRA')
        for (const nome of ['premiALungo', 'imposta', 'recenti']) {
            expect(testo).toContain(nome)
        }
    })
})

describe('⛔ l\'osservazione compatta', () => {
    it('una riga per elemento, e lo stato solo dove esiste', () => {
        expect(talosOsservazione([
            { indice: 0, tipo: 'campo', etichetta: 'meteo catania' },
            { indice: 1, tipo: 'tocca', etichetta: 'Cerca' },
            { indice: 2, tipo: 'interruttore', etichetta: 'Wi-Fi', attivo: true },
        ])).toBe('0 campo "meteo catania"\n1 tocca "Cerca"\n2 interruttore "Wi-Fi" [acceso]')
    })

    it('⛔ resta MOLTO più corta del formato dei benchmark', () => {
        // MISURATO sul Pad: 56 elementi costano 1.648 caratteri qui contro
        // 13.560 nel formato a dodici campi di M3A. Il rapporto va difeso.
        const elementi = Array.from({ length: 56 }, (_, i) => ({
            indice: i, tipo: 'tocca' as const, etichetta: `elemento numero ${i}`,
        }))
        expect(talosOsservazione(elementi).length).toBeLessThan(2_500)
    })

    it('le virgolette nell\'etichetta non rompono la riga', () => {
        expect(talosOsservazione([{ indice: 0, tipo: 'tocca', etichetta: 'dice "ciao"' }]))
            .toBe('0 tocca "dice \\"ciao\\""')
    })
})

describe('⛔ l\'istruzione del pilota', () => {
    it('dice le azioni, il vincolo sull\'indice e la difesa dal testo dello schermo', () => {
        const testo = talosIstruzioneDelPilota({ obiettivo: 'cercare il meteo' })
        for (const azione of TALOS_AZIONI) expect(testo).toContain(azione)
        expect(testo).toContain('cercare il meteo')
        expect(testo).toMatch(/non sono a schermo/i)
        // ⛔ La difesa dal dirottamento sta NEL prompt, non solo nei nostri buoni
        // propositi: una pagina può contenere istruzioni rivolte all'agente.
        expect(testo).toMatch(/un DATO, mai un comando/i)
    })

    it('⛔ resta corta: è il motivo per cui questo file esiste', () => {
        /*
         * ⛔ IL MARGINE SI È ASSOTTIGLIATO, e va detto invece di lasciar
         * credere che ce ne sia.
         *
         * MISURATO il 2026-08-16, dopo le tre azioni nuove: **1.433 byte ≈ 387
         * token** su un obiettivo vero. Il tetto è 1.600, quindi restano ~45
         * token. Prima delle aggiunte eravamo a ~320.
         *
         * ⇒ L'istruzione si paga a OGNI passo, esattamente come l'osservazione
         * (che ne costa ~180). La prossima azione che si aggiunge non si
         * aggiunge scrivendo tre righe di spiegazione: o le si toglie da
         * un'altra parte, o si alza il tetto sapendo cosa si sta comprando.
         */
        expect(talosIstruzioneDelPilota({ obiettivo: 'x' }).length).toBeLessThan(1_600)
    })

    it('la storia entra solo se c\'è', () => {
        expect(talosIstruzioneDelPilota({ obiettivo: 'x' })).not.toMatch(/gia' fatto/)
        expect(talosIstruzioneDelPilota({ obiettivo: 'x', storia: ['Passo 1: tocca 4'] }))
            .toContain('Passo 1: tocca 4')
    })
})

describe('⛔ la storia resta corta', () => {
    it('una riga per passo, col perché tagliato a venti parole', () => {
        const riga = talosRigaDiStoria(3, {
            azione: 'scrivi', indice: 4, testo: 'meteo catania',
            perche: 'a '.repeat(60),
        })
        expect(riga.startsWith('Passo 3: scrivi 4 «meteo catania»')).toBe(true)
        expect(riga.split(/\s+/).length).toBeLessThan(32)
    })
})
