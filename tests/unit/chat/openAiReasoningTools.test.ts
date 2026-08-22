import { beforeEach, describe, expect, it } from 'vitest'
import {
    TALOS_OPENAI_REASONING_NONE,
    __resetTalosReasoningConflicts,
    talosHasReasoningConflict,
    talosOpenAiRejectsToolsWithReasoning,
    talosRememberReasoningConflict,
} from '@/lib/chat/providers/openAiReasoningTools'

/**
 * Owner 2026-08-03, con uno screenshot dal telefono: con `gpt-5.6-luna`
 * selezionato, «Ciaoo» riceve un errore invece di una risposta. TALOS offre i
 * suoi tool a OGNI messaggio, quindi su quel modello non funzionava niente.
 *
 * Il messaggio, verbatim dall'API:
 *   «Function tools with reasoning_effort are not supported for gpt-5.6-luna in
 *   /v1/chat/completions. To use function tools, use /v1/responses or set
 *   reasoning_effort to 'none'.»
 */
const REFUSAL = {
    error: {
        message: "Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
        type: 'invalid_request_error',
        param: 'reasoning_effort',
        code: null,
    },
}

beforeEach(() => { __resetTalosReasoningConflicts() })

describe('il rifiuto che si puo riconoscere', () => {
    it('riconosce quel 400 e nessun altro', () => {
        expect(talosOpenAiRejectsToolsWithReasoning(400, REFUSAL)).toBe(true)
    })

    it('non scambia per quello un 400 qualunque', () => {
        /**
         * Stretto di proposito. Un riconoscimento largo trasformerebbe altri
         * 400 legittimi in un secondo tentativo col ragionamento spento — cioe'
         * in una richiesta diversa da quella chiesta, mandata senza dirlo.
         */
        expect(talosOpenAiRejectsToolsWithReasoning(400, {
            error: { message: 'Invalid API key', type: 'invalid_request_error', param: null },
        })).toBe(false)
        // Il parametro giusto ma un'altra lamentela.
        expect(talosOpenAiRejectsToolsWithReasoning(400, {
            error: { message: 'Unsupported value for reasoning_effort', param: 'reasoning_effort' },
        })).toBe(false)
        // La frase giusta ma su un altro parametro.
        expect(talosOpenAiRejectsToolsWithReasoning(400, {
            error: { message: 'Function tools with reasoning_effort are not supported', param: 'tools' },
        })).toBe(false)
    })

    it('non tratta un errore di altro tipo come questo', () => {
        expect(talosOpenAiRejectsToolsWithReasoning(429, REFUSAL)).toBe(false)
        expect(talosOpenAiRejectsToolsWithReasoning(500, REFUSAL)).toBe(false)
        expect(talosOpenAiRejectsToolsWithReasoning(400, null)).toBe(false)
        expect(talosOpenAiRejectsToolsWithReasoning(400, {})).toBe(false)
    })
})

describe('quello che si impara dal rifiuto', () => {
    it('vale per il modello che lo ha detto, non per tutti', () => {
        talosRememberReasoningConflict('gpt-5.6-luna')
        expect(talosHasReasoningConflict('gpt-5.6-luna')).toBe(true)
        // Un elenco cablato invecchierebbe dentro l'APK e sbaglierebbe sul
        // prossimo modello: qui si sa solo cio' che il provider ha detto.
        expect(talosHasReasoningConflict('gpt-4.1')).toBe(false)
    })

    it('il livello da chiedere e «none» ESPLICITO, non l assenza', () => {
        /**
         * Provato contro l'API vera il 2026-08-03, tre richieste identiche
         * tranne quel campo:
         *   `high` + tool  → 400
         *   campo omesso   → 400
         *   `none` + tool  → 200
         * Togliere il campo non basta: senza, il modello applica un livello suo
         * lato server. La correzione ovvia sarebbe stata sbagliata.
         */
        expect(TALOS_OPENAI_REASONING_NONE).toBe('none')
    })
})
