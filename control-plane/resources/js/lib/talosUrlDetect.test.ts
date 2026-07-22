import { describe, expect, it } from 'vitest'
import { talosFirstUrl, talosUrlHost } from './talosUrlDetect'

describe('talosFirstUrl', () => {
    it('extracts the first explicit http(s) URL from text', () => {
        expect(talosFirstUrl('please check https://example.com/report before sending')).toBe('https://example.com/report')
        expect(talosFirstUrl('http://localhost:8088/dash')).toBe('http://localhost:8088/dash')
    })

    it('trims trailing sentence punctuation', () => {
        expect(talosFirstUrl('see https://example.com/page.')).toBe('https://example.com/page')
        expect(talosFirstUrl('(https://example.com)')).toBe('https://example.com/')
    })

    it('never fires on non-URL text (no scheme, bare domains, prose)', () => {
        expect(talosFirstUrl('just some regular text here')).toBeNull()
        expect(talosFirstUrl('visit example.com for details')).toBeNull()
        expect(talosFirstUrl('www.example.com')).toBeNull()
        expect(talosFirstUrl('')).toBeNull()
        expect(talosFirstUrl(null)).toBeNull()
    })
})

describe('talosUrlHost', () => {
    it('returns the host of a URL', () => {
        expect(talosUrlHost('https://example.com/deep/path?q=1')).toBe('example.com')
        expect(talosUrlHost('http://localhost:8088/x')).toBe('localhost:8088')
    })
})
