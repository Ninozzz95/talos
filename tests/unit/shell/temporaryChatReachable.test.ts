// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Owner 2026-07-31: «se nella chat premo i puntini e clicco su chat temporanea
 * non succede nulla».
 *
 * The menu emitted correctly and App.vue listened correctly. The event died in
 * between: the options menu lives inside TWO intermediate shells — the classic
 * header and the immersive chrome — and neither re-emitted it. Exactly the same
 * shape as the orchestrator dropping `{ ephemeral: true }` one layer down, and
 * caught by nothing for the same reason: every test looked at one end or the
 * other, never at the wire between them.
 *
 * This checks the wire. Both shells mount the menu, so both must forward, and a
 * third shell added later fails here rather than silently swallowing taps.
 */
const SHELLS = [
    'src/components/shell/TalosMobileHeader.vue',
    'src/components/shell/TalosMobileImmersiveChrome.vue',
]

function read(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('every shell that shows the chat menu passes its events on', () => {
    it.each(SHELLS)('%s forwards temporaryChat', (path) => {
        const source = read(path)
        expect(source).toContain('temporaryChat: []')
        expect(source).toContain("@temporary-chat=\"emit('temporaryChat')\"")
    })

    /**
     * The guard has to be about ALL of the menu's events, not the one that
     * happened to break — otherwise the next one to be added dies the same way.
     */
    it.each(SHELLS)('%s forwards every event the menu can emit', (path) => {
        const menu = read('src/components/shell/TalosMobileChatOptionsMenu.vue')
        const emits = [...menu.matchAll(/^\s{4}(\w+):\s*\[/gm)].map((match) => match[1]!)
        const shell = read(path)

        expect(emits.length).toBeGreaterThanOrEqual(4)
        for (const event of emits) {
            const kebab = event.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
            expect(
                shell.includes(`@${kebab}=`) || shell.includes(`@${event}=`),
                `${path} swallows "${event}"`,
            ).toBe(true)
        }
    })
})

/**
 * Owner 2026-07-31: «il pulsante che ho premuto dovrà cambiare in modalità
 * normale». A switch owes you one thing — that pressing it changes what it
 * says. That only works if the STATE reaches the menu, which means through the
 * same two shells that swallowed the event the first time.
 */
describe('the incognito switch reflects the chat it is in', () => {
    it.each(SHELLS)('%s passes the state down and the way back up', (path) => {
        const shell = read(path)

        expect(shell).toContain(':incognito="incognito"')
        expect(shell).toContain("@normal-mode=\"emit('normalMode')\"")
        expect(shell).toContain('normalMode: []')
    })

    it('the menu itself reads the other way when it is already incognito', () => {
        const menu = read('src/components/shell/TalosMobileChatOptionsMenu.vue')

        expect(menu).toContain("chat.normalMode")
        expect(menu).toContain("chat.temporaryChat")
        // The same control, not a second button bolted beside the first.
        expect(menu.match(/data-testid="talos-chat-options-temporary"/g)).toHaveLength(1)
    })
})
