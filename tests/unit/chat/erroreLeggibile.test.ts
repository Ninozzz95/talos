import { describe, expect, it } from 'vitest'
import {
    talosChatFaultText,
    talosSembraUnCodice,
    type TalosChatFaultInput,
} from '@/lib/chat/erroreLeggibile'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

/**
 * §40 del ledger del motore locale, dal Pad dell'owner: al posto della risposta
 * comparivano `CHAT_EXECUTION_FAILED` e, nello slot della FRASE,
 * `TALOS_LLAMA_NO_CHAT_TEMPLATE` — il nome che ci siamo dati fra noi, davanti a
 * chi voleva solo una risposta. NN/g, letto 12/09/2026: «hide or minimize
 * obscure error codes… show them for technical diagnostic purposes only».
 *
 * Si prova in tutti e due i versi: che un codice NON esca come frase, e che una
 * frase vera esca INTATTA — una cura che riscrive anche i messaggi buoni è un
 * guasto nuovo travestito da cura.
 */

function dizionario(albero: Record<string, unknown>): (key: string, p?: Record<string, string | number>) => string {
    return (key) => {
        const valore = key.split('.').reduce<unknown>(
            (nodo, pezzo) => (nodo && typeof nodo === 'object' ? (nodo as Record<string, unknown>)[pezzo] : undefined),
            albero,
        )
        // ⛔ Si ROMPE su una chiave assente invece di restituire la chiave: una
        // traduzione mancante che passa come stringa è un altro nome interno a
        // schermo, cioè esattamente il difetto che questo file cura.
        if (typeof valore !== 'string') throw new Error(`chiave i18n assente: ${key}`)
        return valore
    }
}

const t = dizionario(TALOS_IT_MESSAGES as unknown as Record<string, unknown>)
const tEn = dizionario(TALOS_EN_MESSAGES as unknown as Record<string, unknown>)

function busta(patch: Partial<TalosChatFaultInput> = {}): TalosChatFaultInput {
    return {
        layer: 'system',
        code: 'CHAT_EXECUTION_FAILED',
        message: 'TALOS_LLAMA_NO_CHAT_TEMPLATE',
        nextAction: t('chat.checkModelConnection'),
        provider: 'local',
        ...patch,
    }
}

describe('riconoscere un nome interno', () => {
    it.each([
        'TALOS_LLAMA_NO_CHAT_TEMPLATE',
        'PROVIDER_HTTP_401',
        'CHAT_EXECUTION_FAILED',
        'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large',
        'invalid_api_key',
        'context_length_exceeded',
    ])('«%s» è un codice', (valore) => {
        expect(talosSembraUnCodice(valore)).toBe(true)
    })

    /** ⛔ AL CONTRARIO — e conta più del resto: le frasi vere passano. */
    it.each([
        'Rate limit exceeded.',
        'Il modello non ha risposto.',
        'anthropic ha restituito una risposta chat non valida.',
        'Run: UNIQUE constraint failed: talos_chat_attachments.id (code 1555)',
        '',
        'Errore',
    ])('«%s» NON è un codice', (valore) => {
        expect(talosSembraUnCodice(valore)).toBe(false)
    })
})

describe('la frase che arriva a schermo', () => {
    it('§40 — il codice del template esce come frase, e il codice scende in diagnostica', () => {
        const esito = talosChatFaultText(busta(), t)
        expect(esito.message).toBe(t('chat.faultNoChatTemplate'))
        expect(esito.message).not.toContain('TALOS_')
        expect(esito.message).not.toBe('TALOS_LLAMA_NO_CHAT_TEMPLATE')
        expect(esito.diagnostic).toBe('TALOS_LLAMA_NO_CHAT_TEMPLATE')
    })

    it('§40 — e il consiglio non nomina più la rete a un modello che non la usa', () => {
        const esito = talosChatFaultText(busta(), t)
        expect(esito.nextAction).toBe(t('chat.faultNoChatTemplateNext'))
        expect(esito.nextAction).not.toBe(t('chat.checkModelConnection'))
    })

    it('«controlla lo stato del provider» a un modello locale diventa il consiglio locale (Pad 12/09/2026)', () => {
        const esito = talosChatFaultText(
            busta({ message: 'PROVIDER_CHAT_FAILED', nextAction: t('chat.checkProviderHealth') }),
            t,
        )
        expect(esito.nextAction).toBe(t('chat.checkLocalModel'))
    })

    it('AL CONTRARIO: lo stesso rimedio resta uguale per un provider remoto', () => {
        const esito = talosChatFaultText(
            busta({ message: 'PROVIDER_CHAT_FAILED', nextAction: t('chat.checkProviderHealth'), provider: 'openrouter' }),
            t,
        )
        expect(esito.nextAction).toBe(t('chat.checkProviderHealth'))
    })

    it('un codice locale senza frase propria eredita il consiglio LOCALE, non quello di rete', () => {
        const esito = talosChatFaultText(
            busta({ message: 'TALOS_LLAMA_SOMETHING_NEW_NOBODY_LISTED' }),
            t,
        )
        expect(esito.message).toBe(t('chat.faultGenericSystem'))
        expect(esito.nextAction).toBe(t('chat.checkLocalModel'))
        expect(esito.diagnostic).toBe('TALOS_LLAMA_SOMETHING_NEW_NOBODY_LISTED')
    })

    it('il dettaglio dopo i due punti non impedisce di riconoscere il codice', () => {
        const esito = talosChatFaultText(
            busta({
                layer: 'policy',
                message: 'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large',
                provider: null,
            }),
            t,
        )
        expect(esito.message).toBe(t('chat.authorizationLapsed'))
        expect(esito.diagnostic).toBe('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large')
    })

    it.each([
        ['validator', 'chat.faultGenericValidator'],
        ['policy', 'chat.faultGenericPolicy'],
        ['provider', 'chat.faultGenericProvider'],
        ['network', 'chat.faultGenericNetwork'],
        ['worker', 'chat.faultGenericWorker'],
        ['system', 'chat.faultGenericSystem'],
    ] as const)('un codice sconosciuto sul livello %s ha comunque una frase vera', (layer, chiave) => {
        const esito = talosChatFaultText(
            busta({ layer, message: 'SOMETHING_WE_NEVER_LISTED', provider: 'openrouter' }),
            t,
        )
        expect(esito.message).toBe(t(chiave))
        expect(talosSembraUnCodice(esito.message)).toBe(false)
        expect(esito.diagnostic).toBe('SOMETHING_WE_NEVER_LISTED')
    })

    /**
     * ⛔ Il censimento, provato: OGNI codice che la chat può mostrare esce come
     * frase e non comincia col codice. Se domani se ne aggiunge uno all'elenco
     * senza la sua frase, questo test lo dice invece di lasciarlo scivolare a
     * schermo.
     */
    const censimento = [
        'TALOS_LLAMA_NO_CHAT_TEMPLATE', 'TALOS_LLAMA_PLAN_FAILED', 'TALOS_LLAMA_CONTEXT_REQUIRED',
        'TALOS_LOCAL_PROMPT_TOO_LONG', 'TALOS_LLAMA_GENERATION_FAILED', 'TALOS_LOCAL_GENERATION_FAILED',
        'TALOS_LLAMA_OPEN_FAILED', 'TALOS_LLAMA_PATH_REQUIRED', 'TALOS_LLAMA_MODEL_MISSING',
        'TALOS_LOCAL_MODEL_OPEN_PATH', 'TALOS_LOCAL_MODEL_OPEN_LOAD', 'TALOS_LOCAL_MODEL_OPEN_CANCELLED',
        'TALOS_LOCAL_MODEL_OPEN_CONTEXT', 'TALOS_LOCAL_MODEL_OPEN_SAMPLER', 'TALOS_LOCAL_MODEL_OPEN_UNKNOWN',
        'TALOS_LOCAL_MODELS_UNREADABLE', 'TALOS_PROVIDER_HTTP_FAILED', 'TALOS_CHAT_PROVIDER_KEY_REQUIRED',
        'TALOS_CHAT_PROVIDER_CATALOG_REQUIRED', 'TALOS_CHAT_PROVIDER_MODEL_MISMATCH',
        'TALOS_CHAT_MODEL_REQUIRED', 'TALOS_CHAT_IMAGE_INPUT_UNSUPPORTED', 'TALOS_CHAT_DB_UNAVAILABLE',
        'TALOS_CHAT_REPOSITORY_UNAVAILABLE', 'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID',
        'PROVIDER_CHAT_FAILED', 'CHAT_EXECUTION_FAILED',
    ]

    it.each(censimento)('«%s» non arriva mai a schermo come frase', (codice) => {
        for (const tradurre of [t, tEn]) {
            const esito = talosChatFaultText(busta({ message: codice, provider: 'openrouter' }), tradurre)
            expect(esito.message).not.toBe(codice)
            expect(esito.message.startsWith(codice)).toBe(false)
            expect(talosSembraUnCodice(esito.message)).toBe(false)
            expect(esito.message.trim().length).toBeGreaterThan(10)
            expect(esito.diagnostic).toBe(codice)
        }
    })

    /**
     * ⛔ AL CONTRARIO, la prova che il cancello non mangia i messaggi buoni: il
     * 401 del provider — quello che oggi è GIÀ in lingua umana — deve uscire
     * identico a com'era, consiglio compreso.
     */
    it('il 401 del provider, già umano, passa intatto', () => {
        const esito = talosChatFaultText({
            layer: 'provider',
            code: 'PROVIDER_HTTP_401',
            message: 'Incorrect API key provided.',
            nextAction: t('chat.updateProviderCredential'),
            provider: 'openrouter',
        }, t)
        expect(esito.message).toBe('Incorrect API key provided.')
        expect(esito.nextAction).toBe(t('chat.updateProviderCredential'))
        expect(esito.diagnostic).toBeNull()
    })

    it('e un consiglio di rete resta tale per un provider remoto', () => {
        const esito = talosChatFaultText(
            busta({ message: 'Il modello non ha risposto.', provider: 'openrouter' }),
            t,
        )
        expect(esito.nextAction).toBe(t('chat.checkModelConnection'))
    })
})
