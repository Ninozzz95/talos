// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosMobileChatOptionsMenu from '@/components/shell/TalosMobileChatOptionsMenu.vue'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — «Compatta ora» nel menu della chat chiede conferma (owner, desktop 24/09 notte:
 * «guardare non compatta mai, Compatta ora chiede conferma»; decisione 4 del 02/10: «"Compatta ora" nel menu con conferma»).
 */
afterEach(() => { document.body.innerHTML = '' })

function monta(canCompact: boolean) {
    return mount(TalosMobileChatOptionsMenu, {
        props: { activeTitle: 'Chat lunga', busy: false, canGoIncognito: false, canCompact },
        attachTo: document.body,
    })
}

async function apriMenu(menu: ReturnType<typeof monta>) {
    const pulsanti = menu.findAll('button')
    await pulsanti[0]!.trigger('click')
    await flushPromises()
}

describe('P4-ter passo 2 — «Compatta ora» dal menu della chat', () => {
    it('CHAT-COMP-UI-06 la voce apre la conferma; niente parte finché non si sceglie «Compatta ora»', async () => {
        const menu = monta(true)
        await apriMenu(menu)
        await menu.get('[data-testid="talos-chat-options-compact"]').trigger('click')
        await flushPromises()
        expect(menu.emitted('compact')).toBeUndefined()
        const conferma = document.querySelector<HTMLButtonElement>('[data-testid="talos-compact-confirm"]')
        expect(conferma).not.toBeNull()
        conferma!.click()
        await flushPromises()
        expect(menu.emitted('compact')).toHaveLength(1)
        expect(document.querySelector('[data-testid="talos-compact-confirm"]')).toBeNull()
    })

    it('CHAT-COMP-UI-08 la catena è collegata: le due testate portano la voce ad App, la chat porta barra e «Annulla» allo store', () => {
        const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), 'utf8')
        const app = leggi('src/App.vue')
        expect(app.match(/:can-compact="!activeChatIsEmpty"/g)).toHaveLength(2)
        expect(app.match(/@compact="compattaChatAttiva"/g)).toHaveLength(2)
        expect(app).toContain('chatController.chat.compattaOra(sessionId)')
        // Owner 02/10 «Almeno il 30%»: il pulsante dice perché non ha compattato.
        expect(app).toContain("esito.motivo === 'niente-da-guadagnare'")
        expect(app).toContain("'chat.compaction.nothingToGain'")
        const schermo = leggi('src/screens/ChatScreen.vue')
        expect(schermo).toContain(':compattazione-in-corso=')
        expect(schermo).toContain('@undo-compaction="annullaCompattazione"')
        expect(schermo).toContain('chat.annullaCompattazione(sessionId, at)')
    })

    it('CHAT-COMP-UI-07 una chat senza niente da compattare non mostra la voce', async () => {
        const menu = monta(false)
        await apriMenu(menu)
        expect(menu.find('[data-testid="talos-chat-options-compact"]').exists()).toBe(false)
    })
})
