import { describe, expect, it } from 'vitest'
import { parseTalosPublicLinks } from './talosPublicLinks'

describe('parseTalosPublicLinks', () => {
    it('parses https links and rejects malformed, credentialed, non-http, whitespace and absent values', () => {
        expect(parseTalosPublicLinks({
            avmDeepDive: 'https://github.com/example/avm#deep-dive',
            patreon: 'https://patreon.com/talos',
            kofi: 'https://ko-fi.com/talos?ref=intro',
        })).toEqual({
            avmDeepDive: 'https://github.com/example/avm#deep-dive',
            patreon: 'https://patreon.com/talos',
            kofi: 'https://ko-fi.com/talos?ref=intro',
        })

        expect(parseTalosPublicLinks({
            avmDeepDive: 'http://github.com/example',
            patreon: 'javascript:alert(1)',
            kofi: 'ftp://ko-fi.com/talos',
        })).toEqual({})

        expect(parseTalosPublicLinks({
            avmDeepDive: 'https://user:pass@github.com/example',
            patreon: 'https://token@patreon.com/talos',
            kofi: 'https://ko-fi.com/talos',
        })).toEqual({ kofi: 'https://ko-fi.com/talos' })

        expect(parseTalosPublicLinks({
            avmDeepDive: ' https://github.com/example',
            patreon: 'https://patreon.com/ta los',
            kofi: 'https://ko-fi.com/talos\n',
        })).toEqual({})

        expect(parseTalosPublicLinks({
            avmDeepDive: 'not a url',
            patreon: '',
            kofi: undefined,
        })).toEqual({})

        expect(parseTalosPublicLinks(null)).toEqual({})
        expect(parseTalosPublicLinks('https://github.com')).toEqual({})
        expect(parseTalosPublicLinks(['https://github.com'])).toEqual({})
        expect(parseTalosPublicLinks({ unrelated: 'https://github.com' })).toEqual({})
    })
})
