import { describe, expect, it } from 'vitest'
import {
    CODA_TETTO_CARATTERI,
    CODA_TETTO_VOCI,
    CODA_VUOTA,
    accoda,
    azioneVoce,
    decidiInvio,
    metteInPausa,
    modifica,
    normalizzaStatoCoda,
    prossimaDaConsegnare,
    riprende,
    togli,
    type TalosCodaStato,
    type TalosCodaVoce,
} from '@/lib/chat/codaDelGiro'

/**
 * B3 · F1 — la coda dei messaggi scritti mentre un giro è in corso.
 *
 * Owner, sul desktop (11/09 «funziona malissimo», 13/09 «quasi inutilizzabile»):
 * scriveva mentre il modello lavorava, voleva ACCODARE, e partiva un
 * REINDIRIZZAMENTO. Sulla chat nativa del telefono, oggi, il messaggio scritto
 * durante un giro viene scartato in silenzio (`chat.ts:1678`, `return false`).
 *
 * Qui si prova la REGOLA, senza DOM né rete: tetti (LibreChat #14220: 10 voci,
 * 16.000 caratteri), pausa dopo lo Stop (Hermes desktop: «pressing Stop … pauses
 * the queue»), consegna FIFO solo a app libera, e l'invariante del desktop
 * (`legacy/invio-durante-il-giro.js`): nessun Invio produce un reindirizzo.
 */

const ADESSO = '2026-09-24T10:00:00.000Z'

function voce(id: string, testo = `messaggio ${id}`): TalosCodaVoce {
    return { id, testo, creataAlle: ADESSO }
}

function stato(voci: TalosCodaVoce[], inPausa = false): TalosCodaStato {
    return { voci, inPausa }
}

/**
 * Congela in profondità: in un modulo ESM (strict) una scrittura su un oggetto
 * congelato LANCIA, quindi una funzione che muta il suo ingresso fallisce la
 * prova invece di passarla per caso.
 */
function congelato(s: TalosCodaStato): TalosCodaStato {
    s.voci.forEach((v) => Object.freeze(v))
    Object.freeze(s.voci)
    return Object.freeze(s)
}

function riuscito(esito: ReturnType<typeof accoda> | ReturnType<typeof modifica>): TalosCodaStato {
    if (!('stato' in esito)) throw new Error(`atteso uno stato, arrivato il rifiuto «${esito.rifiuto}»`)
    return esito.stato
}

function piena(inPausa = false): TalosCodaStato {
    return stato(Array.from({ length: CODA_TETTO_VOCI }, (_, i) => voce(`v${i}`)), inPausa)
}

const LIBERA = { giroVivoQui: false, altraChatInCorso: false, permessoInAttesa: false }

describe('B3 · la coda del giro (logica pura)', () => {
    it('CODA-01 tetti fissi come LibreChat #14220, e la coda vuota non si può sporcare', () => {
        expect(CODA_TETTO_VOCI).toBe(10)
        expect(CODA_TETTO_CARATTERI).toBe(16_000)
        expect(CODA_VUOTA).toEqual({ voci: [], inPausa: false })
        expect(Object.isFrozen(CODA_VUOTA)).toBe(true)
        expect(Object.isFrozen(CODA_VUOTA.voci)).toBe(true)
    })

    it('CODA-02 accoda aggiunge IN FONDO e non tocca l\'ingresso', () => {
        const prima = congelato(stato([voce('a')]))
        const dopo = riuscito(accoda(prima, 'secondo', { id: 'b', adesso: ADESSO }))
        expect(dopo.voci.map((v) => v.id)).toEqual(['a', 'b'])
        expect(dopo.voci[1]).toEqual({ id: 'b', testo: 'secondo', creataAlle: ADESSO })
        expect(prima.voci).toHaveLength(1)
        // Anche dalla coda vuota condivisa: CODA_VUOTA resta vuota.
        const daVuota = riuscito(accoda(CODA_VUOTA, 'primo', { id: 'x', adesso: ADESSO }))
        expect(daVuota.voci).toHaveLength(1)
        expect(CODA_VUOTA.voci).toHaveLength(0)
    })

    it('CODA-03 ⛔ accodare in una coda IN PAUSA la lascia in pausa (Hermes: parte solo se la invii tu)', () => {
        const inPausa = congelato(stato([voce('a')], true))
        const dopo = riuscito(accoda(inPausa, 'altro', { id: 'b', adesso: ADESSO }))
        expect(dopo.inPausa).toBe(true)
        // E al contrario: accodare non METTE in pausa una coda che non lo era.
        const attiva = riuscito(accoda(stato([voce('a')], false), 'altro', { id: 'b', adesso: ADESSO }))
        expect(attiva.inPausa).toBe(false)
    })

    it('CODA-04 rifiuta il testo vuoto o di soli spazi, e non aggiunge niente', () => {
        for (const testo of ['', '   ', '\n\t  \n']) {
            expect(accoda(CODA_VUOTA, testo, { id: 'a', adesso: ADESSO })).toEqual({ rifiuto: 'vuoto' })
        }
    })

    it('CODA-05 tetto dei caratteri: 16.000 entra, 16.001 no', () => {
        const alLimite = 'x'.repeat(CODA_TETTO_CARATTERI)
        expect(riuscito(accoda(CODA_VUOTA, alLimite, { id: 'a', adesso: ADESSO })).voci[0].testo).toBe(alLimite)
        expect(accoda(CODA_VUOTA, `${alLimite}x`, { id: 'a', adesso: ADESSO })).toEqual({ rifiuto: 'troppo-lungo' })
    })

    it('CODA-06 tetto delle voci: la nona e la decima entrano, l\'undicesima no — nemmeno in pausa', () => {
        let s: TalosCodaStato = CODA_VUOTA
        for (let i = 0; i < CODA_TETTO_VOCI; i += 1) {
            s = riuscito(accoda(s, `m${i}`, { id: `v${i}`, adesso: ADESSO }))
        }
        expect(s.voci).toHaveLength(10)
        expect(accoda(s, 'undicesima', { id: 'v10', adesso: ADESSO })).toEqual({ rifiuto: 'coda-piena' })
        expect(accoda(piena(true), 'undicesima', { id: 'v10', adesso: ADESSO })).toEqual({ rifiuto: 'coda-piena' })
    })

    it('CODA-07 un id doppio o vuoto è un errore di chi chiama, non una voce che poi non si riesce a togliere', () => {
        expect(() => accoda(stato([voce('a')]), 'doppio', { id: 'a', adesso: ADESSO })).toThrow(TypeError)
        expect(() => accoda(CODA_VUOTA, 'senza id', { id: '', adesso: ADESSO })).toThrow(TypeError)
    })

    it('CODA-08 togli toglie solo quella voce; togliere l\'ULTIMA azzera la pausa', () => {
        const s = congelato(stato([voce('a'), voce('b'), voce('c')], true))
        const senzaB = togli(s, 'b')
        expect(senzaB.voci.map((v) => v.id)).toEqual(['a', 'c'])
        expect(senzaB.inPausa).toBe(true)
        const ultima = congelato(stato([voce('a')], true))
        expect(togli(ultima, 'a')).toEqual({ voci: [], inPausa: false })
        // Un id che non c'è: niente cambia.
        expect(togli(s, 'zzz')).toEqual(s)
    })

    it('CODA-09 modifica cambia il testo al suo posto, con gli stessi rifiuti di accoda', () => {
        const s = congelato(stato([voce('a'), voce('b')], true))
        const dopo = riuscito(modifica(s, 'a', 'corretto'))
        expect(dopo.voci).toEqual([{ id: 'a', testo: 'corretto', creataAlle: ADESSO }, voce('b')])
        expect(dopo.inPausa).toBe(true)
        expect(modifica(s, 'a', '   ')).toEqual({ rifiuto: 'vuoto' })
        expect(modifica(s, 'a', 'x'.repeat(CODA_TETTO_CARATTERI + 1))).toEqual({ rifiuto: 'troppo-lungo' })
        expect(riuscito(modifica(s, 'zzz', 'nuovo'))).toEqual(s)
    })

    it('CODA-10 pausa solo se c\'è qualcosa da mettere in pausa; riprende la toglie', () => {
        expect(metteInPausa(CODA_VUOTA).inPausa).toBe(false)
        const s = congelato(stato([voce('a')]))
        const ferma = metteInPausa(s)
        expect(ferma).toEqual({ voci: [voce('a')], inPausa: true })
        expect(s.inPausa).toBe(false)
        expect(riprende(congelato(ferma))).toEqual({ voci: [voce('a')], inPausa: false })
    })

    it('CODA-11 consegna la PRIMA voce (FIFO) solo quando l\'app è libera', () => {
        const s = stato([voce('a'), voce('b')])
        expect(prossimaDaConsegnare(s, LIBERA)).toEqual(voce('a'))
        expect(prossimaDaConsegnare(CODA_VUOTA, LIBERA)).toBeNull()
    })

    it('CODA-12 ⛔ non consegna: in pausa, giro vivo qui, altra chat in corso, permesso in attesa', () => {
        const s = stato([voce('a')])
        expect(prossimaDaConsegnare(stato([voce('a')], true), LIBERA)).toBeNull()
        expect(prossimaDaConsegnare(s, { ...LIBERA, giroVivoQui: true })).toBeNull()
        expect(prossimaDaConsegnare(s, { ...LIBERA, altraChatInCorso: true })).toBeNull()
        expect(prossimaDaConsegnare(s, { ...LIBERA, permessoInAttesa: true })).toBeNull()
        // Griglia completa: consegna in UN solo caso, tutto falso e coda non in pausa.
        for (const inPausa of [false, true]) {
            for (const giroVivoQui of [false, true]) {
                for (const altraChatInCorso of [false, true]) {
                    for (const permessoInAttesa of [false, true]) {
                        const atteso = !inPausa && !giroVivoQui && !altraChatInCorso && !permessoInAttesa
                        const esito = prossimaDaConsegnare(stato([voce('a')], inPausa), {
                            giroVivoQui, altraChatInCorso, permessoInAttesa,
                        })
                        expect(esito === null ? 'niente' : esito.id).toBe(atteso ? 'a' : 'niente')
                    }
                }
            }
        }
    })

    it('CODA-13 ⛔⛔ INVARIANTE: nessun ingresso di decidiInvio produce un reindirizzo', () => {
        const testi = ['', '   ', 'ciao', '!ls', 'x'.repeat(CODA_TETTO_CARATTERI + 5), 'indirizza', '\n']
        const visti = new Set<string>()
        for (const testo of testi) {
            for (const giroVivoQui of [false, true]) {
                for (const altraChatInCorso of [false, true]) {
                    const esito: string = decidiInvio({ testo, giroVivoQui, altraChatInCorso })
                    visti.add(esito)
                    expect(['invia', 'accoda']).toContain(esito)
                    expect(esito).not.toBe('indirizza')
                }
            }
        }
        expect([...visti].sort()).toEqual(['accoda', 'invia'])
        // Anche con ingressi che il tipo non ammette (arrivano da JS o da un evento).
        const storti = [{}, { testo: null }, { testo: 42, giroVivoQui: 'si' }, { testo: 'x', giroVivoQui: 1 }]
        for (const ingresso of storti) {
            expect(['invia', 'accoda']).toContain(decidiInvio(ingresso as never))
        }
    })

    it('CODA-14 decidiInvio: occupato (qui o altrove) con testo ⇒ accoda; libero o campo vuoto ⇒ invia', () => {
        expect(decidiInvio({ testo: 'ciao', giroVivoQui: false, altraChatInCorso: false })).toBe('invia')
        expect(decidiInvio({ testo: 'ciao', giroVivoQui: true, altraChatInCorso: false })).toBe('accoda')
        expect(decidiInvio({ testo: 'ciao', giroVivoQui: false, altraChatInCorso: true })).toBe('accoda')
        expect(decidiInvio({ testo: 'ciao', giroVivoQui: true, altraChatInCorso: true })).toBe('accoda')
        // Campo vuoto: lo scarta chi chiama, non si accoda un niente.
        expect(decidiInvio({ testo: '  ', giroVivoQui: true, altraChatInCorso: false })).toBe('invia')
    })

    it('CODA-15 azioneVoce: con attrezzi indirizza, senza ferma-e-riparte (e lo dice), a giro fermo invia ora', () => {
        expect(azioneVoce({ giroVivoQui: true, conAttrezzi: true })).toBe('indirizza')
        expect(azioneVoce({ giroVivoQui: true, conAttrezzi: false })).toBe('ferma-e-riparti')
        expect(azioneVoce({ giroVivoQui: false, conAttrezzi: true })).toBe('invia-ora')
        expect(azioneVoce({ giroVivoQui: false, conAttrezzi: false })).toBe('invia-ora')
    })

    it('CODA-16 normalizza dal disco: valori non fidati ⇒ mai eccezioni, sempre una coda sicura', () => {
        const storti: unknown[] = [
            undefined, null, 0, 'coda', [], true, { voci: 'no' }, { voci: null, inPausa: true },
            { voci: [null, 1, 'testo nudo', [], {}] }, Object.create(null),
        ]
        for (const valore of storti) {
            expect(() => normalizzaStatoCoda(valore)).not.toThrow()
            expect(normalizzaStatoCoda(valore)).toEqual({ voci: [], inPausa: false })
        }
        // Un getter che lancia (dato preparato apposta) non fa cadere l'avvio.
        const trappola = { get voci(): never { throw new Error('boom') } }
        expect(normalizzaStatoCoda(trappola)).toEqual({ voci: [], inPausa: false })
    })

    it('CODA-17 normalizza scarta le voci cattive una per una e tiene l\'ordine delle buone', () => {
        const valore = {
            inPausa: true,
            voci: [
                { id: 'a', testo: 'buona', creataAlle: ADESSO, extra: 'via' },
                { id: '', testo: 'senza id', creataAlle: ADESSO },
                { id: 7, testo: 'id numerico', creataAlle: ADESSO },
                { id: 'b', testo: '   ', creataAlle: ADESSO },
                { id: 'c', testo: 'x'.repeat(CODA_TETTO_CARATTERI + 1), creataAlle: ADESSO },
                { id: 'd', testo: 'senza data' },
                { id: 'a', testo: 'id doppio', creataAlle: ADESSO },
                { id: 'e', testo: 'seconda buona', creataAlle: ADESSO },
            ],
        }
        const s = normalizzaStatoCoda(valore)
        expect(s.voci).toEqual([voce('a', 'buona'), voce('e', 'seconda buona')])
        expect(s.inPausa).toBe(true)
    })

    it('CODA-18 normalizza: al massimo 10 voci (le prime), pausa solo con voci, e solo se è davvero vera', () => {
        const tante = Array.from({ length: 14 }, (_, i) => voce(`v${i}`))
        const s = normalizzaStatoCoda({ voci: tante, inPausa: true })
        expect(s.voci.map((v) => v.id)).toEqual(tante.slice(0, 10).map((v) => v.id))
        expect(normalizzaStatoCoda({ voci: [], inPausa: true }).inPausa).toBe(false)
        expect(normalizzaStatoCoda({ voci: [voce('a')], inPausa: 'true' }).inPausa).toBe(false)
        expect(normalizzaStatoCoda({ voci: [voce('a')], inPausa: 1 }).inPausa).toBe(false)
        // Il risultato è una copia: modificarlo non tocca il dato letto.
        const letto = { voci: [voce('a')], inPausa: false }
        const copia = normalizzaStatoCoda(letto)
        copia.voci[0].testo = 'cambiato'
        expect(letto.voci[0].testo).toBe('messaggio a')
    })
})
