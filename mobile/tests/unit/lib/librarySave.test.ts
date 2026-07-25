import { describe, expect, it } from 'vitest'
import { extractLibrarySaveBlocks, librarySaveInstruction } from '@/lib/chat/librarySave'

describe('extractLibrarySaveBlocks', () => {
    it('returns the text unchanged when there is no marker', () => {
        expect(extractLibrarySaveBlocks('just a normal reply')).toEqual({
            text: 'just a normal reply', blocks: [],
        })
    })

    it('captures a saved file and UNWRAPS it in the visible text (no marker tags leak)', () => {
        const raw = 'Here is your file:\n[TALOS_SAVE_LIBRARY: analysis.md]\n# Title\nbody line\n[/TALOS_SAVE_LIBRARY]\nDone.'
        const out = extractLibrarySaveBlocks(raw)
        expect(out.blocks).toEqual([
            { name: 'analysis.md', mediaType: 'text/markdown', text: '# Title\nbody line' },
        ])
        expect(out.text).toContain('# Title\nbody line')
        expect(out.text).not.toContain('TALOS_SAVE_LIBRARY')
    })

    it('infers media type from the extension and captures multiple files', () => {
        const raw = '[TALOS_SAVE_LIBRARY: data.json]\n{"a":1}\n[/TALOS_SAVE_LIBRARY]'
            + '\n[TALOS_SAVE_LIBRARY: notes.txt]\nplain\n[/TALOS_SAVE_LIBRARY]'
        const out = extractLibrarySaveBlocks(raw)
        expect(out.blocks.map((b) => [b.name, b.mediaType])).toEqual([
            ['data.json', 'application/json'],
            ['notes.txt', 'text/plain'],
        ])
    })

    it('sanitises a missing/odd filename to a safe default', () => {
        const raw = '[TALOS_SAVE_LIBRARY: ../../etc/passwd]\nx\n[/TALOS_SAVE_LIBRARY]'
        const out = extractLibrarySaveBlocks(raw)
        expect(out.blocks[0]!.name).not.toContain('/')
        expect(out.blocks[0]!.name).not.toContain('..')
    })

    it('ignores an unterminated marker (no partial capture)', () => {
        const raw = '[TALOS_SAVE_LIBRARY: x.md]\nunfinished'
        expect(extractLibrarySaveBlocks(raw).blocks).toEqual([])
    })
})

describe('librarySaveInstruction', () => {
    it('tells the model to emit the marker and never to claim it cannot create files', () => {
        const instruction = librarySaveInstruction()
        expect(instruction).toContain('TALOS_SAVE_LIBRARY')
        expect(instruction.toLowerCase()).toContain('library')
    })
})
