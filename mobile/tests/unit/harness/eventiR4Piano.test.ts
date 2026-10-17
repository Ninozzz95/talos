import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicaEventoR4, conversazioneDaEventi, creaConversazioneR4, leggiFlussoSse, type ConversazioneR4 } from '@/lib/harness/r4/eventiR4'
import { TALOS_METADATA_PIANO, type VocePianoR4 } from '@/lib/harness/r4/pianoChiave'

/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`): gli eventi `talos.plan` e `talos.impostazioni-sessione` di un flusso VERO di r4
 * @ 701c6c0d2 col fornitore finto (`registra-golden-r4.mjs … piano`): correzione sulla revisione 1, sì «chiedendo conferma» sulla 2,
 * `request_plan_mode`, una proposta chiusa dallo Stop (rev. 3), «conversazione pulita» sulla 4. Una carta per `planId`, aggiornata sul
 * posto (`legacy/app.js:21110-21140`); la ricevuta solo sulla carta della stessa revisione e richiesta (`applicaDecisionePiano`).
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const vivo = readFileSync(resolve(FIXTURE, 'r4-701c6c0d2-piano-vivo.sse'), 'utf8')
const rigiocata = readFileSync(resolve(FIXTURE, 'r4-701c6c0d2-piano-rigiocata.sse'), 'utf8')
const dati = (testo: string) => leggiFlussoSse(testo).map((e) => (e.id === null ? e.dati : { ...e.dati, _sequenza: e.id }))
const eventiVivi = dati(vivo)
const sessioneId = String((eventiVivi.find((e) => e.name === 'talos.plan')?.value as { sessionId: string }).sessionId)
const opzioni = { sessioneId }
const carte = (c: ConversazioneR4) => c.messaggi.filter((m) => m.metadata[TALOS_METADATA_PIANO])
const voce = (c: ConversazioneR4) => carte(c)[0]?.metadata[TALOS_METADATA_PIANO] as VocePianoR4 | undefined
/** La conversazione fino all'evento `indice` compreso. */
const finoA = (eventi: Record<string, unknown>[], quando: (e: Record<string, unknown>) => boolean, n = 1) => {
    let visti = 0
    const fine = eventi.findIndex((e) => quando(e) && ++visti === n)
    return conversazioneDaEventi(eventi.slice(0, fine + 1), opzioni)
}
const piano = (status: string, revision?: number) => (e: Record<string, unknown>) => e.name === 'talos.plan'
    && (e.value as { status: string }).status === status && (revision === undefined || (e.value as { revision: number }).revision === revision)

describe('il piano nella conversazione del Codice su r4 @ 701c6c0d2', () => {
    it('EVP-01 una carta sola per il piano, al posto della prima proposta: alla fine rev. 4, approvata in una conversazione pulita', () => {
        const c = conversazioneDaEventi(eventiVivi, opzioni)
        expect(carte(c)).toHaveLength(1)
        const v = voce(c)!
        expect(v.proposta).toMatchObject({ revision: 4, status: 'proposed' })
        expect(v.esito).toMatchObject({ status: 'approved', decisione: 'conversazione-pulita', revision: 4 })
        expect(typeof v.esito!.nuovaSessionId).toBe('string')
        // la carta sta dove è nata: dopo la bolla «Prepara un piano per slugify», prima di quella del giro seguente
        const ordine = c.messaggi.map((m) => (m.metadata[TALOS_METADATA_PIANO] ? 'piano' : m.role === 'user' ? `utente:${m.content}` : m.role))
        expect(ordine.indexOf('piano')).toBeGreaterThan(ordine.indexOf('utente:Prepara un piano per slugify'))
        expect(ordine.indexOf('piano')).toBeLessThan(ordine.indexOf('utente:Pianifica prima di toccare il codice'))
    })

    it('EVP-02 la correzione chiude la rev. 1, la rev. 2 la riapre proposta, il sì la chiude approvata', () => {
        expect(voce(finoA(eventiVivi, piano('proposed', 1)))).toMatchObject({ proposta: { revision: 1 }, esito: null })
        expect(voce(finoA(eventiVivi, piano('changes-requested', 1)))!.esito).toMatchObject({ status: 'changes-requested', feedback: 'Aggiungi i test prima di scrivere il file' })
        const riaperta = voce(finoA(eventiVivi, piano('proposed', 2)))!
        expect(riaperta.proposta.revision).toBe(2)
        expect(riaperta.esito).toBeNull()
        expect(voce(finoA(eventiVivi, piano('approved', 2)))!.esito).toMatchObject({ status: 'approved', decisione: 'procedi-con-conferma' })
        expect(voce(finoA(eventiVivi, piano('cancelled', 3)))!.esito).toMatchObject({ status: 'cancelled', motivo: 'fermato' })
    })

    it('EVP-03 una decisione di un\'altra revisione, o una proposta non più nuova, non toccano la carta', () => {
        const c = finoA(eventiVivi, piano('proposed', 2))
        const decisione = eventiVivi.find(piano('approved', 2))!
        const vecchia = { ...decisione, value: { ...(decisione.value as object), revision: 1 } }
        expect(voce(applicaEventoR4(c, vecchia, opzioni))!.esito).toBeNull()
        const altraRichiesta = { ...decisione, value: { ...(decisione.value as object), requestId: 'altra' } }
        expect(voce(applicaEventoR4(c, altraRichiesta, opzioni))!.esito).toBeNull()
        const rev1 = eventiVivi.find(piano('proposed', 1))!
        expect(voce(applicaEventoR4(c, rev1, opzioni))!.proposta.revision).toBe(2)
        expect(voce(applicaEventoR4(c, eventiVivi.find(piano('proposed', 2))!, opzioni))).toEqual(voce(c))
        // la stessa proposta rimandata dopo il sì (un flusso riaperto che rilegge): la ricevuta resta
        const approvata = finoA(eventiVivi, piano('approved', 2))
        expect(voce(applicaEventoR4(approvata, eventiVivi.find(piano('proposed', 2))!, opzioni))!.esito).toMatchObject({ status: 'approved' })
        // di un'altra sessione: niente carta
        expect(carte(conversazioneDaEventi(eventiVivi, { sessioneId: 'altra' }))).toHaveLength(0)
    })

    it('EVP-04 l\'avviso della revisione si accende solo dal vivo, mai rileggendo la storia', () => {
        const dopoRev2 = finoA(eventiVivi, piano('proposed', 2))
        expect(dopoRev2.storiaFinita).toBe(true)
        expect(dopoRev2.revisioneDalVivo).toMatchObject({ revision: 2, planId: voce(dopoRev2)!.proposta.planId })
        const storia = conversazioneDaEventi(dati(rigiocata), opzioni)
        expect(storia.revisioneDalVivo).toBeUndefined()
        // la prima proposta non è una revisione: niente avviso
        expect(finoA(eventiVivi, piano('proposed', 1)).revisioneDalVivo).toBeUndefined()
    })

    it('EVP-05 il Piano chiesto dal modello vale fino al giro seguente; il sì al piano porta Normale e «Chiede prima»', () => {
        const dopoIlSi = finoA(eventiVivi, (e) => e.name === 'talos.impostazioni-sessione')
        expect(dopoIlSi.impostazioni).toMatchObject({ modalitaOperativa: 'normale', permessi: 'On request', motivo: 'piano-approvato', dalVivo: true })
        expect(dopoIlSi.pianoRichiesto).toBe(false)
        const chiesto = finoA(eventiVivi, (e) => e.name === 'talos.impostazioni-sessione', 2)
        expect(chiesto.impostazioni).toMatchObject({ modalitaOperativa: 'piano', motivo: 'piano-richiesto-dal-modello' })
        expect(chiesto.pianoRichiesto).toBe(true)
        const indice = eventiVivi.findIndex((e) => e.name === 'talos.impostazioni-sessione' && (e.value as { motivo: string }).motivo === 'piano-richiesto-dal-modello')
        const giroDopo = eventiVivi.findIndex((e, i) => i > indice && e.type === 'RunStarted')
        expect(conversazioneDaEventi(eventiVivi.slice(0, giroDopo + 1), opzioni).pianoRichiesto).toBe(false)
        // nella storia le impostazioni non sono «dal vivo»
        expect(conversazioneDaEventi(dati(rigiocata), opzioni).impostazioni?.dalVivo).toBe(false)
    })

    it('EVP-06 vivo e storia rigiocata danno la stessa carta del piano', () => {
        const dalVivo = voce(conversazioneDaEventi(eventiVivi, opzioni))
        const dallaStoria = voce(conversazioneDaEventi(dati(rigiocata), opzioni))
        expect(dallaStoria).toEqual(dalVivo)
    })

    it('EVP-07 un evento storto non rompe niente', () => {
        const c = creaConversazioneR4()
        for (const value of [null, 'x', {}, { schema: 'talos.plan.v1' }]) {
            expect(applicaEventoR4(c, { type: 'CUSTOM', name: 'talos.plan', value }, opzioni)).toEqual(c)
            expect(() => applicaEventoR4(c, { type: 'CUSTOM', name: 'talos.impostazioni-sessione', value }, opzioni)).not.toThrow()
        }
    })
})
