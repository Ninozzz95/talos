import { describe, expect, it } from 'vitest'
import { talosFileOriginCard } from '@/lib/files/originCard'
import type { TalosFileProvenance } from '@/lib/files/provenance'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * Owner decision P-07: «la scheda d'origine è una sezione sempre visibile nel
 * dettaglio del file».
 *
 * ALWAYS visible is the whole design. A card that appears only when the news is
 * good teaches people that its absence means nothing — and then it means
 * nothing when it is absent for a reason that matters. So the "we do not know"
 * state is a first-class answer here, tested first, rather than an empty box
 * that reads as a bug.
 */
const t = talosTestT('en')
const CARD = (provenance: unknown, originSessionTitle: string | null = null) =>
    talosFileOriginCard({ provenance, originSessionTitle, translate: t, locale: 'en-GB' })

const GENERATED: TalosFileProvenance = {
    schema: 1,
    origin: 'generated',
    createdAt: '2026-07-31T09:15:00.000Z',
    model: 'kimi-k3',
    provider: 'moonshotai',
    modelVersion: null,
    originSessionId: 'chat-7',
    promptMessageId: 'msg-42',
    toolName: 'generate_image',
    sourceUrl: null,
    perceptualHash: null,
    seal: null,
}

describe('when there is no record', () => {
    it('says so, instead of showing an empty section', () => {
        const card = CARD(null)

        expect(card.kind).toBe('unknown')
        expect(card.title).toContain('No origin recorded')
        expect(card.lines.length).toBeGreaterThan(0)
    })

    /**
     * The two reasons are BOTH innocent, and the card must not imply a defect.
     * One of them is a promise we made on purpose.
     */
    it('names the two innocent reasons, incognito among them', () => {
        expect(CARD(undefined).lines.join(' ')).toContain('incognito')
    })

    it('treats a corrupt record as no record rather than guessing', () => {
        expect(CARD({ schema: 99, origin: 'generated' }).kind).toBe('unknown')
    })
})

describe('a file a model made', () => {
    /** «Made by TALOS» is not an answer to «made by what?». */
    it('names the model and the provider', () => {
        const card = CARD(GENERATED)

        expect(card.title).toContain('kimi-k3')
        expect(card.title).toContain('moonshotai')
        expect(card.kind).toBe('generated')
    })

    /** Two providers can serve a model with the same name. */
    it('admits when the provider was never recorded', () => {
        const card = CARD({ ...GENERATED, provider: null })

        expect(card.title).toContain('provider unknown')
    })

    it('falls back to "a model" when even the model is missing', () => {
        expect(CARD({ ...GENERATED, model: null }).title).toBe('Made by a model')
    })

    it('gives the date a reader can read, not the one a machine stored', () => {
        const card = CARD(GENERATED)

        expect(card.lines.join(' ')).not.toContain('2026-07-31T09:15')
        expect(card.lines.join(' ')).toMatch(/2026/)
    })

    /** A broken date must not take the whole card down with it. */
    it('survives a date it cannot read', () => {
        const card = CARD({ ...GENERATED, createdAt: 'not a date' })

        expect(card.kind).toBe('generated')
        expect(card.lines.length).toBeGreaterThan(0)
    })

    it('names the chat when that chat still exists, and offers to open it', () => {
        const card = CARD(GENERATED, 'Sei capace di generazione immagini?')

        expect(card.lines.join(' ')).toContain('Sei capace di generazione immagini?')
        expect(card.originSessionId).toBe('chat-7')
    })

    /**
     * A deleted chat leaves the file standing; the card simply says less.
     *
     * And it must not keep OFFERING to open it — found by an adversarial
     * review, 2026-07-31. The button was gated on the id alone, so it outlived
     * the chat: tapping it closed the viewer, navigated nowhere, and flagged the
     * whole chat store as persistence-failed. If we cannot name the chat, we
     * cannot open it either.
     */
    it('says nothing about a chat that is gone, and does not offer to open it', () => {
        const card = CARD(GENERATED, null)

        expect(card.lines.join(' ')).not.toContain('chat-7')
        expect(card.originSessionId).toBeNull()
    })

    /**
     * P-05, at the surface this time: the card is READ BY PEOPLE, and the
     * prompt is often the most personal thing about a generated image. The
     * record references it; the card must not put it on screen.
     */
    it('never shows the prompt reference', () => {
        expect(JSON.stringify(CARD(GENERATED))).not.toContain('msg-42')
    })
})

describe('the other origins', () => {
    it('says a file was brought in by the person', () => {
        const card = CARD({ ...GENERATED, origin: 'uploaded', model: null, provider: null })

        expect(card.title).toContain('Brought in by you')
        expect(card.kind).toBe('uploaded')
    })

    it('shows where a downloaded page came from', () => {
        const card = CARD({
            ...GENERATED, origin: 'downloaded', sourceUrl: 'https://example.org/a',
        })

        expect(card.title).toContain('Downloaded')
        expect(card.lines.join(' ')).toContain('https://example.org/a')
    })
})

/**
 * Found by an adversarial review, 2026-07-31, and proven by running it: the app
 * sets vue-i18n's `escapeParameter`, so an interpolated value has its `/` and
 * `'` turned into HTML entities — and this card renders as TEXT, so the reader
 * sees the entities. Every OpenRouter model id contains a slash, and Italian
 * chat titles routinely contain an apostrophe.
 */
describe('what a reader actually sees', () => {
    it('shows an OpenRouter model id with its slash, not an entity', () => {
        const card = CARD({ ...GENERATED, model: 'anthropic/claude-sonnet-4.5', provider: 'openrouter' })

        expect(card.title).toContain('anthropic/claude-sonnet-4.5')
        expect(card.title).not.toContain('&#')
        expect(card.title).not.toContain('&amp;')
    })

    it('shows a chat title with an apostrophe as written', () => {
        const card = CARD(GENERATED, "Com'è fatto il bilancio 2026")

        expect(card.lines.join(' ')).toContain("Com'è fatto il bilancio 2026")
        expect(card.lines.join(' ')).not.toContain('&#')
    })

    it('shows a URL with its own characters intact', () => {
        const card = CARD({ ...GENERATED, origin: 'downloaded', sourceUrl: 'https://example.org/a?b=1&c=2' })

        expect(card.lines.join(' ')).toContain('https://example.org/a?b=1&c=2')
        expect(card.lines.join(' ')).not.toContain('&amp;')
    })
})

/**
 * The guard that BITES, because the test double above does not escape and so
 * could never have caught the original defect on its own.
 *
 * The rule is structural: these strings take no parameters at all. Re-adding a
 * `{placeholder}` to one of them is what reintroduces the escaping, and it
 * fails here the moment it is written.
 */
describe('the origin strings take no parameters', () => {
    it.each(['it', 'en'])('%s', (locale) => {
        const source = readFileSync(resolve(process.cwd(), `src/i18n/locales/${locale}.ts`), 'utf8')
        const offenders = [...source.matchAll(/^\s+(origin[A-Za-z]*): '([^']*)',$/gm)]
            .filter(([, , value]) => value!.includes('{'))
            .map(([, key]) => key)

        expect(offenders).toEqual([])
    })
})
