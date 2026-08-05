// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

/**
 * Owner 2026-07-26: "dal pulsante più e il pulsante microfono venisse eliminato
 * il container, vorrei che ci fosse solo l'icona — però quando il pulsante
 * microfono diventa send viene mantenuto esattamente così con il container."
 *
 * So the boundary is the point of this file. Bare icon for the two RESTING
 * controls; the filled pill stays for send, and for stop and dictating, because
 * those are states where the button is the thing you are about to press or the
 * thing you must be able to find in a hurry.
 *
 * The touch target does NOT change. Removing a border is a visual choice;
 * shrinking a 44px target is an accessibility regression, and the project
 * enforces 44px elsewhere already.
 */
describe('composer icon buttons', () => {
    /** Every `<Button …>` opening tag that carries the given aria-label. */
    function buttonsLabelled(source: string, label: string): string[] {
        const found: string[] = []
        for (const match of source.matchAll(/<Button\b[\s\S]*?>/g)) {
            if (match[0].includes(`aria-label="${label}"`)) found.push(match[0])
        }
        return found
    }

    async function composerSource(): Promise<string> {
        const module = await import('@/components/chat/TalosMobileComposer.vue?raw')
        return module.default as unknown as string
    }

    it('the plus button is a bare icon, with no container', async () => {
        const buttons = buttonsLabelled(await composerSource(), "$t('chat.addToChat')")
        expect(buttons.length).toBeGreaterThan(0)
        for (const button of buttons) {
            expect(button, button).not.toContain('variant="outline"')
            expect(button, button).toContain('variant="ghost"')
        }
    })

    it('the microphone is bare, and send KEEPS its container', async () => {
        const source = await composerSource()
        const mic = /rightAction === 'mic'\s*\?\s*'([^']*)'/.exec(source)?.[1] ?? ''
        expect(mic, `the mic branch still styles a container: ${mic}`).not.toMatch(/\bborder\b|\bbg-/)

        // Send, stop and dictating are unchanged: those are the states where the
        // control is either about to be pressed or must be findable in a hurry.
        const rest = /rightAction === 'mic'[\s\S]*?:\s*'([^']*)'/.exec(source)?.[1] ?? ''
        expect(rest).toContain('bg-[var(--talos-accent')
    })

    it('keeps the 44px touch target on both controls', async () => {
        const source = await composerSource()
        // Removing a border is a visual choice; shrinking a 44px target is an
        // accessibility regression, and this project enforces 44px elsewhere.
        for (const button of buttonsLabelled(source, "$t('chat.addToChat')")) {
            expect(button, button).toContain('min-h-touch')
        }
        expect(source).toMatch(/rightActionLabel[\s\S]{0,400}?min-h-touch/)
    })
})
