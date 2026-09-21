import { describe, expect, it } from 'vitest'
import { loadTalosWelcomeSelection } from '@/lib/welcome/runtime'

describe('TALOS welcome dynamic runtime', () => {
    it('WELCOME-RUNTIME-01 loads the selected locale catalog and returns an aligned deterministic selection', async () => {
        const input = {
            at: new Date(2026, 11, 25, 10, 0, 0),
            seed: 'persisted-session',
        }
        const [english, italian] = await Promise.all([
            loadTalosWelcomeSelection('en', input),
            loadTalosWelcomeSelection('it', input),
        ])

        expect(english).toMatchObject({
            kind: 'specialDate',
            condition: 'christmas_day',
            easterEgg: 'gift',
        })
        expect(italian).toMatchObject({
            kind: 'specialDate',
            condition: 'christmas_day',
            easterEgg: 'gift',
        })
        expect(italian?.index).toBe(english?.index)
        expect(italian?.title).not.toBe(english?.title)
    })
})
