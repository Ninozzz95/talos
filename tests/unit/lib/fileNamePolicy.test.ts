import { describe, expect, it } from 'vitest'
import { talosSafeFileStem } from '@/lib/fileNamePolicy'

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

function hasUnpairedSurrogate(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1)
            if (next < 0xdc00 || next > 0xdfff) return true
            index += 1
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return true
        }
    }
    return false
}

describe('generated filename policy', () => {
    it('P2-FILENAME-01 keeps extended grapheme clusters whole under a UTF-8 budget', async () => {
        const family = '👨‍👩‍👧‍👦'
        const exact = await talosSafeFileStem(`${'a'.repeat(35)}${family}tail`, 60, 'file')
        const overflow = await talosSafeFileStem(`${'a'.repeat(36)}${family}tail`, 60, 'file')
        const keycap = await talosSafeFileStem(`${'a'.repeat(53)}1️⃣tail`, 60, 'file')
        const flag = await talosSafeFileStem(`${'a'.repeat(52)}🇮🇹tail`, 60, 'file')
        const accent = await talosSafeFileStem(`${'a'.repeat(58)}e\u0301tail`, 60, 'file')

        expect(exact).toBe(`${'a'.repeat(35)}${family}`)
        expect(overflow).toBe('a'.repeat(36))
        expect(keycap).toBe(`${'a'.repeat(53)}1️⃣`)
        expect(flag).toBe(`${'a'.repeat(52)}🇮🇹`)
        expect(accent).toBe(`${'a'.repeat(58)}é`)
        for (const value of [exact, overflow, keycap, flag, accent]) {
            expect(utf8Bytes(value)).toBeLessThanOrEqual(60)
            expect(hasUnpairedSurrogate(value)).toBe(false)
        }
    })

    it('P2-FILENAME-02 normalizes before filtering separators and unsafe controls', async () => {
        await expect(talosSafeFileStem(
            '  Report／Q3\u202E  👨‍👩‍👧‍👦  ',
            80,
            'file',
        )).resolves.toBe('Report Q3 👨‍👩‍👧‍👦')
        await expect(talosSafeFileStem('\ud83d', 20, 'fallback')).resolves.toBe('fallback')
    })

    it('P2-FILENAME-06 keeps compatible ASCII names and fallback behavior', async () => {
        await expect(talosSafeFileStem(
            'Fattura 11/2026: "urgente" \\ finale',
            80,
            'document',
        )).resolves.toBe('Fattura 11 2026 urgente finale')
        await expect(talosSafeFileStem(' /:*?<>| ', 20, 'image')).resolves.toBe('image')
    })
})
