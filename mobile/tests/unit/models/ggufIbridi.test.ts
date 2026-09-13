import { describe, expect, it } from 'vitest'
import { talosReadGgufHeader } from '@/lib/models/gguf'
import { talosKvBytesPerTokenOf } from '@/lib/models/engineDiagnostics'

/**
 * ⭐⭐⭐ LE ARCHITETTURE IBRIDE, dal catalogo Hugging Face.
 *
 * ## Il numero che ha fatto nascere questo file
 *
 * `LFM2.5-2.6B` pubblica `attention.head_count_kv` come **array per-strato**:
 * letto dal Pad il **2026-09-10** dai metadati del file vero,
 * `arr[i32,30] = [0, 0, 8, 0, 0, 8, 0, 0, 0, 8, …]` — zero dove lo strato e'
 * ricorrente, 8 dove c'e' attenzione. Il lettore scavalcava **ogni** array,
 * quindi quella chiave non arrivava mai e il conto ripiegava su
 * `attention.head_count` = 32 moltiplicato per tutti e trenta gli strati:
 *
 *     30 × 32 × 64 × 2 × 2  =  245.760 byte/token   ← quello che dicevamo
 *      6 ×  8 × 64 × 2 × 2  =   12.288 byte/token   ← quello vero
 *
 * **Venti volte.** ⛔ E il primo numero e' stato scritto DUE volte come
 * «61.440» — da me e dall'agente — prima che questa prova lo smentisse: e' il
 * motivo per cui l'aritmetica sta dentro un test e non dentro un commento.
 *
 * L'errore andava nella direzione prudente — un modello appariva piu' pesante
 * di com'e', quindi rifiutavamo contesti che il telefono reggeva — ma restava
 * sbagliato, e soprattutto **invisibile**.
 *
 * ## Perche' i byte si scrivono a mano
 *
 * Un lettore provato contro la propria idea del formato e' un lettore che va
 * d'accordo con se' stesso e con nient'altro. Qui l'intestazione si assembla
 * byte per byte, come nel file gemello `ggufHeader.test.ts`.
 */

const enum Type {
    UINT32 = 4,
    INT32 = 5,
    STRING = 8,
    ARRAY = 9,
}

class Writer {
    private parts: Uint8Array[] = []

    u32(value: number): this {
        const bytes = new Uint8Array(4)
        new DataView(bytes.buffer).setUint32(0, value, true)
        this.parts.push(bytes)
        return this
    }

    i32(value: number): this {
        const bytes = new Uint8Array(4)
        new DataView(bytes.buffer).setInt32(0, value, true)
        this.parts.push(bytes)
        return this
    }

    u64(value: number): this {
        const bytes = new Uint8Array(8)
        new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
        this.parts.push(bytes)
        return this
    }

    raw(bytes: Uint8Array): this {
        this.parts.push(bytes)
        return this
    }

    text(value: string): this {
        const bytes = new TextEncoder().encode(value)
        return this.u64(bytes.length).raw(bytes)
    }

    build(): ArrayBuffer {
        const total = this.parts.reduce((sum, part) => sum + part.length, 0)
        const out = new Uint8Array(total)
        let at = 0
        for (const part of this.parts) {
            out.set(part, at)
            at += part.length
        }
        return out.buffer
    }
}

type Campo =
    | { key: string; type: Type.STRING; value: string }
    | { key: string; type: Type.UINT32; value: number }
    | { key: string; type: Type.ARRAY; elementType: Type.INT32; values: number[] }
    | { key: string; type: Type.ARRAY; elementType: Type.STRING; values: string[] }

function gguf(campi: Campo[]): ArrayBuffer {
    const writer = new Writer()
    writer.raw(new TextEncoder().encode('GGUF')).u32(3).u64(1).u64(campi.length)
    for (const campo of campi) {
        writer.text(campo.key).u32(campo.type)
        if (campo.type === Type.STRING) writer.text(campo.value)
        else if (campo.type === Type.UINT32) writer.u32(campo.value)
        else if (campo.elementType === Type.INT32) {
            writer.u32(Type.INT32).u64(campo.values.length)
            for (const valore of campo.values) writer.i32(valore)
        } else {
            writer.u32(Type.STRING).u64(campo.values.length)
            for (const valore of campo.values) writer.text(valore)
        }
    }
    // Un tensore, perche' un'intestazione senza tensori non e' un modello.
    writer.text('token_embd.weight').u32(2).u64(2048).u64(128_000).u32(2).u64(0)
    return writer.build()
}

/**
 * Trenta strati nella forma di LFM2.5-2.6B: **sei** con attenzione, ventiquattro
 * ricorrenti.
 *
 * ⛔ E' un fixture, non il file vero. Il modello reale ne ha **otto** con cache
 * — misurato sul Pad il 2026-09-10, riga del nativo
 * `KV per-strato: 8 strati su 30 hanno cache, 8 teste`. Qui ne servono sei
 * perche' l'aritmetica sotto resti leggibile a mente; cio' che si prova e' la
 * **regola** (conta i non nulli, prendi il massimo), non quel numero.
 */
const STRATI_LFM2 = [
    0, 0, 8, 0, 0, 8, 0, 0, 0, 8,
    0, 0, 8, 0, 0, 0, 8, 0, 0, 0,
    0, 8, 0, 0, 0, 0, 0, 0, 0, 0,
]

const LFM2: Campo[] = [
    { key: 'general.architecture', type: Type.STRING, value: 'lfm2' },
    { key: 'general.file_type', type: Type.UINT32, value: 2 },
    { key: 'lfm2.block_count', type: Type.UINT32, value: 30 },
    { key: 'lfm2.context_length', type: Type.UINT32, value: 131_072 },
    { key: 'lfm2.embedding_length', type: Type.UINT32, value: 2048 },
    { key: 'lfm2.attention.head_count', type: Type.UINT32, value: 32 },
    {
        key: 'lfm2.attention.head_count_kv',
        type: Type.ARRAY,
        elementType: Type.INT32,
        values: STRATI_LFM2,
    },
]

function formaDi(campi: Campo[]) {
    const esito = talosReadGgufHeader(gguf(campi), 1_593_894_912)
    if (!esito.ok) throw new Error(`intestazione non letta: ${esito.reason}`)
    return esito.header.shape
}

describe('un ibrido letto dal catalogo', () => {
    it('conta SOLO gli strati che hanno davvero una cache', () => {
        // Sei elementi non nulli su trenta: e' la geometria vera del file.
        expect(STRATI_LFM2.filter((n) => n > 0)).toHaveLength(6)
        expect(formaDi(LFM2).layers).toBe(6)
    })

    it('prende il MASSIMO delle teste, non la media né il ripiego su head_count', () => {
        // ⛔ 32 sarebbe `attention.head_count`, cioe' il vecchio ripiego: se
        // questa prova torna 32, l'array non e' stato letto.
        expect(formaDi(LFM2).kvHeads).toBe(8)
    })

    it('⭐ il peso per token scende da 245.760 a 12.288 byte — VENTI volte', () => {
        const forma = formaDi(LFM2)
        expect(forma.headDim).toBe(64)
        expect(talosKvBytesPerTokenOf(forma)).toBe(12_288)
        // Il numero che dicevamo prima, scritto qui perche' la differenza e' il
        // difetto: se qualcuno torna a contare trenta strati e trentadue teste,
        // questa riga lo rende evidente invece di lasciarlo plausibile.
        expect(30 * 32 * 64 * 2 * 2).toBe(245_760)
        expect(245_760 / talosKvBytesPerTokenOf(forma)).toBe(20)
    })

    it('su un transformer non cambia NIENTE: la stessa risposta di sempre', () => {
        const llama: Campo[] = [
            { key: 'general.architecture', type: Type.STRING, value: 'llama' },
            { key: 'general.file_type', type: Type.UINT32, value: 15 },
            { key: 'llama.block_count', type: Type.UINT32, value: 32 },
            { key: 'llama.context_length', type: Type.UINT32, value: 131_072 },
            { key: 'llama.embedding_length', type: Type.UINT32, value: 4096 },
            { key: 'llama.attention.head_count', type: Type.UINT32, value: 32 },
            { key: 'llama.attention.head_count_kv', type: Type.UINT32, value: 8 },
        ]
        const forma = formaDi(llama)
        expect(forma.layers).toBe(32)
        expect(forma.kvHeads).toBe(8)
    })

    it('⛔ un modello INTERAMENTE ricorrente resta rifiutato, e di proposito', () => {
        // Mamba, RWKV: nessuno strato con cache. Un byte-per-token qui non
        // descrive la memoria, e uno zero renderebbe il tetto del contesto
        // infinito — cioe' farebbe aprire qualunque cosa.
        const mamba: Campo[] = LFM2.map((campo) => (
            campo.key === 'lfm2.attention.head_count_kv'
                ? { ...campo, values: STRATI_LFM2.map(() => 0) } as Campo
                : campo
        ))
        const esito = talosReadGgufHeader(gguf(mamba), 1_000_000_000)
        expect(esito.ok).toBe(false)
        if (esito.ok) return
        expect(esito.reason).toBe('incomplete')
    })

    it('⛔ il vocabolario NON si legge: sopra il tetto si scavalca come prima', () => {
        // 128.000 stringhe nell'intestazione sono la ragione del tetto. Se
        // qualcuno lo togliesse, questa prova non diventerebbe rossa — ma la
        // posizione dopo l'array deve restare giusta, e questo lo prova: i
        // campi DOPO il vocabolario si leggono ancora.
        const conVocabolario: Campo[] = [
            LFM2[0]!,
            {
                key: 'tokenizer.ggml.tokens',
                type: Type.ARRAY,
                elementType: Type.STRING,
                values: ['a', 'bb', 'ccc'],
            },
            ...LFM2.slice(1),
        ]
        expect(formaDi(conVocabolario).layers).toBe(6)
    })
})
