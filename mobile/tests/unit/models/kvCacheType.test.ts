import { describe, expect, it } from 'vitest'
import {
    TALOS_KV_BYTES_PER_ELEMENT,
    talosKvBytesPerElement,
    talosModelShapeOf,
} from '@/services/localEngine'
import { talosMaxContextFor } from '@/lib/models/fit'

/**
 * La cache delle chiavi più leggera, e il conto che la rende utile.
 *
 * ## Perché conta
 *
 * La KV è il secondo consumatore di memoria dopo i pesi, e su un contesto lungo
 * diventa il primo. Per il modello del report — 28 strati, 8 teste KV, testa da
 * 128 — in f16 sono **112 KiB per token**, cioè **1,63 GB a 14.202 token** su un
 * telefono che ne ha 4,5 liberi. Alleggerirla non fa andare più veloce: fa
 * entrare più conversazione nella stessa memoria.
 *
 * ## La trappola che queste prove sorvegliano
 *
 * ⛔ `q8_0` **non è un byte per elemento**: è un blocco da 34 byte ogni 32,
 * cioè 1,0625. L'arrotondamento a 1 sembra pedanteria e non lo è — quel numero
 * moltiplica strati × teste × dimensione × contesto, e sottostimare la cache
 * non produce un errore: produce una chat che si apre e poi muore quando cresce.
 */
const QWEN3_1_7B = {
    layers: 28,
    kvHeads: 8,
    headDim: 128,
    trainedContext: 32_768,
    weightBytes: 1_828_000_000,
}

describe('quanto pesa un elemento della cache', () => {
    it('q8_0 è 34 byte ogni 32, non uno', () => {
        expect(TALOS_KV_BYTES_PER_ELEMENT.q8_0).toBeCloseTo(1.0625, 10)
        expect(TALOS_KV_BYTES_PER_ELEMENT.f16).toBe(2)
    })

    /**
     * Un tipo che non conosciamo è un tipo che non abbiamo chiesto. Sovrastimare
     * la cache è l'errore innocuo dei due: si concede meno contesto del
     * possibile, invece di prometterne più di quanto entri.
     */
    it('quello che non si riconosce vale come f16', () => {
        expect(talosKvBytesPerElement('q4_0')).toBe(2)
        expect(talosKvBytesPerElement(null)).toBe(2)
        expect(talosKvBytesPerElement(undefined)).toBe(2)
        expect(talosKvBytesPerElement('')).toBe(2)
    })

    it('e quello che si riconosce vale il suo peso', () => {
        expect(talosKvBytesPerElement('q8_0')).toBeCloseTo(1.0625, 10)
        expect(talosKvBytesPerElement('f16')).toBe(2)
    })
})

describe('la forma del modello legge il tipo OTTENUTO', () => {
    it('senza dire niente resta la cache pesante', () => {
        expect(talosModelShapeOf(QWEN3_1_7B)?.kvBytesPerElement).toBe(2)
    })

    /**
     * ⛔ Il difetto che questo impedisce: chiedere `q8_0`, ottenere f16 perché
     * il modello non la regge, e continuare a calcolare il tetto come se la
     * cache pesasse la metà. La creazione del contesto è il collaudo, e il suo
     * esito deve arrivare fin qui.
     */
    it('quando il motore dichiara q8_0, il conto lo usa', () => {
        expect(talosModelShapeOf(QWEN3_1_7B, 'q8_0')?.kvBytesPerElement).toBeCloseTo(1.0625, 10)
    })

    it('un ripiego silenzioso non passa: f16 dichiarata pesa come f16', () => {
        expect(talosModelShapeOf(QWEN3_1_7B, 'f16')?.kvBytesPerElement).toBe(2)
    })
})

/**
 * L'esito che interessa a chi usa l'app: quanta conversazione ci sta.
 */
describe('quanto contesto entra, con e senza cache leggera', () => {
    const dispositivo = {
        totalRamBytes: 11_200_000_000,
        availableRamBytes: 4_470_000_000,
        lowMemoryThresholdBytes: 300_000_000,
        freeStorageBytes: 46_000_000_000,
        abiSupported: true,
        thermal: 'none' as const,
        memoryBandwidthBytesPerSecond: null,
    }

    it('la cache leggera fa entrare più conversazione nella stessa memoria', () => {
        const pesante = talosMaxContextFor(talosModelShapeOf(QWEN3_1_7B)!, dispositivo)
        const leggera = talosMaxContextFor(talosModelShapeOf(QWEN3_1_7B, 'q8_0')!, dispositivo)
        expect(pesante).not.toBeNull()
        expect(leggera).not.toBeNull()
        // Un elemento pesa 2 contro 1,0625: il contesto che ci sta cresce di
        // quasi il doppio, ed è tutto il punto dell'esercizio.
        expect(leggera!).toBeGreaterThan(pesante! * 1.5)
    })
})
