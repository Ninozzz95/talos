import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { CHIAVE_COORDINAZIONE_R4 } from '@/lib/harness/r4/coordinazioneR4'

/**
 * ⛔ IMPOSTAZIONI-DAL-VIVO (owner 27/10/2026: «da remoto il dispositivo collegato deve poter istantaneamente e robustamente cambiare
 * tutte le impostazioni e sul pc devono essere visibili subito come modello, ragionamento etc»). Il verso PC → dispositivo, e la
 * regola del dispositivo quando scrive lui (contratto F, r4 `f573cdc93`; la finestra del PC fa lo stesso, `applicaIstantaneaImpostazioni`
 * e `impostazioni-dal-vivo.spec.mjs` IV-01..03): decide la versione; mentre una scrittura propria è in volo si trattiene; la risposta
 * porta la sua fotografia; la riga di `GET /sessions` conta solo se è più nuova di ciò che si è già applicato.
 */
interface Richiesta { metodo: string; percorso: string; corpo?: string }
type Risposta = { stato: number; corpo: string }
type Ascoltatore = (dati: Record<string, unknown>) => void

function clienteFinto(rispondi: (r: Richiesta) => Risposta | Promise<Risposta>) {
    const ascoltatori: Record<string, Ascoltatore[]> = {}
    const flussi: { id: string; percorso: string }[] = []
    const richieste: Richiesta[] = []
    const ponte: TalosR4ClientePonte = {
        richiesta: async (r) => { richieste.push(r); return rispondi(r) },
        apriFlusso: async (f) => { flussi.push(f) },
        chiudiFlusso: async () => {},
        addListener: async (evento, ascoltatore) => {
            ;(ascoltatori[evento] ??= []).push(ascoltatore)
            return { remove: async () => { ascoltatori[evento] = (ascoltatori[evento] ?? []).filter((a) => a !== ascoltatore) } }
        },
    }
    const pezzo = (testo: string) => { for (const a of [...(ascoltatori.r4Pezzo ?? [])]) a({ id: flussi.at(-1)!.id, testo }) }
    return { ponte, flussi, richieste, pezzo }
}
const aspetta = async () => { for (let i = 0; i < 6; i++) { await new Promise((fatto) => setTimeout(fatto, 0)); await nextTick() } }
let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!
const sse = (dati: Record<string, unknown>[]) => dati.map((d) => `data: ${JSON.stringify(d)}\n\n`).join('')

const FOTO = {
    modello: 'chatgpt:gpt-6-luna', modelId: 'gpt-6-luna', provider: 'chatgpt', runtimeId: null, modelloPlanner: null,
    reasoning: { effort: 'high' }, permessi: 'Full access', permessiPerAttrezzo: { [CHIAVE_COORDINAZIONE_R4]: 'sempre' },
    modalitaOperativa: 'piano', fallbackProviders: [], doveGiranoIComandi: null, comandiNellaConversazione: false, nome: 'dal-pc',
}
const evento = (versione: number, cambi: Record<string, unknown> = {}) => ({
    type: 'CUSTOM', name: 'talos.impostazioni-sessione',
    value: { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'impostazioni', origine: { tipo: 'pc' }, istantanea: { ...FOTO, ...cambi, versione } },
})
const FINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata' }
const RIGA = { sessionId: 's1', nome: 'dalla-riga', modello: 'glm-5.3-flash', reasoning: { effort: 'low' }, permessi: 'Workspace write', permessiPerAttrezzo: {}, modalitaOperativa: 'normale' }
const elenco = (riga: Record<string, unknown>) => ({ stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [riga] } }) })

describe('IMPOSTAZIONI-DAL-VIVO — le impostazioni della sessione, nei due versi', () => {
    it('USR4-IDV-01 un cambio fatto sul PC arriva intero: modello, ragionamento, permesso, modo, coordinazione e titolo', async () => {
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions' ? elenco({ ...RIGA, versioneImpostazioni: 100 }) : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        expect(conv.modello.value).toBe('glm-5.3-flash')
        c.pezzo(sse([FINE, evento(200)]))
        await aspetta()
        expect(conv.modello.value).toBe('chatgpt:gpt-6-luna')
        expect(conv.ragionamento.value).toEqual({ effort: 'high' })
        expect(conv.politica.value).toEqual({ permessi: 'Full access', perAttrezzo: { [CHIAVE_COORDINAZIONE_R4]: 'sempre' } })
        expect(conv.modalita.value).toBe('piano')
        expect(conv.coordinazione.value.accesa).toBe(true)
        expect(conv.titolo.value).toBe('dal-pc')
    })

    it('USR4-IDV-02 una fotografia non più nuova non torna indietro: né dalla storia, né da un ripasso', async () => {
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions' ? elenco({ ...RIGA, versioneImpostazioni: 100 }) : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        c.pezzo(sse([evento(50, { modello: 'vecchio' }), FINE]))
        await aspetta()
        expect(conv.modello.value).toBe('glm-5.3-flash')
        c.pezzo(sse([evento(300, { modello: 'nuovo' }), evento(250, { modello: 'ripasso' })]))
        await aspetta()
        expect(conv.modello.value).toBe('nuovo')
    })

    it('USR4-IDV-03 al ricaricamento la storia finisce sull\'ultima versione, anche se la riga dell\'elenco è più vecchia', async () => {
        let rispondiElenco: (r: Risposta) => void = () => {}
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions'
            ? new Promise<Risposta>((fatto) => { rispondiElenco = fatto })
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        void conv.apri()
        await aspetta()
        c.pezzo(sse([evento(400, { modello: 'ultimo', nome: 'ultimo-nome' }), FINE]))
        await aspetta()
        // la riga arriva DOPO la storia e porta una versione più vecchia: non disfa la fotografia
        rispondiElenco(elenco({ ...RIGA, versioneImpostazioni: 100 }))
        await aspetta()
        expect(conv.modello.value).toBe('ultimo')
        expect(conv.titolo.value).toBe('ultimo-nome')
    })

    it('USR4-IDV-04 mentre la scrittura del dispositivo è in volo una fotografia del PC si trattiene; vale la risposta, poi la più nuova', async () => {
        let rispondiSettings: (r: Risposta) => void = () => {}
        const c = clienteFinto((r) => {
            if (r.percorso === '/api/v1/sessions') return elenco({ ...RIGA, versioneImpostazioni: 100 })
            if (r.percorso.endsWith('/settings')) return new Promise<Risposta>((fatto) => { rispondiSettings = fatto })
            return { stato: 200, corpo: '{"ok":true,"data":{}}' }
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        c.pezzo(sse([FINE]))
        const scelta = conv.impostaModello('mio-modello', { effort: 'medium' })
        await aspetta()
        // una fotografia del PC partita prima del cambio del dispositivo arriva mentre la sua scrittura è in volo
        c.pezzo(sse([evento(200, { modello: 'del-pc-prima', reasoning: { effort: 'low' } })]))
        await aspetta()
        expect(conv.modello.value).toBe('glm-5.3-flash')
        rispondiSettings({ stato: 200, corpo: JSON.stringify({ ok: true, data: { updated: true, istantanea: { ...FOTO, modello: 'mio-modello', reasoning: { effort: 'medium' }, versione: 210 } } }) })
        expect(await scelta).toBe(true)
        await aspetta()
        expect(conv.modello.value).toBe('mio-modello')
        expect(conv.ragionamento.value).toEqual({ effort: 'medium' })
        // l'eco del suo stesso cambio (210) non cambia niente; uno dopo sì
        c.pezzo(sse([evento(210, { modello: 'mio-modello', reasoning: { effort: 'medium' } }), evento(220, { modello: 'di-nuovo-dal-pc' })]))
        await aspetta()
        expect(conv.modello.value).toBe('di-nuovo-dal-pc')
    })

    it('USR4-IDV-05 se la fotografia trattenuta è più nuova della risposta, vince lei', async () => {
        let rispondiSettings: (r: Risposta) => void = () => {}
        const c = clienteFinto((r) => {
            if (r.percorso === '/api/v1/sessions') return elenco({ ...RIGA, versioneImpostazioni: 100 })
            if (r.percorso.endsWith('/settings')) return new Promise<Risposta>((fatto) => { rispondiSettings = fatto })
            return { stato: 200, corpo: '{"ok":true,"data":{}}' }
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        c.pezzo(sse([FINE]))
        const scelta = conv.impostaModo('piano')
        await aspetta()
        c.pezzo(sse([evento(500, { modalitaOperativa: 'normale', permessi: 'Read only' })]))
        await aspetta()
        rispondiSettings({ stato: 200, corpo: JSON.stringify({ ok: true, data: { updated: true, istantanea: { ...FOTO, modalitaOperativa: 'piano', versione: 450 } } }) })
        expect((await scelta).ok).toBe(true)
        await aspetta()
        expect(conv.modalita.value).toBe('normale')
        expect(conv.politica.value.permessi).toBe('Read only')
    })

    it('USR4-IDV-06 un PC più vecchio (senza fotografia né versione) resta com\'è oggi', async () => {
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions' ? elenco(RIGA)
            : r.percorso.endsWith('/settings') ? { stato: 200, corpo: '{"ok":true,"data":{"updated":true}}' } : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        expect(await conv.impostaModello('scelto', null)).toBe(true)
        expect(conv.modello.value).toBe('scelto')
        c.pezzo(sse([FINE, { type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'piano', permessi: 'On request', motivo: 'piano-richiesto-dal-modello' } }]))
        await aspetta()
        expect(conv.modalita.value).toBe('piano')
        expect(conv.politica.value.permessi).toBe('On request')
        expect(conv.modello.value).toBe('scelto')
    })
})
