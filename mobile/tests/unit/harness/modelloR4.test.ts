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
    FONTE_LOCALE_OSPITE_R4,
    modelloR4DelProfilo,
    profiloDelModelloR4,
    ragionamentoR4,
    sincronizzaFornitoreR4,
    spingiAccessoChatgptR4,
    MINIMO_ACCESSO_CHATGPT_R4_MS,
    nomeLocaleValidoR4,
    nomeModelloUmanoR4,
    spingiAccessoLocaleR4,
} from '@/lib/harness/r4/modelloR4'

/**
 * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`; owner 16/10 «Profili dell'app, chiave unica»). Il golden della
 * corrispondenza viene dalla funzione VERA di r4 al pin (`separaFonteModello`, `modelloRichiestaValido`); le risposte delle rotte
 * dalla registrazione sul Pad (`modello-2161afb32.json`, chiave finta di DeepSeek poi tolta).
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const fonti = JSON.parse(readFileSync(resolve(FIXTURE, 'modello-fonti-0f3f90f8e.json'), 'utf8')) as { voci: { provider: string; model: string; id: string; valido: boolean; fonte: string; modelloRemoto: string }[] }
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
            // ⛔ CODICE COL MOTORE LOCALE (owner 18/10): il profilo `local` (id = percorso del file) è `locale-ospite:<nome del file>`
            const locale = voce.provider === 'local'
            expect([voce.valido, voce.fonte, voce.modelloRemoto])
                .toEqual([true, locale ? 'locale-ospite' : voce.provider, locale ? voce.model.split('/').pop() : voce.model])
        }
        expect(fonti.voci.some((v) => v.provider === 'local')).toBe(true)
        expect(modelloR4DelProfilo(profilo('local', '/data/user/0/ai.talos.dev/files/models/gemma.gguf'))).toBe('locale-ospite:gemma.gguf')
        expect(fornitoreDelModelloR4('locale-ospite:gemma.gguf')).toBe('locale-ospite')
        // ⛔ CHATGPT NEL CODICE (owner 18/10: «Deve selezionarli esattamente come i modelli della chat»): il piano è nel Codice, con l'id
        // che r4 riconosce (`chatgpt:<modello>`, lo stesso della prova vera K4-C sul Pad: `chatgpt:gpt-6.1-sol`)
        expect(modelloR4DelProfilo(profilo('chatgpt', 'gpt-6.1-sol'))).toBe('chatgpt:gpt-6.1-sol')
        expect(fornitoreDelModelloR4('chatgpt:gpt-6.1-sol')).toBe('chatgpt')
        expect([...FORNITORI_DEL_CODICE_R4].sort()).toEqual(['anthropic', 'chatgpt', 'deepseek', 'gemini', 'local', 'ollama', 'openai', 'openrouter'])
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

    /*
     * Pad 22/10/2026 16:07 (foto): una sessione del Codice nata con un modello locale poi eliminato mostrava nel selettore il gruppo
     * «LOCALE-OSPITE» con l'icona «?» e la riga `locale-ospite:LFM2.5-2.6B-Q4_K_M.gguf - mai provato`. È un modello del dispositivo:
     * sta nel gruppo LOCAL, col nome del file come gli altri locali, e r4 lo riconosce ancora (stesso id, nessun doppio prefisso).
     */
    it('MOD-02b il modello locale della sessione che l\'app non elenca più resta un modello del dispositivo', () => {
        const id = `${FONTE_LOCALE_OSPITE_R4}:LFM2.5-2.6B-Q4_K_M.gguf`
        const sparito = profiloDelModelloR4(id, [])!
        expect([sparito.provider, sparito.display_name, sparito.model]).toEqual(['local', 'LFM2.5-2.6B-Q4_K_M', 'LFM2.5-2.6B-Q4_K_M.gguf'])
        expect(modelloR4DelProfilo(sparito)).toBe(id)
        expect(sparito.id).toBe(`r4:${id}`)
    })

    /*
     * Visto sul Pad il 22/10/2026 (giro 3, Qwen3.5-2B Q4_0 nel Codice, app in italiano): «LOCAL_CONTEXT_EXCEEDED — The conversation
     * does not fit in the local model’s window.» in INGLESE. Il desktop la traduce riconoscendo la frase del kernel
     * (`components/errori.js:956` @ ece6ab83a, `errori.kernel.finestraLocale` + `errori.kernel.quantiToken`): stessa regola, stesse
     * parole; i numeri ci sono solo se r4 li ha.
     */
    it('MOD-ERR-01 la finestra piena del modello locale si dice nella lingua dell\'app, coi numeri solo se r4 li manda', () => {
        const senza = { code: 'LOCAL_CONTEXT_EXCEEDED', message: 'The conversation does not fit in the local model’s window.' }
        expect(messaggioErroreModelloR4(senza, 'it')).toBe('La conversazione non entra nella finestra del modello locale.')
        expect(messaggioErroreModelloR4(senza, 'en')).toBe('The conversation does not fit in the local model’s window.')
        const con = { code: 'LOCAL_CONTEXT_EXCEEDED', message: 'The conversation (5812 tokens) does not fit in the local model’s window (4096 tokens).' }
        expect(messaggioErroreModelloR4(con, 'it')).toBe('La conversazione (5812 token) non entra nella finestra del modello locale (4096 token).')
        expect(messaggioErroreModelloR4(con, 'en-GB')).toBe('The conversation (5812 tokens) does not fit in the local model’s window (4096 tokens).')
        // AL CONTRARIO: una frase che non è quella del kernel resta com'è
        expect(messaggioErroreModelloR4({ code: 'LOCAL_CONTEXT_EXCEEDED', message: 'qualcos\'altro' }, 'it')).toBe('qualcos\'altro')
    })

    /*
     * Desktop 22/10/2026: il template di chat che rifiuta la conversazione (SERV-26) arriva come `LOCAL_ENGINE_REJECTED_REQUEST` con la
     * frase inglese del kernel; il desktop la riconosce (`components/errori.js:913` @ c4d42649a, `errori.kernel.motoreLocaleRifiuta`).
     */
    it('MOD-ERR-02 il rifiuto del motore locale si dice nella lingua dell\'app', () => {
        const rifiuto = { code: 'LOCAL_ENGINE_REJECTED_REQUEST', message: 'The local engine did not accept this request, not even as a plain chat.' }
        expect(messaggioErroreModelloR4(rifiuto, 'it')).toBe('Il motore locale non ha accettato questa richiesta, nemmeno senza gli attrezzi.')
        expect(messaggioErroreModelloR4(rifiuto, 'en')).toBe('The local engine did not accept this request, not even as a plain chat.')
    })

    /* Revisione avversaria 22/10, rilievi 7 e 8: maiuscole diverse non fanno un modello «sparito»; in remoto il file è del PC. */
    it('MOD-02c un locale con maiuscole diverse è lo stesso profilo; in remoto l\'id di r4 resta intero', () => {
        const locale = profilo('local', '/storage/emulated/0/models/LFM2.5-2.6B-Q4_K_M.gguf', { display_name: 'LFM2.5-2.6B-Q4_K_M' })
        expect(profiloDelModelloR4(`${FONTE_LOCALE_OSPITE_R4}:lfm2.5-2.6b-q4_k_m.gguf`, [locale])).toBe(locale)
        const remoto = profiloDelModelloR4(`${FONTE_LOCALE_OSPITE_R4}:x.gguf`, [], { dispositivo: false })!
        expect([remoto.provider, remoto.model]).toEqual([FONTE_LOCALE_OSPITE_R4, `${FONTE_LOCALE_OSPITE_R4}:x.gguf`])
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

    /*
     * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`, contratto r4 `accesso-locale-ospite.mjs` @ 0f3f90f8e):
     * l'app spinge {socketPath, chiave, modello, nCtx, capacita?}, NIENT'ALTRO (r4 dà 400 a ogni altro campo); senza modello aperto si
     * toglie (`…/access/remove {}`). Mai la chiave in un messaggio d'errore.
     */
    it('MOD-11 la spinta del motore dell’app: solo i campi del contratto; senza modello si toglie; un rifiuto non porta la chiave', async () => {
        const c = cliente({}, (r) => (r.percorso.startsWith('/api/v1/providers/locale-ospite/') ? { stato: 200, corpo: '{"ok":true}' } : null))
        const accesso = { socketPath: '/data/user/0/ai.talos.dev/files/locale-ospite/motore.sock', chiave: 'CHIAVE-SEGRETA-0123456789abcdef', modello: 'gemma.gguf', nCtx: 32768, capacita: { tools: true, reasoning: false } }
        await spingiAccessoLocaleR4(c.ponte, { ...accesso, altro: 'x' } as never)
        expect(c.scritte()).toEqual([{ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access', corpo: JSON.stringify(accesso) }])
        await spingiAccessoLocaleR4(c.ponte, null)
        expect(c.scritte().at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access/remove', corpo: '{}' })
        const rifiuta = cliente({}, () => ({ stato: 400, corpo: JSON.stringify({ ok: false, error: { code: 'LOCAL_GUEST_SOCKET_INVALID', message: 'The local engine socket is outside the app folder.' } }) }))
        let preso: unknown = null
        try { await spingiAccessoLocaleR4(rifiuta.ponte, accesso) } catch (e) { preso = e }
        expect((preso as { code?: string }).code).toBe('LOCAL_GUEST_SOCKET_INVALID')
        expect(String((preso as Error).message)).not.toContain('CHIAVE-SEGRETA')
    })

    it('MOD-12 il nome del modello locale: la grammatica di r4 (`FORMA_ID_MODELLO_LOCALE`, senza maiuscole/minuscole)', () => {
        expect(nomeLocaleValidoR4('LFM2.5-2.6B-QAD-Q4_0.gguf')).toBe(true)
        expect(nomeLocaleValidoR4('gemma 3 (copia).gguf')).toBe(false)
        expect(nomeLocaleValidoR4('-gemma.gguf')).toBe(false)
        expect(nomeLocaleValidoR4(`a${'b'.repeat(127)}`)).toBe(true)
        expect(nomeLocaleValidoR4(`a${'b'.repeat(128)}`)).toBe(false)
    })

    // 21/10: «sta rispondendo nella chat» era falso quando il motore lo teneva il riassunto del contesto (giro 16 sul Pad) ⇒ frase neutra del desktop @ 2f6c5d990
    it('MOD-13 i rifiuti del motore dell’app con le parole del desktop (`errori.js` @ 2f6c5d990), nelle due lingue', () => {
        expect(messaggioErroreModelloR4({ code: 'LOCAL_ENGINE_BUSY', message: 'x' }, 'it')).toBe('Il modello sul dispositivo è occupato con un altro lavoro (una risposta nella chat o un riassunto del contesto); riprova quando ha finito.')
        expect(messaggioErroreModelloR4({ code: 'LOCAL_ENGINE_BUSY', message: 'x' }, 'en')).toBe('The on-device model is busy with another job (a chat reply or a context summary); try again when it has finished.')
        expect(messaggioErroreModelloR4({ code: 'LOCAL_RUNTIME_NOT_READY', message: 'x' }, 'en')).toBe('No local model is open in the app: open one from the model picker.')
        expect(messaggioErroreModelloR4({ code: 'LOCAL_MODEL_CHANGED', message: 'x' }, 'it')).toBe('Ora sul dispositivo è aperto un altro modello: sceglilo di nuovo nel Codice.')
        expect(messaggioErroreModelloR4({ code: 'LOCAL_GUEST_SOCKET_INVALID', message: 'x' }, 'en')).toBe('The local engine socket is not valid: it must be a socket inside the app folder')
    })

    it('MOD-14 il motore dell’app non ha chiave né indirizzo da sincronizzare; il nome per la persona è quello del file', async () => {
        const c = cliente({ id: 'locale-ospite', requiresKey: false })
        await sincronizzaFornitoreR4(c.ponte, 'locale-ospite', { chiave: null, indirizzo: null })
        expect(c.richieste).toEqual([])
        expect(nomeModelloUmanoR4('locale-ospite:LFM2.5-2.6B-QAD-Q4_0.gguf')).toBe(nomeModelloUmanoR4('local:LFM2.5-2.6B-QAD-Q4_0.gguf'))
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
