import { describe, expect, it, vi } from 'vitest'
import {
    STAGE_CHUNK_BYTES,
    saveTalosVaultFileToDevice,
    talosSafeExportName,
    talosStageInChunks,
    type TalosDeviceFileSaveRuntime,
} from '@/services/saveVaultFileToDevice'

const FILE = {
    displayName: 'report.pdf',
    mediaType: 'application/pdf',
    bytes: new Uint8Array([1, 2, 3]),
}

function runtime(
    overrides: Partial<TalosDeviceFileSaveRuntime> = {},
): TalosDeviceFileSaveRuntime {
    return {
        isNative: () => true,
        stage: vi.fn(async () => ({
            path: 'talos-export/random.bin',
            sourceUri: 'file:///app/cache/talos-export/random.bin',
        })),
        remove: vi.fn(async () => undefined),
        saveNative: vi.fn(async () => ({
            saved: true,
            bytesWritten: FILE.bytes.byteLength,
            displayName: FILE.displayName,
        })),
        startWebDownload: vi.fn(async () => undefined),
        ...overrides,
    }
}

describe('saveTalosVaultFileToDevice', () => {
    it('stages native bytes, verifies the copied byte count, and always removes cache', async () => {
        const deps = runtime()

        await expect(saveTalosVaultFileToDevice(FILE, deps)).resolves.toEqual({
            status: 'saved',
            bytesWritten: 3,
            displayName: 'report.pdf',
            delivery: 'android-saf',
        })

        expect(deps.stage).toHaveBeenCalledWith(expect.objectContaining({
            bytes: FILE.bytes,
            displayName: 'report.pdf',
            mediaType: 'application/pdf',
        }))
        expect(deps.saveNative).toHaveBeenCalledWith({
            sourceUri: 'file:///app/cache/talos-export/random.bin',
            displayName: 'report.pdf',
            mediaType: 'application/pdf',
            expectedBytes: 3,
        })
        expect(deps.remove).toHaveBeenCalledWith('talos-export/random.bin')
    })

    it('treats Android picker cancellation as cancellation, never success', async () => {
        const deps = runtime({
            saveNative: vi.fn(async () => ({ saved: false })),
        })

        await expect(saveTalosVaultFileToDevice(FILE, deps)).resolves.toEqual({
            status: 'cancelled',
            delivery: 'android-saf',
        })
        expect(deps.remove).toHaveBeenCalledOnce()
    })

    it('fails closed on a native byte-count mismatch and still removes cache', async () => {
        const deps = runtime({
            saveNative: vi.fn(async () => ({
                saved: true,
                bytesWritten: 2,
                displayName: 'report.pdf',
            })),
        })

        await expect(saveTalosVaultFileToDevice(FILE, deps))
            .rejects.toThrow('TALOS_FILE_EXPORT_SIZE_MISMATCH')
        expect(deps.remove).toHaveBeenCalledOnce()
    })

    it('removes the staged copy when the native adapter fails', async () => {
        const deps = runtime({
            saveNative: vi.fn(async () => {
                throw new Error('TALOS_FILE_EXPORT_FAILED')
            }),
        })

        await expect(saveTalosVaultFileToDevice(FILE, deps))
            .rejects.toThrow('TALOS_FILE_EXPORT_FAILED')
        expect(deps.remove).toHaveBeenCalledOnce()
    })

    it('allows only one system save operation at a time', async () => {
        let release!: () => void
        const nativeResult = new Promise<{
            saved: true
            bytesWritten: number
            displayName: string
        }>((resolve) => {
            release = () => resolve({
                saved: true,
                bytesWritten: 3,
                displayName: 'report.pdf',
            })
        })
        const deps = runtime({
            saveNative: vi.fn(() => nativeResult),
        })

        const first = saveTalosVaultFileToDevice(FILE, deps)
        await vi.waitFor(() => expect(deps.saveNative).toHaveBeenCalledOnce())
        await expect(saveTalosVaultFileToDevice(FILE, deps))
            .rejects.toThrow('TALOS_FILE_EXPORT_BUSY')

        release()
        await expect(first).resolves.toMatchObject({ status: 'saved' })
    })

    it('uses an honest browser-started result off native', async () => {
        const deps = runtime({ isNative: () => false })

        await expect(saveTalosVaultFileToDevice(FILE, deps)).resolves.toEqual({
            status: 'started',
            bytesWritten: 3,
            displayName: 'report.pdf',
            delivery: 'browser-download',
        })
        expect(deps.startWebDownload).toHaveBeenCalledWith(expect.objectContaining({
            bytes: FILE.bytes,
            displayName: 'report.pdf',
        }))
        expect(deps.stage).not.toHaveBeenCalled()
        expect(deps.saveNative).not.toHaveBeenCalled()
    })

    it('normalizes unsafe display names without losing the extension', () => {
        expect(talosSafeExportName('  ../Q2:*? report.PDF  ')).toBe('Q2 report.PDF')
        expect(talosSafeExportName('safe\u202Efdp\u2066.pdf')).toBe('safefdp.pdf')
        expect(talosSafeExportName('////')).toBe('file')
    })

    it('never splits a UTF-16 surrogate pair at the bounded stem', () => {
        const prefix = 'a'.repeat(175)
        const safe = talosSafeExportName(`${prefix}😀tail.pdf`)

        expect(safe).toBe(`${prefix}.pdf`)
        expect(safe.length).toBeLessThanOrEqual(180)
    })

    it('EXPORT-NAME-EGC-01 never retains half a flag at the bounded stem', () => {
        const prefix = 'a'.repeat(174)
        const safe = talosSafeExportName(`${prefix}🇮🇹tail.pdf`)

        expect(safe).toBe(`${prefix}.pdf`)
        expect(safe).not.toContain('🇮')
        expect(safe.length).toBeLessThanOrEqual(180)
    })

    it('EXPORT-NAME-EGC-03 preserves meaningful ZWJ and ZWNJ clusters', () => {
        expect(talosSafeExportName('family-👨‍👩‍👧‍👦.png'))
            .toBe('family-👨‍👩‍👧‍👦.png')
        expect(talosSafeExportName('نامه\u200cها.txt')).toBe('نامه\u200cها.txt')
    })
})

describe('talosStageInChunks', () => {
    function scrittore() {
        const pezzi: Array<{ modo: 'write' | 'append', data: string }> = []
        return {
            pezzi,
            write: async (data: string) => { pezzi.push({ modo: 'write', data }) },
            append: async (data: string) => { pezzi.push({ modo: 'append', data }) },
        }
    }

    /** Rimette insieme i pezzi come farebbe il disco: decodifica e concatena. */
    function ricomposto(pezzi: Array<{ data: string }>): Uint8Array {
        const parti = pezzi.map((pezzo) => {
            const binario = atob(pezzo.data)
            return Uint8Array.from(binario, (carattere) => carattere.charCodeAt(0))
        })
        const totale = parti.reduce((somma, parte) => somma + parte.byteLength, 0)
        const fuori = new Uint8Array(totale)
        let scritto = 0
        for (const parte of parti) { fuori.set(parte, scritto); scritto += parte.byteLength }
        return fuori
    }

    it('il primo pezzo crea il file e i successivi si accodano', async () => {
        const w = scrittore()
        await talosStageInChunks(new Uint8Array(25), w, 6)

        expect(w.pezzi.map((pezzo) => pezzo.modo)).toEqual([
            'write', 'append', 'append', 'append', 'append',
        ])
    })

    it('rimesso insieme, il file e byte per byte quello di partenza', async () => {
        // Lunghezza NON multipla del pezzo: l'ultimo blocco e' quello corto.
        const originale = new Uint8Array(5_000)
        for (let indice = 0; indice < originale.length; indice += 1) {
            originale[indice] = (indice * 7 + 13) % 256
        }

        const w = scrittore()
        await talosStageInChunks(originale, w, 300)

        expect(ricomposto(w.pezzi)).toEqual(originale)
    })

    it('solo l ultimo pezzo puo portare riempimento', async () => {
        const w = scrittore()
        // 3.001 byte: i pezzi da 300 sono pieni, l'ultimo e' di 1 byte.
        await talosStageInChunks(new Uint8Array(3_001), w, 300)

        const conRiempimento = w.pezzi
            .map((pezzo, indice) => ({ indice, riempito: pezzo.data.includes('=') }))
            .filter((riga) => riga.riempito)
            .map((riga) => riga.indice)
        expect(conRiempimento).toEqual([w.pezzi.length - 1])
    })

    it('un file vuoto viene comunque creato', async () => {
        const w = scrittore()
        await talosStageInChunks(new Uint8Array(0), w, 300)

        expect(w.pezzi).toEqual([{ modo: 'write', data: '' }])
    })

    it('la misura scelta e un multiplo di 3, o base64 spezzerebbe i byte', () => {
        expect(STAGE_CHUNK_BYTES % 3).toBe(0)
    })
})
