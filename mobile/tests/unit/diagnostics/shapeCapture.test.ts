import { describe, expect, it } from 'vitest'
import { talosDescribeShape, talosDescribeSchemaIssues } from '@/lib/diagnostics/shapeCapture'

/**
 * The instrument the owner asked for on 2026-07-30: every failure has to
 * describe itself the first time it happens, without anyone having predicted
 * it.
 *
 * His Doctor export said `4 sends failed` and `issues: []`. The reason each one
 * failed had been thrown away before it could be recorded, so the report that
 * exists to settle the question could not answer it, and the transcript had to
 * arrive separately before anything could be diagnosed.
 *
 * The whole thing rests on one invariant: record the SHAPE, never the content.
 * That is what makes the capture safe enough to leave on permanently for every
 * user, rather than behind a debug switch nobody turns on before they have the
 * problem. These tests are that invariant, so they are written adversarially —
 * a payload stuffed with the things that must never escape.
 */
describe('talosDescribeShape', () => {
    it('names the keys and their types, and no value of any kind', () => {
        expect(talosDescribeShape({ model: 'claude-live', tokens: 4096, ok: true }))
            .toBe('{model:string, ok:boolean, tokens:number}')
    })

    it('never lets a string, a number or a boolean through', () => {
        const described = talosDescribeShape({
            apiKey: 'sk-ant-secret-value',
            prompt: 'the private thing the user typed',
            balance: 1234.56,
            admin: true,
        })

        expect(described).not.toContain('sk-ant')
        expect(described).not.toContain('private')
        expect(described).not.toContain('1234')
        expect(described).not.toContain('true')
        expect(described).toContain('apiKey:string')
        expect(described).toContain('balance:number')
    })

    it('describes an array by its length and its first element, not its items', () => {
        expect(talosDescribeShape({ content: [{ type: 'text', text: 'segreto' }] }))
            .toBe('{content:[1×{text:string, type:string}]}')
        expect(talosDescribeShape({ items: [] })).toBe('{items:[]}')
    })

    it('reports a missing key by its absence, and null as null', () => {
        expect(talosDescribeShape({ text: null })).toBe('{text:null}')
        expect(talosDescribeShape({})).toBe('{}')
    })

    it('stops at a bounded depth instead of walking a whole payload', () => {
        const deep = { a: { b: { c: { d: { e: { f: 'too far' } } } } } }
        const described = talosDescribeShape(deep)

        expect(described).not.toContain('too far')
        expect(described).toContain('…')
    })

    it('stops after a bounded number of keys', () => {
        const wide: Record<string, string> = {}
        for (let index = 0; index < 200; index += 1) wide[`key${index}`] = 'value'
        const described = talosDescribeShape(wide)

        expect(described).not.toContain('value')
        expect(described).toContain('…')
        expect(described.length).toBeLessThanOrEqual(400)
    })

    /**
     * A key can carry user data — an error object keyed by the text that failed
     * validation, for instance. Keys are the one place content can leak through
     * a shape, so they are truncated too.
     */
    it('truncates a key long enough to be carrying content rather than naming a field', () => {
        const smuggled = { ['the user typed all of this into a field name somehow and it is long']: 1 }
        const described = talosDescribeShape(smuggled)

        expect(described).not.toContain('somehow')
        expect(described).toContain('…')
    })

    it('survives a circular structure instead of hanging on it', () => {
        const circular: Record<string, unknown> = { name: 'x' }
        circular.self = circular

        expect(() => talosDescribeShape(circular)).not.toThrow()
        expect(talosDescribeShape(circular)).toContain('circular')
    })

    it('describes what is not an object at all', () => {
        expect(talosDescribeShape('a whole response that was a string')).toBe('string')
        expect(talosDescribeShape(null)).toBe('null')
        expect(talosDescribeShape(undefined)).toBe('undefined')
        expect(talosDescribeShape(42)).toBe('number')
    })
})

/**
 * The other half of the diagnosis: not only what ARRIVED, but what the schema
 * wanted. Zod already knows — the answer was simply discarded.
 */
describe('talosDescribeSchemaIssues', () => {
    it('reports the path and the rule, never the value that broke it', () => {
        const described = talosDescribeSchemaIssues([
            { path: ['content', 0, 'text'], code: 'invalid_type', message: 'Expected string, received 42' },
            { path: ['usage'], code: 'invalid_type', message: 'whatever' },
        ])

        expect(described).toBe('content.0.text:invalid_type, usage:invalid_type')
        // The message can quote the offending value, so it never travels.
        expect(described).not.toContain('42')
        expect(described).not.toContain('Expected')
    })

    it('is bounded, because a bad payload can produce hundreds of issues', () => {
        const many = Array.from({ length: 100 }, (_, index) => ({
            path: ['field', index],
            code: 'invalid_type',
            message: 'x',
        }))
        const described = talosDescribeSchemaIssues(many)

        expect(described).toContain('…')
        expect(described.length).toBeLessThanOrEqual(300)
    })

    it('says so plainly when there is nothing to report', () => {
        expect(talosDescribeSchemaIssues([])).toBe('none')
    })
})
