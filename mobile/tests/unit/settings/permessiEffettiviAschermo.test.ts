// @vitest-environment jsdom
/**
 * ⛔ Il pannello dei permessi mostra ciò che VALE, non ciò che è rimasto scritto.
 *
 * ## Il difetto, riferito dall'owner il 2026-08-08
 *
 * Guardava questa schermata sul suo telefono e leggeva **«Consenti sempre»** su
 * tutte e tre le voci. Nelle preferenze c'era davvero
 * `{read: allow, write: allow, outbound: allow}` — valori di un default vecchio
 * che nessuno aveva mai scelto: `tools_chosen` era assente.
 *
 * Ma la chat non li usava. Passa da `effectiveToolPermissions()`, che applica
 * la regola già scritta e già provata in `talosEffectiveToolPermissions`:
 *
 * > «un valore che nessuno ha scelto è il default di OGGI, non quello del
 * > giorno in cui l'app è stata installata»
 *
 * Quindi il modello chiedeva — correttamente — mentre la schermata prometteva
 * che non avrebbe chiesto.
 *
 * ## ⛔ Perché conta, anche se la direzione era innocua
 *
 * Non era un buco di sicurezza: l'app era **più stretta** di come appariva. Ed
 * è proprio questo che lo rendeva difficile da scoprire — nessuno si lamenta di
 * un permesso in meno. Ma le due facce del difetto sono entrambe brutte:
 *
 * - chi legge «sempre» e si vede comparire una richiesta pensa che l'app sia
 *   rotta, e impara a non fidarsi delle schermate;
 * - e il giorno in cui la differenza andasse nell'altro verso, si fiderebbe di
 *   un permesso che non ha.
 *
 * Un pannello dei permessi ha **un solo lavoro**: dire la verità su cosa
 * succede. Questo test è quel lavoro, scritto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { talosEffectiveToolPermissions } from '@/lib/tools/permissionTypes'

const settings = vi.hoisted(() => ({
    state: {
        // ⛔ ESATTAMENTE ciò che c'era sul telefono dell'owner: tre `allow`
        // ereditati, e nessuna scelta registrata.
        tools: { read: 'allow', write: 'allow', outbound: 'allow' },
        tools_chosen: [] as string[],
        // Motore scelto: qui si prova cosa DICONO i tre permessi, e senza
        // motore le righe web aggiungerebbero un avviso che qui non c'entra.
        search: { source: 'tavily' as string | null },
        agent_tools: {},
        tool_authorizations: { schema_version: 1, revision: 0, grants: {} },
    },
    effectiveToolPermissions: () => talosEffectiveToolPermissions({
        stored: settings.state.tools as never,
        chosen: settings.state.tools_chosen as never,
    }),
    setToolPermissions: vi.fn(async () => {}),
    setAgentToolEnabled: vi.fn(async () => {}),
    revokeToolAuthorization: vi.fn(async () => {}),
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAgentToolsPanel from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'

beforeEach(() => {
    settings.state.tools = { read: 'allow', write: 'allow', outbound: 'allow' }
    settings.state.tools_chosen = []
})

/**
 * ⛔ `findComponent` e non `get`: si legge la proprietà che il pannello PASSA
 * al selettore, non il testo che il selettore disegna.
 *
 * È la differenza fra provare la nostra decisione e provare la resa grafica di
 * un componente altrui — e qui la decisione è tutto ciò che ci interessa.
 */
function valoreMostrato(wrapper: ReturnType<typeof mount>, azione: string): unknown {
    return wrapper
        .findComponent(`[data-testid="talos-tool-permission-${azione}"]`)
        .props('modelValue')
}

describe('i permessi a schermo', () => {
    it('PERMESSI-SCHERMO-01 mostra il default di OGGI su ciò che nessuno ha scelto', async () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        await flushPromises()

        // Memorizzato «allow», ma nessuno l'ha scelto ⇒ a schermo vale «ask»,
        // che è ciò che il modello incontra davvero.
        for (const azione of ['read', 'write', 'outbound']) {
            expect(valoreMostrato(wrapper, azione), azione).toBe('ask')
        }
    })

    it('PERMESSI-SCHERMO-02 una scelta VERA resta, e si vede', async () => {
        /*
         * L'altra metà, senza la quale la correzione sarebbe peggiore del
         * difetto: chi ha deciso «consenti sempre» deve continuare a leggerlo.
         * Toccare un permesso è sceglierlo, e da lì in poi l'app non lo rivede.
         */
        settings.state.tools_chosen = ['outbound']
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        await flushPromises()

        expect(valoreMostrato(wrapper, 'outbound')).toBe('allow')
        expect(valoreMostrato(wrapper, 'read')).toBe('ask')
        expect(valoreMostrato(wrapper, 'write')).toBe('ask')
    })

    it('PERMESSI-SCHERMO-03 morde: col valore memorizzato si leggerebbe «allow»', () => {
        /*
         * La prova che i due casi sopra non passano per costruzione. È lo stato
         * in cui si trovava il pannello quando l'owner l'ha guardato: leggeva
         * `state.tools` invece dell'effettivo.
         */
        expect(settings.state.tools.read).toBe('allow')
        expect(settings.effectiveToolPermissions().read).toBe('ask')
    })
})
