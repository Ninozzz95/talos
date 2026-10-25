import { describe, expect, it } from 'vitest'
import { conversationOf } from '@/lib/chat/providers/localAdapter'

/**
 * ⛔⛔ D-LOC-2 — un attrezzo con argomenti rotti spegne il giro che doveva correggerlo.
 *
 * ## Visto dall'owner il 2026-10-23 sull'app vera
 *
 * Spark-X2.5-4B Q4_K_M, «Si genera l html usando apposito tool»: `artifact_create` rifiutato con «The arguments were not
 * valid JSON», e nello stesso millisecondo, al posto della correzione, il messaggio di sistema `TALOS_LLAMA_NO_CHAT_TEMPLATE`.
 *
 * ## Perché
 *
 * Il turno assistente tornava al template con gli argomenti GREZZI. llama.cpp 0.7.0, per i template con
 * `supports_object_arguments`, li rilegge (`common/chat.cpp:1026-1043`, `func_args_not_string`) e su un JSON rotto lancia
 * «Failed to parse tool call arguments as JSON»: il prompt non si costruisce (llama.cpp #22072, ancora aperto in f849095).
 * Riprodotto sul Pad il 2026-10-23 con LFM2.5, Gemma 4 E2B e Granite 4.2: stessa storia, argomenti validi ok, rotti rifiutati.
 *
 * ## La cura, già nostra altrove
 *
 * `anthropicClient.ts:122-128`, `geminiAdapter.ts:47-53` e `ollamaAdapter.ts:41-47` passano `{}` al posto di un JSON rotto;
 * il Desktop fa lo stesso (r4 581f1575c), e Pi tiene nella storia sempre un oggetto (`json-parse.ts:106-127`). Il risultato
 * dell'attrezzo dice già al modello che gli argomenti non erano JSON: la storia non deve ripeterlo rompendo il template.
 * Ledger: `.claude/ragionamento/LEDGER-ATTREZZI-LOCALI-NO-CHAT-TEMPLATE-2026-10-23.md`.
 */

const RICHIESTA = {
    model: { id: 'm', provider: 'local', displayName: 'm' },
    effort: 'low',
    thinking: false,
} as never

function argomentiInviati(argomenti: string): string {
    const messaggi = conversationOf({
        ...RICHIESTA,
        turns: [
            { role: 'user', content: 'Si genera l html usando apposito tool' },
            {
                role: 'assistant',
                content: 'Genero il sito.',
                toolCalls: [{ id: 'c1', name: 'artifact_create', arguments: argomenti }],
            },
            {
                role: 'tool',
                content: 'The arguments were not valid JSON. Send a single JSON object.',
                toolCallId: 'c1',
                toolName: 'artifact_create',
            },
        ],
    } as never)
    const assistente = messaggi.find((m) => m.role === 'assistant')
    const chiamata = assistente?.tool_calls?.[0]
    if (!chiamata) throw new Error('la chiamata è sparita dalla storia')
    return chiamata.function.arguments
}

describe('D-LOC-2 la storia verso il template porta sempre argomenti che il template sa rileggere', () => {
    it('D-LOC-2-01 un HTML con le virgolette non escapate diventa un oggetto vuoto', () => {
        const rotto = '{"title": "Barnes", "html": "<div class="hero">casa</div>"}'
        expect(argomentiInviati(rotto)).toBe('{}')
    })

    it('D-LOC-2-02 troncati, array e valori nudi non sono un oggetto: oggetto vuoto', () => {
        expect(argomentiInviati('{"title": "Barn')).toBe('{}')
        expect(argomentiInviati('[1, 2]')).toBe('{}')
        expect(argomentiInviati('"solo testo"')).toBe('{}')
        expect(argomentiInviati('null')).toBe('{}')
    })

    it('D-LOC-2-03 un oggetto valido passa invariato, byte per byte', () => {
        const valido = '{"title":"Barnes","html":"<div class=\\"hero\\">casa</div>"}'
        expect(argomentiInviati(valido)).toBe(valido)
        expect(argomentiInviati('{}')).toBe('{}')
    })
})
