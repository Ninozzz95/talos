import { describe, expect, it } from 'vitest'
import {
    talosAttrezziInOrdineDiRivelazione,
    talosProjectLocalToolConversation,
} from '@/lib/chat/localToolPromptProtocol'
import { TALOS_DETTAGLI_STRUMENTO } from '@/lib/tools/catalogoCompatto'
import type { TalosLocalEngineTurn } from '@/services/localEngine'

/**
 * ⛔⛔⛔ PREFISSO-STABILE — il cancello che dice se il lavoro si rifà.
 *
 * ## Cosa misura, e perché è questo il numero
 *
 * `llama.cpp` riusa la cache KV **per prefisso**: confronta la sequenza che ha
 * già in memoria con quella nuova e si ferma **al primo token che diverge**
 * (ggml-org/llama.cpp, discussion #13606, letta il 2026-09-10). Tutto ciò che
 * sta dopo si ri-prefilla, anche se era identico. Su questo Pad il prefill
 * misurato è **72,2 token/s** (`localAdapter.ts`, 2026-08-07): ogni centinaio
 * di token buttati è più di un secondo di attesa, a ogni messaggio.
 *
 * ⇒ L'invariante che tiene in piedi tutto è una sola frase: **la proiezione
 * del messaggio N dev'essere un PREFISSO della proiezione del messaggio N+1**,
 * finché l'insieme degli attrezzi non cambia. Un turno già mandato non si
 * riscrive mai.
 *
 * Fonte della regola (ricerca web del 2026-09-10): Modular / LLM Inference
 * Handbook, «Prefix caching» — ordinare per stabilità, storia in sola
 * aggiunta, non riscrivere i messaggi precedenti; e Pydantic AI, «System
 * reminders» — i promemoria non si iniettano nel sistema, e la storia durevole
 * si riproduce identica byte per byte.
 *
 * ## MISURATO il 2026-09-10, coi tokenizer ufficiali Gemma 3 e Qwen 3
 *
 * Ri-prefill per messaggio, conversazione di quattro domande (gemma3):
 *
 *   P2→P3  194 → **89**    P3→P4  156 → **90**    P4→P5  170 → **93**
 *
 * e dopo la cura `comune` **coincide con l'intera sequenza in cache**, cioè la
 * risposta appena generata non si ripaga più.
 *
 * ⛔ Questo file è un cancello, non una descrizione: se qualcuno rimette il
 * promemoria sul solo ultimo turno, o lascia che un attrezzo svelato si
 * infili in mezzo all'elenco, il primo `it` qui sotto diventa **rosso**.
 * Provato al verso contrario il 2026-09-10, mutando il sorgente apposta.
 */

const PROMEMORIA = 'Reminder: if answering this needs one of the functions above'

function attrezzo(nome: string): unknown {
    return {
        type: 'function',
        function: {
            name: nome,
            description: `Do ${nome}.`,
            parameters: { type: 'object', properties: {}, required: [] },
        },
    }
}

const DETTAGLI = attrezzo(TALOS_DETTAGLI_STRUMENTO)
const BASE = [DETTAGLI, attrezzo('time_now'), attrezzo('web_search')]

const CAPACITA = {
    supportsTools: false,
    supportsToolCalls: false,
    supportsSystemRole: true,
} as const

/**
 * La stessa cosa che il template Jinja fa sul dispositivo, ridotta a ciò che
 * conta qui: ruolo e testo, in ordine. Il prefisso comune si misura su questa.
 */
function serializza(turns: ReadonlyArray<TalosLocalEngineTurn>): string {
    return turns.map((turn) => `<${turn.role}>\n${turn.content ?? ''}`).join('\n</turn>\n')
}

function proietta(
    turns: ReadonlyArray<TalosLocalEngineTurn>,
    tools: readonly unknown[],
): ReadonlyArray<TalosLocalEngineTurn> {
    // ⛔ L'ordine si applica FUORI dal projector, esattamente come fa
    // `localAdapter.ts`: se questo test lo saltasse, proverebbe un percorso
    // che in produzione non esiste.
    return talosProjectLocalToolConversation({
        transport: 'prompt-json-v1',
        capabilities: CAPACITA,
        turns,
        tools: talosAttrezziInOrdineDiRivelazione(tools, turns),
        locale: 'it-IT',
    }).turns
}

const SISTEMA: TalosLocalEngineTurn = { role: 'system', content: 'Sii breve.' }

describe('PREFISSO-STABILE-01 la proiezione del messaggio N è un prefisso di N+1', () => {
    it('non riscrive nessun turno già mandato, su tre messaggi consecutivi', () => {
        const storia: TalosLocalEngineTurn[] = [SISTEMA, { role: 'user', content: 'Che ore sono?' }]
        const messaggi: string[] = [serializza(proietta(storia, BASE))]

        for (const [domanda, risposta] of [
            ['Sono le 14:32.', 'E domani?'],
            ['Domani piove.', 'Grazie.'],
            ['Di niente.', 'Ancora una cosa.'],
        ] as const) {
            storia.push({ role: 'assistant', content: domanda })
            storia.push({ role: 'user', content: risposta })
            messaggi.push(serializza(proietta(storia, BASE)))
        }

        expect(messaggi).toHaveLength(4)
        for (let i = 0; i + 1 < messaggi.length; i += 1) {
            const precedente = messaggi[i]!
            const successivo = messaggi[i + 1]!
            expect(successivo.length).toBeGreaterThan(precedente.length)
            // ⛔ Il cuore del cancello: `startsWith`, non `toContain`. Un turno
            // riscritto sposta la divergenza all'indietro, e qui si vede.
            expect(successivo.startsWith(precedente)).toBe(true)
        }
    })

    it('tiene il promemoria su OGNI turno utente, e comunque per ultimo', () => {
        const turns: TalosLocalEngineTurn[] = [
            SISTEMA,
            { role: 'user', content: 'Prima domanda.' },
            { role: 'assistant', content: 'Prima risposta.' },
            { role: 'user', content: 'Seconda domanda.' },
        ]
        const proiettati = proietta(turns, BASE)
        const utenti = proiettati.filter((turno) => turno.role === 'user')

        expect(utenti).toHaveLength(2)
        for (const turno of utenti) expect(turno.content).toContain(PROMEMORIA)
        // La ragione per cui il promemoria esiste (misurata il 2026-08-20):
        // è l'ultima cosa che il modello legge prima di generare.
        expect(proiettati.at(-1)?.content?.endsWith('worse than asking.')).toBe(true)
    })

    it('non lo mette da nessuna parte quando non ci sono attrezzi', () => {
        const proiettati = talosProjectLocalToolConversation({
            transport: 'prompt-json-v1',
            capabilities: CAPACITA,
            turns: [SISTEMA, { role: 'user', content: 'Ciao.' }],
            tools: undefined,
            locale: 'it-IT',
        }).turns
        expect(serializza(proiettati)).not.toContain(PROMEMORIA)
    })

    it('resta un prefisso anche attraverso un giro di attrezzi', () => {
        const chiamata: TalosLocalEngineTurn = {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'time_now', arguments: '{}' },
            }],
        }
        const risultato: TalosLocalEngineTurn = {
            role: 'tool',
            name: 'time_now',
            tool_call_id: 'call_1',
            content: '{"iso":"2026-09-10T14:32:00"}',
        }
        const primo = serializza(proietta([SISTEMA, { role: 'user', content: 'Che ore sono?' }], BASE))
        const dopoLaChiamata = serializza(proietta(
            [SISTEMA, { role: 'user', content: 'Che ore sono?' }, chiamata, risultato],
            BASE,
        ))
        expect(dopoLaChiamata.startsWith(primo)).toBe(true)
    })
})

describe('PREFISSO-STABILE-02 gli attrezzi svelati si accodano', () => {
    const chiamataDettagli = (nomi: readonly string[]): TalosLocalEngineTurn => ({
        role: 'assistant',
        content: '',
        tool_calls: [{
            id: `call_${nomi.join('_')}`,
            type: 'function',
            function: {
                name: TALOS_DETTAGLI_STRUMENTO,
                arguments: JSON.stringify({ names: nomi }),
            },
        }],
    })

    const nomiDi = (tools: readonly unknown[] | undefined): string[] =>
        (tools ?? []).map((tool) => (tool as { function: { name: string } }).function.name)

    it('accoda l’attrezzo svelato invece di infilarlo in mezzo', () => {
        // `device_torch` sta in MEZZO nell'ordine dell'offerta: è esattamente il
        // caso che spezzava il prefisso.
        const offerti = [DETTAGLI, attrezzo('calendar_read'), attrezzo('device_torch'), attrezzo('web_search')]
        const primo = [DETTAGLI, attrezzo('calendar_read'), attrezzo('web_search')]

        const prima = nomiDi(talosAttrezziInOrdineDiRivelazione(primo, [SISTEMA]))
        const dopo = nomiDi(talosAttrezziInOrdineDiRivelazione(
            offerti,
            [SISTEMA, { role: 'user', content: 'x' }, chiamataDettagli(['device_torch'])],
        ))

        expect(prima).toEqual([TALOS_DETTAGLI_STRUMENTO, 'calendar_read', 'web_search'])
        expect(dopo).toEqual([TALOS_DETTAGLI_STRUMENTO, 'calendar_read', 'web_search', 'device_torch'])
        // L'invariante, detta come la legge la cache: i nomi di prima sono un
        // prefisso di quelli di dopo.
        expect(dopo.slice(0, prima.length)).toEqual(prima)
    })

    it('rispetta l’ordine in cui il modello li ha chiesti, e non li duplica', () => {
        const offerti = [DETTAGLI, attrezzo('a'), attrezzo('b'), attrezzo('c'), attrezzo('d')]
        const storia = [
            SISTEMA,
            chiamataDettagli(['c']),
            chiamataDettagli(['b', 'c']),
        ]
        expect(nomiDi(talosAttrezziInOrdineDiRivelazione(offerti, storia)))
            .toEqual([TALOS_DETTAGLI_STRUMENTO, 'a', 'd', 'c', 'b'])
    })

    it('non tocca niente senza chiamate, e regge argomenti malformati', () => {
        expect(talosAttrezziInOrdineDiRivelazione(BASE, [SISTEMA])).toBe(BASE)
        expect(talosAttrezziInOrdineDiRivelazione(undefined, [SISTEMA])).toBeUndefined()

        const rotta: TalosLocalEngineTurn = {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call_x',
                type: 'function',
                function: { name: TALOS_DETTAGLI_STRUMENTO, arguments: 'non-è-json' },
            }],
        }
        expect(nomiDi(talosAttrezziInOrdineDiRivelazione(BASE, [SISTEMA, rotta]))).toEqual(nomiDi(BASE))
    })

    it('⛔ il nome di tool_details qui dentro è lo stesso del catalogo', () => {
        // Il modulo tiene una COPIA della costante per non trascinare
        // `catalogoCompatto` nel grafo statico d'avvio. Se le due si scollano,
        // il riordino smette di riconoscere le chiamate e nessuno se ne
        // accorge: questo `it` è l'unico posto che lo vede.
        const conIlNomeVero = talosAttrezziInOrdineDiRivelazione(
            [DETTAGLI, attrezzo('a'), attrezzo('b')],
            [SISTEMA, chiamataDettagli(['a'])],
        )
        expect(nomiDi(conIlNomeVero)).toEqual([TALOS_DETTAGLI_STRUMENTO, 'b', 'a'])
    })
})
