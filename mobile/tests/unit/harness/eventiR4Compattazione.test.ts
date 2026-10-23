import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicaEventoR4, conRigaVivaAMano, conversazioneDaEventi, creaConversazioneR4, leggiFlussoSse, type ConversazioneR4 } from '@/lib/harness/r4/eventiR4'
import { TALOS_METADATA_COMPATTAZIONE, TALOS_METADATA_COMPATTAZIONE_ANNULLATA, TALOS_METADATA_COMPATTAZIONE_FALLITA } from '@/lib/chat/compattazioneChiavi'

/*
 * Ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md` — D-MO-12: nel Codice gli eventi `talos.compattazione*` di r4 non avevano un lettore,
 * e la riga del ripiego (vista nell'export della sessione lunga del 21/10, `motivo:'ripiego'`) non compariva. Le regole sono quelle
 * del desktop (`legacy/app.js:23752-23810` @ f87c8f800): il riassunto in sottofondo non apre la riga viva; un passo aggiorna solo una
 * riga già aperta; la fine la chiude e lascia il separatore, la riga «non riassunta», o niente («ceduta», contratto §8).
 */
const custom = (name: string, value: unknown, _sequenza?: number) => ({ type: 'CUSTOM', name, value, ...(_sequenza ? { _sequenza } : {}) })
const avvio = { type: 'RunStarted', runId: 'g1', threadId: 's1', timestamp: 1_792_600_000_000 }
const testoDetto = (delta: string) => [{ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' }, { type: 'TextMessageContent', messageId: 'm1', delta }]
const fine = { type: 'RunFinished', runId: 'g1', threadId: 's1', timestamp: 1_792_600_100_000 }
const applica = (eventi: Record<string, unknown>[], c: ConversazioneR4 = creaConversazioneR4()) => eventi.reduce((acc, e) => applicaEventoR4(acc, e), c)
const metadato = (c: ConversazioneR4, chiave: string) => c.messaggi.filter((m) => m.metadata[chiave]).map((m) => m.metadata[chiave])

describe('R4EV-C — la compattazione nel Codice', () => {
    it('R4EV-C01 il riassunto atteso apre la riga viva; i passi la aggiornano e il passo dopo sostituisce quello prima', () => {
        let c = applica([avvio, custom('talos.compattazione', { fase: 'inizio', motivo: 'overflow', tokenPrima: 20_000 })])
        expect(c.rigaViva).toEqual({ tipo: 'inizio', motivo: 'overflow' })
        c = applica([custom('talos.compattazione-progresso', { fase: 'lettura', motivo: 'overflow', letti: 2_000, totale: 10_000, stimaRestanteSec: 40 })], c)
        expect(c.rigaViva).toMatchObject({ tipo: 'progresso', fase: 'lettura', letti: 2_000, totale: 10_000, stimaRestanteSec: 40 })
        c = applica([custom('talos.compattazione-progresso', { fase: 'riassunto', tokenRiassunto: 30 })], c)
        expect(c.rigaViva).toMatchObject({ tipo: 'progresso', fase: 'riassunto', tokenScritti: 30, letti: null, stimaRestanteSec: null })
    })

    it('R4EV-C02 il riassunto in sottofondo non apre la riga viva, e i suoi passi non la riaccendono', () => {
        let c = applica([custom('talos.compattazione', { fase: 'inizio', motivo: 'background' })])
        expect(c.rigaViva ?? null).toBeNull()
        c = applica([custom('talos.compattazione-progresso', { fase: 'lettura', motivo: 'background', letti: 1, totale: 2 })], c)
        expect(c.rigaViva ?? null).toBeNull()
        // un passo effimero senza una riga aperta (arrivato dopo la fine) non ne crea una che nessuno spegne più
        const vuota = applica([custom('talos.compattazione-progresso', { fase: 'lettura', motivo: 'overflow', letti: 1, totale: 2 })])
        expect(vuota.rigaViva ?? null).toBeNull()
    })

    it('R4EV-C03 la fine riuscita senza il modello chiude la riga e lascia il separatore col ripiego, nel punto del giro', () => {
        const c = applica([
            avvio, ...testoDetto('Leggo i file. '),
            custom('talos.compattazione', { fase: 'inizio', motivo: 'overflow' }),
            custom('talos.compattazione', { fase: 'fine', compattato: true, at: '2026-10-21T20:00:00.000Z', tokenPrima: 31_234, tokenDopo: 9_870, ripiego: true, ragione: 'saltato' }),
        ])
        expect(c.rigaViva ?? null).toBeNull()
        expect(metadato(c, TALOS_METADATA_COMPATTAZIONE)).toEqual([{
            record: { at: '2026-10-21T20:00:00.000Z', tokenPrima: 31_234, tokenDopo: 9_870 }, ripiego: true, ragione: 'saltato', annullabile: true,
        }])
        // la parte già detta resta un messaggio a sé, prima del separatore (come le carte)
        const ordine = c.messaggi.map((m) => (m.metadata[TALOS_METADATA_COMPATTAZIONE] ? 'separatore' : m.role))
        expect(ordine.slice(-2)).toEqual(['assistant', 'separatore'])
    })

    it('R4EV-C04 una fine fallita lascia la riga «non riassunta» col motivo; «ceduta» non lascia niente', () => {
        const fallita = applica([avvio, custom('talos.compattazione', { fase: 'inizio', motivo: 'overflow' }),
            custom('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'errore: 503' }, 41)])
        expect(fallita.rigaViva ?? null).toBeNull()
        expect(metadato(fallita, TALOS_METADATA_COMPATTAZIONE_FALLITA)).toEqual([{ motivo: 'errore', dettaglio: '503' }])
        const ceduta = applica([custom('talos.compattazione', { fase: 'inizio', motivo: 'background' }),
            custom('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'ceduta', interrottaIn: 'riassunto' })])
        expect(ceduta.messaggi).toEqual([])
        expect(ceduta.rigaViva ?? null).toBeNull()
    })

    it('R4EV-C05 l\'annullamento lascia la sua riga; lo stesso separatore rigiocato due volte resta uno', () => {
        const record = custom('talos.compattazione', { fase: 'fine', compattato: true, at: 'A1', tokenPrima: 10, tokenDopo: 5 })
        const c = applica([record, record, custom('talos.compattazione', { fase: 'annullata', at: 'A1' })])
        expect(metadato(c, TALOS_METADATA_COMPATTAZIONE)).toHaveLength(1)
        expect(metadato(c, TALOS_METADATA_COMPATTAZIONE_ANNULLATA)).toEqual([{ at: 'A1' }])
        // una compattazione a mano (`annullabile:false`) non offre l'annullo
        const aMano = applica([custom('talos.compattazione', { fase: 'fine', compattato: true, at: 'A2', annullabile: false, motivo: 'manuale' })])
        expect(metadato(aMano, TALOS_METADATA_COMPATTAZIONE)[0]).toMatchObject({ annullabile: false })
    })

    it('R4EV-C06 la fine del giro, o il suo errore, chiude una riga viva rimasta aperta', () => {
        const aperta = applica([avvio, custom('talos.compattazione', { fase: 'inizio', motivo: 'overflow' })])
        expect(applica([fine], aperta).rigaViva ?? null).toBeNull()
        expect(applica([{ type: 'RunError', message: 'boom', code: 'X' }], aperta).rigaViva ?? null).toBeNull()
    })

    it('R4EV-C07 D-MO-12 sull\'evento VERO di r4 (registrazione coda-2161afb32): la fine col ripiego del motore si vede', () => {
        const flusso = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'coda-2161afb32.sse'), 'utf8')
        const eventi = leggiFlussoSse(flusso).map((e) => (e.id === null ? e.dati : { ...e.dati, _sequenza: e.id }))
        const c = conversazioneDaEventi(eventi)
        expect(metadato(c, TALOS_METADATA_COMPATTAZIONE_FALLITA)).toEqual([{ motivo: 'ripiego', dettaglio: null }])
        expect(c.rigaViva ?? null).toBeNull()
    })

    it('R4EV-C08 revisione: la fine del riassunto in sottofondo (senza `giro`) non chiude la riga del riassunto del giro', () => {
        let c = applica([
            custom('talos.compattazione', { fase: 'inizio', motivo: 'background', at: 'B' }),
            avvio,
            custom('talos.compattazione', { fase: 'inizio', motivo: 'soglia', giro: 1 }),
            custom('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'ceduta', interrottaIn: 'riassunto' }),
        ])
        expect(c.rigaViva).toMatchObject({ tipo: 'inizio', motivo: 'soglia' })
        c = applica([custom('talos.compattazione-progresso', { fase: 'lettura', motivo: 'soglia', letti: 1, totale: 4 })], c)
        expect(c.rigaViva).toMatchObject({ tipo: 'progresso', letti: 1 })
        // la fine del giro (con `giro`) la chiude
        c = applica([custom('talos.compattazione', { fase: 'fine', giro: 1, compattato: true, at: 'G', tokenPrima: 10, tokenDopo: 5 })], c)
        expect(c.rigaViva ?? null).toBeNull()
    })

    it('R4EV-C09 revisione: la stessa fine fallita rigiocata non raddoppia la riga', () => {
        const fallita = custom('talos.compattazione', { fase: 'fine', compattato: false, motivo: 'vuoto' }, 77)
        expect(metadato(applica([fallita, fallita]), TALOS_METADATA_COMPATTAZIONE_FALLITA)).toHaveLength(1)
        const senzaSequenza = custom('talos.compattazione', { fase: 'fine', giro: 3, compattato: false, motivo: 'vuoto' })
        expect(metadato(applica([senzaSequenza, senzaSequenza]), TALOS_METADATA_COMPATTAZIONE_FALLITA)).toHaveLength(1)
    })

    it('R4EV-C10 revisione: la compattazione a mano apre la riga da sé (r4 non manda l\'inizio), i passi `manuale` la aggiornano, la chiusura la toglie', () => {
        let c = conRigaVivaAMano(creaConversazioneR4(), true)
        expect(c.rigaViva).toEqual({ tipo: 'inizio', motivo: 'manuale' })
        c = applica([custom('talos.compattazione-progresso', { fase: 'riassunto', motivo: 'manuale', tokenRiassunto: 12 })], c)
        expect(c.rigaViva).toMatchObject({ tipo: 'progresso', tokenScritti: 12 })
        expect(conRigaVivaAMano(c, false).rigaViva ?? null).toBeNull()
        // chiudere a mano non spegne una riga del giro che non è sua
        const delGiro = applica([avvio, custom('talos.compattazione', { fase: 'inizio', motivo: 'overflow', giro: 0 })])
        expect(conRigaVivaAMano(delGiro, false).rigaViva).toMatchObject({ tipo: 'inizio', motivo: 'overflow', giro: 0 })
    })
})
