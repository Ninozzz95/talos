import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import {
    FONTI_DI_CHAT_R4,
    FORNITORI_DEL_CODICE_R4,
    fornitoreDelModelloR4,
    messaggioErroreModelloR4,
    dimenticaAccessoChatgptR4,
    livelloDelRagionamentoR4,
    modelloR4DelProfilo,
    profiloDelModelloR4,
    ragionamentoR4,
    sincronizzaFornitoreR4,
    spingiAccessoChatgptR4,
    MINIMO_ACCESSO_CHATGPT_R4_MS,
} from '@/lib/harness/r4/modelloR4'

/**
 * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`; owner 16/10 «Profili dell'app, chiave unica»). Il golden della
 * corrispondenza viene dalla funzione VERA di r4 al pin (`separaFonteModello`, `modelloRichiestaValido`); le risposte delle rotte
 * dalla registrazione sul Pad (`modello-2161afb32.json`, chiave finta di DeepSeek poi tolta).
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const fonti = JSON.parse(readFileSync(resolve(FIXTURE, 'modello-fonti-701c6c0d2.json'), 'utf8')) as { voci: { provider: string; model: string; id: string; valido: boolean; fonte: string; modelloRemoto: string }[] }
const vere = JSON.parse(readFileSync(resolve(FIXTURE, 'modello-2161afb32.json'), 'utf8'))

const profilo = (provider: string, model: string, altro: Partial<TalosMobileModelProfileView> = {}): TalosMobileModelProfileView => ({
    id: `${provider}:${model}`, provider: provider as TalosMobileModelProfileView['provider'], model, display_name: model, status: 'untested',
    has_secret: true, effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: null, ...altro,
})

type Richiesta = { metodo: string; percorso: string; corpo?: string }
function cliente(fornitore: Record<string, unknown>, rispondi: (r: Richiesta) => { stato: number; corpo: string } | null = () => null) {
    const richieste: Richiesta[] = []
    const ponte = {
        richiesta: async (r: Richiesta) => {
            richieste.push(r)
            const scelta = rispondi(r)
            if (scelta) return scelta
            if (r.metodo === 'GET' && r.percorso === '/api/v1/providers') return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [fornitore] } }) }
            if (r.percorso.endsWith('/key')) return { stato: 200, corpo: JSON.stringify(vere.chiave.d) }
            if (r.percorso.endsWith('/key/remove')) return { stato: 200, corpo: JSON.stringify(vere.togliChiave.d) }
            if (r.percorso.endsWith('/runtime/reset')) return { stato: 200, corpo: JSON.stringify(vere.indirizzoReset.d) }
            if (r.percorso.endsWith('/runtime')) return { stato: 200, corpo: JSON.stringify(vere.indirizzo.d) }
            return { stato: 404, corpo: '{}' }
        },
    } as unknown as TalosR4ClientePonte
    return { ponte, richieste, scritte: () => richieste.filter((r) => r.metodo === 'POST') }
}

describe('il modello del Codice su r4 (K3-C Scelta del modello)', () => {
    it('MOD-01 il profilo dell\'app diventa l\'id che r4 riconosce per lo stesso fornitore e lo stesso modello (golden del pin)', () => {
        for (const voce of fonti.voci) {
            const id = modelloR4DelProfilo(profilo(voce.provider, voce.model))
            expect(id).toBe(voce.id)
            expect([voce.valido, voce.fonte, voce.modelloRemoto]).toEqual([true, voce.provider, voce.model])
        }
        // fuori dal Codice: il motore dentro l'app (r4 non lo raggiunge, fase «Codice col motore locale»)
        expect(modelloR4DelProfilo(profilo('local', 'gemma.gguf'))).toBeNull()
        // ⛔ CHATGPT NEL CODICE (owner 18/10: «Deve selezionarli esattamente come i modelli della chat»): il piano è nel Codice, con l'id
        // che r4 riconosce (`chatgpt:<modello>`, lo stesso della prova vera K4-C sul Pad: `chatgpt:gpt-6.1-sol`)
        expect(modelloR4DelProfilo(profilo('chatgpt', 'gpt-6.1-sol'))).toBe('chatgpt:gpt-6.1-sol')
        expect(fornitoreDelModelloR4('chatgpt:gpt-6.1-sol')).toBe('chatgpt')
        expect([...FORNITORI_DEL_CODICE_R4].sort()).toEqual(['anthropic', 'chatgpt', 'deepseek', 'gemini', 'ollama', 'openai', 'openrouter'])
    })

    /*
     * ⛔ CHATGPT NEL CODICE — un solo custode (ledger `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`, contratto col Desktop del 18/10): l'app
     * spinge a r4 il token e la sua scadenza (`POST /api/v1/providers/chatgpt/access`), NIENT'ALTRO (r4 rifiuta ogni altro campo, email
     * compresa); senza collegamento nella chat r4 lo dimentica (`…/access/remove`). Mai il token in un messaggio d'errore.
     */
    it('MOD-08 la spinta dell\'accesso del piano: solo token e scadenza; senza collegamento si toglie; un rifiuto non porta il token', async () => {
        const c = cliente({}, (r) => (r.percorso.startsWith('/api/v1/providers/chatgpt/access') ? { stato: 200, corpo: JSON.stringify({ ok: true, data: {} }) } : null))
        await spingiAccessoChatgptR4(c.ponte, { accessToken: 'TOKEN-SEGRETO', scadeAlle: 1_800_000_600_000 })
        expect(c.scritte()).toEqual([{ metodo: 'POST', percorso: '/api/v1/providers/chatgpt/access', corpo: JSON.stringify({ accessToken: 'TOKEN-SEGRETO', scadeAlle: 1_800_000_600_000 }) }])
        await spingiAccessoChatgptR4(c.ponte, null)
        expect(c.scritte().at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/providers/chatgpt/access/remove', corpo: '{}' })
        const rifiuta = cliente({}, () => ({ stato: 409, corpo: JSON.stringify({ ok: false, error: { code: 'CHATGPT_CUSTODE_NON_APP', message: 'Operation failed' } }) }))
        let preso: unknown = null
        try { await spingiAccessoChatgptR4(rifiuta.ponte, { accessToken: 'TOKEN-SEGRETO', scadeAlle: 1 }) } catch (e) { preso = e }
        expect((preso as { code?: string }).code).toBe('CHATGPT_CUSTODE_NON_APP')
        expect(String((preso as Error).message)).not.toContain('TOKEN-SEGRETO')
        expect(MINIMO_ACCESSO_CHATGPT_R4_MS).toBe(10 * 60 * 1000)
    })

    it('MOD-02 dal modello della sessione al profilo; un modello che l\'app non ha diventa un profilo col nome di r4', () => {
        const profili = fonti.voci.map((v) => profilo(v.provider, v.model, { display_name: `Nome ${v.model}` }))
        for (const voce of fonti.voci) expect(profiloDelModelloR4(voce.id, profili)?.id).toBe(`${voce.provider}:${voce.model}`)
        const ignoto = profiloDelModelloR4('lmstudio:finto', profili)!
        expect([ignoto.id, ignoto.display_name, ignoto.model]).toEqual(['r4:lmstudio:finto', 'lmstudio:finto', 'lmstudio:finto'])
        expect(profiloDelModelloR4(null, profili)).toBeNull()
    })

    it('MOD-03 il ragionamento: «off» della chat è «none» per r4, e torna «off»; gli altri livelli passano come sono', () => {
        expect(ragionamentoR4('off')).toEqual({ effort: 'none' })
        for (const livello of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
            expect(ragionamentoR4(livello)).toEqual({ effort: livello })
            expect(livelloDelRagionamentoR4({ effort: livello })).toBe(livello)
        }
        expect(livelloDelRagionamentoR4(vere.sessioneSoloRagionamento.reasoning)).toBe('off')
        expect(livelloDelRagionamentoR4(null)).toBe('off')
        expect(livelloDelRagionamentoR4(vere.sessioneDopo.reasoning)).toBe('high')
    })

    it('MOD-04 la chiave dell\'app passa in r4 (`POST key {key}`); senza la chiave nell\'app la copia di r4 «custodia» si toglie', async () => {
        const a = cliente(vere.prima)
        await sincronizzaFornitoreR4(a.ponte, 'deepseek', { chiave: 'sk-dell-app', indirizzo: null })
        expect(a.scritte()).toEqual([{ metodo: 'POST', percorso: '/api/v1/providers/deepseek/key', corpo: '{"key":"sk-dell-app"}' }])
        const b = cliente(vere.dopoChiave)
        await sincronizzaFornitoreR4(b.ponte, 'deepseek', { chiave: null, indirizzo: null })
        expect(b.scritte()).toEqual([{ metodo: 'POST', percorso: '/api/v1/providers/deepseek/key/remove', corpo: '{}' }])
        // niente nell'app e niente in r4: nessuna scrittura
        const c = cliente(vere.dopoTogli)
        await sincronizzaFornitoreR4(c.ponte, 'deepseek', { chiave: null, indirizzo: null })
        expect(c.scritte()).toEqual([])
        // Ollama non ha chiave: non si scrive né si toglie
        const d = cliente({ ...vere.prima, id: 'ollama', requiresKey: false })
        await sincronizzaFornitoreR4(d.ponte, 'ollama', { chiave: null, indirizzo: null })
        expect(d.scritte()).toEqual([])
    })

    it('MOD-05 l\'indirizzo dell\'app va in r4 se è diverso; senza indirizzo nell\'app, uno personalizzato in r4 torna al predefinito; un rifiuto si dice', async () => {
        const a = cliente(vere.dopoChiave)
        await sincronizzaFornitoreR4(a.ponte, 'deepseek', { chiave: 'k', indirizzo: 'https://api.deepseek.com/v1' })
        expect(a.scritte().map((r) => [r.percorso, r.corpo])).toEqual([
            ['/api/v1/providers/deepseek/key', '{"key":"k"}'],
            ['/api/v1/providers/deepseek/runtime', '{"endpoint":"https://api.deepseek.com/v1"}'],
        ])
        const b = cliente(vere.dopoIndirizzo)
        await sincronizzaFornitoreR4(b.ponte, 'deepseek', { chiave: 'k', indirizzo: 'https://api.deepseek.com/v1' })
        expect(b.scritte().map((r) => r.percorso)).toEqual(['/api/v1/providers/deepseek/key']) // uguale: non si riscrive
        const c = cliente(vere.dopoIndirizzo)
        await sincronizzaFornitoreR4(c.ponte, 'deepseek', { chiave: 'k', indirizzo: null })
        expect(c.scritte().map((r) => [r.percorso, r.corpo])).toEqual([['/api/v1/providers/deepseek/key', '{"key":"k"}'], ['/api/v1/providers/deepseek/runtime/reset', '{}']])
        const d = cliente(vere.prima, (r) => (r.percorso.endsWith('/key') ? { stato: 400, corpo: JSON.stringify({ ok: false, error: { code: 'QUERY_INVALID', message: 'Invalid body' } }) } : null))
        await expect(sincronizzaFornitoreR4(d.ponte, 'deepseek', { chiave: 'k', indirizzo: null })).rejects.toMatchObject({ code: 'QUERY_INVALID' })
        // un fornitore che il Codice non porta: nessuna richiesta
        const e = cliente(vere.prima)
        await sincronizzaFornitoreR4(e.ponte, 'local', { chiave: 'k', indirizzo: null })
        expect(e.richieste).toEqual([])
    })

    it('MOD-06 il fornitore del modello della sessione, come lo legge r4 (golden del pin): `lmstudio:finto` non è OpenRouter', () => {
        const golden = fonti as unknown as { fontiDiChat: string[]; fornitoreDi: Record<string, string> }
        expect([...FONTI_DI_CHAT_R4]).toEqual(golden.fontiDiChat)
        for (const [id, fonte] of Object.entries(golden.fornitoreDi)) expect(fornitoreDelModelloR4(id)).toBe(fonte)
        expect(fornitoreDelModelloR4(null)).toBeNull()
    })

    it('MOD-07 i rifiuti con le parole del desktop: la chiave che manca col nome del fornitore, il modello e il livello; il resto come lo dice r4', () => {
        const senzaChiave = { code: vere.invioSenzaChiave.d.error.code, message: vere.invioSenzaChiave.d.error.message, reason: vere.invioSenzaChiave.d.error.reason, params: vere.invioSenzaChiave.d.error.params }
        expect(messaggioErroreModelloR4(senzaChiave, 'it')).toBe('Manca la chiave di DeepSeek: collegala dalle impostazioni dei fornitori.')
        expect(messaggioErroreModelloR4(senzaChiave, 'en-GB')).toBe('The DeepSeek key is missing: connect it from the provider settings.')
        expect(messaggioErroreModelloR4({ ...senzaChiave, reason: 'provider-key-missing', params: undefined }, 'it')).toBe('Manca la chiave: collegala dalle impostazioni dei fornitori.')
        expect(messaggioErroreModelloR4({ code: 'MODEL_ID_INVALID', message: vere.modelloStorto.d.error.message }, 'it'))
            .toBe('Il modello scelto ha un nome che questo server non riconosce: sceglilo di nuovo dalla pillola del modello')
        expect(messaggioErroreModelloR4({ code: 'REASONING_INVALID', message: vere.ragionamentoStorto.d.error.message }, 'en')).toBe(vere.ragionamentoStorto.d.error.message)
        expect(messaggioErroreModelloR4({ code: 'NOT_FOUND', message: 'Resource not found' }, 'it')).toBe('Resource not found')
    })

    it('MOD-09 i codici del piano ChatGPT che manda r4 con le parole del desktop (`errori.js` @ f6c6625ac), nelle due lingue', () => {
        expect(messaggioErroreModelloR4({ code: 'CHATGPT_TOKEN_DA_RINNOVARE', message: 'The ChatGPT access token must be renewed by the app.' }, 'it'))
            .toBe('L’accesso a ChatGPT va rinnovato dall’app: riprova')
        expect(messaggioErroreModelloR4({ code: 'CHATGPT_CUSTODE_NON_APP', message: 'x' }, 'en')).not.toBe('x')
        expect(messaggioErroreModelloR4({ code: 'CHATGPT_SCONOSCIUTO', message: 'x' }, 'it')).toBe('x')
    })

    it('MOD-10 uscendo dalla chat r4 dimentica l’accesso del piano, ma solo se è già acceso: non si accende per questo', async () => {
        const richieste: string[] = []
        const cliente = () => ({ richiesta: async (r: { percorso: string; corpo?: string }) => { richieste.push(`${r.percorso} ${r.corpo}`); return { stato: 200, corpo: '{"ok":true,"data":{"dimenticato":true}}' } } })
        await dimenticaAccessoChatgptR4(async () => false, cliente as never)
        expect(richieste).toEqual([])
        await dimenticaAccessoChatgptR4(async () => true, cliente as never)
        expect(richieste).toEqual(['/api/v1/providers/chatgpt/access/remove {}'])
    })
})
