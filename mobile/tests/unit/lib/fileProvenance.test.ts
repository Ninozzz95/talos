import { describe, expect, it } from 'vitest'
import {
    talosProvenanceForExport,
    parseTalosFileProvenance,
    type TalosFileProvenance,
} from '@/lib/files/provenance'

/**
 * Famiglia B — il libretto d'origine di un file.
 *
 * Research first, and it decided the field names rather than my taste. IPTC
 * Photo Metadata 2025.1 (November 2025) added exactly the four properties this
 * feature needs — AI System Used, AI System Version Used, AI Prompt
 * Information, AI Prompt Writer Name — alongside DigitalSourceType, whose value
 * for machine-made images is `trainedAlgorithmicMedia`. So the record maps onto
 * a standard that already exists instead of inventing a private vocabulary that
 * nothing else could ever read.
 *
 * Two owner decisions shape everything here:
 *
 * D-02 — only the model and the date travel INSIDE an exported file. The prompt
 * stays in TALOS. A file is handed to people; the prompt is often the most
 * personal thing about it, and it cannot be recalled once it has left.
 *
 * P-05 — the record REFERENCES the message that carried the prompt instead of
 * copying it. A copy would be a second body of personal text to encrypt twice,
 * delete twice and forget twice; a reference dies with the chat, which is the
 * behaviour a reader would expect.
 */
const GENERATED: TalosFileProvenance = {
    schema: 1,
    origin: 'generated',
    createdAt: '2026-07-31T09:15:00.000Z',
    model: 'claude-opus-5',
    provider: 'anthropic',
    modelVersion: null,
    originSessionId: 'chat-7',
    promptMessageId: 'msg-42',
    toolName: null,
    sourceUrl: null,
    perceptualHash: null,
    seal: null,
}

describe('reading a record back', () => {
    it('accepts one it wrote itself', () => {
        expect(parseTalosFileProvenance(GENERATED)).toEqual(GENERATED)
    })

    /**
     * A record is stored as JSON in a metadata bag that anything could have
     * written. Anything unrecognised is not a record — inventing defaults for a
     * corrupt one would produce a confident, wrong history.
     */
    it('refuses what is not a record rather than guessing', () => {
        for (const junk of [null, undefined, 42, 'generated', [], {}, { schema: 99 }]) {
            expect(parseTalosFileProvenance(junk)).toBeNull()
        }
    })

    it('keeps an unknown origin out instead of calling it an upload', () => {
        expect(parseTalosFileProvenance({ ...GENERATED, origin: 'conjured' })).toBeNull()
    })

    /** Fields the record does not know are absent, never invented. */
    it('leaves what it was never told as null', () => {
        const bare = parseTalosFileProvenance({
            schema: 1, origin: 'uploaded', createdAt: GENERATED.createdAt,
        })

        expect(bare?.model).toBeNull()
        expect(bare?.promptMessageId).toBeNull()
        expect(bare?.perceptualHash).toBeNull()
    })
})

describe('what leaves inside an exported file', () => {
    it('carries the model and the date, in the standard’s own fields', () => {
        const out = talosProvenanceForExport(GENERATED)

        expect(out).toMatchObject({
            'Iptc4xmpExt:DigitalSourceType':
                'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
            'Iptc4xmpExt:AISystemUsed': 'claude-opus-5',
            'xmp:CreateDate': '2026-07-31T09:15:00.000Z',
        })
    })

    /**
     * D-02, and the assertion that matters most in this file. The prompt is
     * often the most personal thing about a generated image, and a file is
     * handed to people. Once it has left, it cannot be recalled.
     */
    it('never carries the prompt, nor anything that points at it', () => {
        const out = JSON.stringify(talosProvenanceForExport(GENERATED))

        expect(out).not.toContain('msg-42')
        expect(out).not.toContain('chat-7')
        expect(out.toLowerCase()).not.toContain('prompt')
    })

    /**
     * An uploaded photo is the user's own. Stamping it as machine-made would be
     * a lie told by us, in their file, to whoever they send it to.
     */
    it('says nothing at all about a file the user uploaded', () => {
        const out = talosProvenanceForExport({ ...GENERATED, origin: 'uploaded', model: null })

        expect(out).toBeNull()
    })

    it('states the version when it knows one, and stays quiet when it does not', () => {
        expect(talosProvenanceForExport({ ...GENERATED, modelVersion: '20260714' }))
            .toMatchObject({ 'Iptc4xmpExt:AISystemVersionUsed': '20260714' })
        expect(talosProvenanceForExport(GENERATED))
            .not.toHaveProperty('Iptc4xmpExt:AISystemVersionUsed')
    })
})
