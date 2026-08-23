import { describe, expect, it } from 'vitest'
import {
    talosEngineTuning,
    talosPreferFewerThreads,
    talosStrongCores,
} from '@/lib/models/engineTuning'

/**
 * Quanti thread dare al prefill e quanti alla generazione.
 *
 * Il motore apriva ogni modello con `n_threads = 4` — una costante — e
 * `n_threads_batch` uguale a `n_threads`, cioè lo stesso numero per due carichi
 * opposti. Sul Pad significava metà chip fermo durante il prefill.
 *
 * MISURATO sul OnePlus Pad 3 il 2026-08-06: otto core, sei a capacità 792 e due
 * a 1024. Non è il classico big.LITTLE — **non c'è un core lento** — ed è la
 * ragione per cui la topologia si legge invece di dedurla dal nome del chip.
 */
const PAD3 = { cores: 8, capacities: [792, 792, 792, 792, 792, 792, 1024, 1024] }

describe('leggere la forma della CPU', () => {
    it('sul Pad riconosce due core forti, non quattro lenti', () => {
        expect(talosStrongCores(PAD3)).toBe(2)
    })

    /**
     * Un chip omogeneo non ha due categorie, e inventargliele produrrebbe una
     * distinzione che a valle non significa niente.
     */
    it('su un chip omogeneo sono tutti forti', () => {
        expect(talosStrongCores({ cores: 4, capacities: [1024, 1024, 1024, 1024] })).toBe(4)
    })

    /**
     * Alcuni kernel non espongono `cpu_capacity`. Sapere solo quanti sono è
     * un'informazione parziale, non un errore: si torna il totale.
     */
    it('se il kernel tace, si sa solo quanti sono', () => {
        expect(talosStrongCores({ cores: 6, capacities: [] })).toBe(6)
    })
})

describe('da dove partire, prima di aver misurato', () => {
    it('sul Pad il prefill prende sette core e la generazione quattro', () => {
        const t = talosEngineTuning(PAD3)
        expect(t.threadsBatch).toBe(7)
        expect(t.threads).toBe(4)
    })

    /**
     * ⛔ Il difetto originale, in una riga: i due numeri erano lo stesso.
     * Il prefill macina matrici e si spalma; la generazione fa un token per
     * volta ed è legata alla banda di memoria.
     */
    it('i due numeri non sono mai lo stesso, quando c\'è spazio perché differiscano', () => {
        for (const cores of [4, 6, 8, 12, 16]) {
            const t = talosEngineTuning({ cores, capacities: [] })
            expect(t.threadsBatch).toBeGreaterThan(t.threads)
        }
    })

    /**
     * Quell'ultimo core non è prudenza generica: mentre il modello macina,
     * l'interfaccia deve continuare a rispondere al dito.
     */
    it('lascia sempre un core al sistema', () => {
        expect(talosEngineTuning({ cores: 8, capacities: [] }).threadsBatch).toBe(7)
        expect(talosEngineTuning({ cores: 16, capacities: [] }).threadsBatch).toBe(15)
    })

    it('su un dispositivo minuscolo non chiede più di quello che c\'è', () => {
        const t = talosEngineTuning({ cores: 2, capacities: [] })
        expect(t.threadsBatch).toBeLessThanOrEqual(2)
        expect(t.threads).toBeLessThanOrEqual(2)
        expect(t.threads).toBeGreaterThanOrEqual(1)
        expect(t.candidates.every((n) => n <= 2)).toBe(true)
    })

    it('un core solo non produce zero thread', () => {
        const t = talosEngineTuning({ cores: 1, capacities: [1024] })
        expect(t.threads).toBeGreaterThanOrEqual(1)
        expect(t.threadsBatch).toBeGreaterThanOrEqual(1)
    })

    /**
     * ⭐⭐⭐ Il microbatch è l'attesa massima dello Stop, e la SOGLIA è misurata -
     * due volte, prima e dopo la cura dell'abort del 21/8.
     *
     * Prompt da 2.048 token, Stop premuto dopo 200 ms:
     *
     * ```
     * PRIMA della cura (20/8, Adreno 830)
     *   512   1.443 ms   si ferma a 512/2048 - completa il pezzo intero
     *   256   1.446 ms   idem
     *   192    ~460 ms   morde a meta'
     *
     * DOPO la cura (23/8, Qwen3-1.7B/OpenCL) - la mediana, non un singolo giro
     *   512      7 ms
     *   256      5 ms
     *   192      2 ms
     *   128      1 ms
     * ```
     *
     * ⇒ Il salto che stava **fra 256 e 192** è sparito: la cura ha portato
     * OGNI valore provato a singole cifre di millisecondi. ⛔ Questa prova non
     * difende il numero 512: difende che si resti **al livello che una misura
     * vera ha già raggiunto** - 512, non un valore mai provato sul Pad. Chi un
     * domani vorrà alzarlo oltre dovrà prima spostare la soglia con una nuova
     * misura, non con una supposizione.
     */
    it('il microbatch resta al livello misurato, dove lo Stop non morde più', () => {
        const SOGLIA = 512
        for (const chip of [PAD3, { cores: 4, capacities: [] }, { cores: 32, capacities: [] }]) {
            expect(talosEngineTuning(chip).microBatch).toBeLessThanOrEqual(SOGLIA)
        }
    })

    /**
     * ⛔⛔ E NON scende sotto 512 per inseguire un cancello: quel numero è
     * ORA il livello misurato, non un timore da placare. Scendere a 192 o
     * sotto tornerebbe a pagare fino al 28% di prefill per una latenza di
     * Stop che la cura vera dell'abort porta comunque a millisecondi, senza
     * pagare niente.
     *
     * ⇒ Sarebbe ottimizzare il cancello invece della persona. Se qualcuno
     * abbassa il microbatch senza una nuova misura, questa prova glielo dice.
     */
    it('e non scende sotto il livello misurato, per far tornare un cancello', () => {
        expect(talosEngineTuning(PAD3).microBatch).toBeGreaterThanOrEqual(512)
    })

    it('i candidati da misurare sono pochi, ordinati e senza doppioni', () => {
        const c = talosEngineTuning(PAD3).candidates
        expect(c).toEqual([...new Set(c)])
        expect([...c]).toEqual([...c].sort((a, b) => a - b))
        expect(c.length).toBeLessThanOrEqual(5)
        expect(c).toContain(7)
    })
})

/**
 * Fra due candidati che si equivalgono vince il più basso.
 *
 * Una differenza sotto il 3% su un telefono è rumore — temperatura, un'altra
 * app che si sveglia, lo scheduler che sposta un thread. Fissarla come vittoria
 * significa incidere per sempre una misura che domani sarebbe l'opposto, e il
 * candidato più alto si paga in calore sulle risposte lunghe.
 */
describe('scegliere fra misure che si somigliano', () => {
    const griglia = [
        { threads: 2, prefill: 100, decode: 9.8 },
        { threads: 4, prefill: 180, decode: 10.0 },
        { threads: 7, prefill: 184, decode: 9.1 },
    ]

    it('preferisce meno thread quando il guadagno è rumore', () => {
        // 180 contro 184 sono il 2,2%: non è una vittoria.
        expect(talosPreferFewerThreads(griglia, 'prefill')).toBe(4)
    })

    it('ma non quando la differenza è vera', () => {
        expect(talosPreferFewerThreads([
            { threads: 2, prefill: 100, decode: 5 },
            { threads: 7, prefill: 190, decode: 5 },
        ], 'prefill')).toBe(7)
    })

    it('una griglia vuota o tutta a zero non produce una scelta inventata', () => {
        expect(talosPreferFewerThreads([], 'prefill')).toBeNull()
        expect(talosPreferFewerThreads([{ threads: 4, prefill: 0, decode: 0 }], 'decode')).toBeNull()
    })
})
