// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'

/**
 * Owner 2026-08-04, provato sul telefono: «il pulsante indietro in alto a
 * sinistra fa chiudere tutto».
 *
 * La gesture di sistema risaliva la catena, quel pulsante no: due comandi per
 * lo stesso gesto con due destinazioni diverse. Aperta una nota, chiudeva la
 * stazione intera — due passi buttati invece di uno.
 */
function sheet(props: Record<string, unknown> = {}) {
    return mount(TalosMobileToolSheet, {
        props: { title: 'Note', ...props },
        global: { stubs: { Teleport: true } },
    })
}

/*
 * Le due icone della barra sono componenti ASINCRONI, e questi casi non le
 * riguardano: montandole per davvero, il loro grafo di moduli continua a
 * caricarsi mentre il caso e' gia' finito, e Vitest lo segnala come rifiuto non
 * gestito («after the environment was torn down»).
 *
 * Si sostituisce il MODULO e non il componente: in `<script setup>` i componenti
 * sono riferimenti diretti e non nomi, quindi `global.stubs` non li intercetta —
 * provato, e infatti non funzionava.
 *
 * E sono asincroni per una ragione misurata: renderle sincrone per far tacere
 * una prova costa **60 KB** nel grafo d'avvio, che ha meno di 3 KB di margine.
 */
/*
 * ⛔ LE DUE ICONE SI ASPETTANO, NON SI SOSTITUISCONO — e la differenza è
 * l'unico rifiuto che restava nella suite.
 *
 * Le icone della barra sono componenti ASINCRONI. Qui c'era un `vi.mock` per
 * ciascuna, col motivo scritto sopra: «montandole per davvero il loro grafo
 * continua a caricarsi mentre il caso è già finito». Ragionamento giusto,
 * conclusione sbagliata — e il commento è sopravvissuto alla sua causa,
 * nascondendola.
 *
 * MISURATO il 2026-08-10, mettendo una stampa dentro la fabbrica del mock:
 *
 * ```
 *   SONDA: campana FINTA renderizzata     ×3   ⇒ il mock FUNZIONA
 *   [Vue warn] async component loader          ⇒ e intanto…
 *   Cannot load /node_modules/reka-ui/dist/index.js
 *       imported from …/TalosMobileNotificationBell.vue
 * ```
 *
 * Cioè: il componente finto si disegna davvero, **e il modulo vero viene
 * recuperato lo stesso**. Registrare un mock non impedisce a Vitest di
 * risolvere il grafo dell'originale; quel recupero atterra dopo lo smontaggio
 * dell'ambiente, e diventa il rifiuto non gestito.
 *
 * ⇒ Sostituire il modulo non toglieva la causa: la spostava. Aspettarlo sì.
 * Questi due `await` fanno finire il caricamento PRIMA che parta un caso, e
 * allora al momento dello smontaggio non c'è più niente in volo.
 *
 * ⛔ Provate e SCARTATE con la misura, non per gusto:
 *   · `flushPromises()` in `afterEach` → 1 rifiuto, identico. Aspetta le
 *     micro-attese di Vue, non il recupero di un modulo da Vite.
 *   · lasciare i `vi.mock` → 1 rifiuto (è la riga sopra).
 *
 * Il paio minimo che lo riproduce, per chi dovrà rifarlo:
 * `vitest run sheetBackTarget panelMotion --no-file-parallelism`. Da solo
 * questo file passa pulito: serve un file che giri DOPO, o non c'è nessuno
 * ancora vivo che veda il recupero atterrare.
 */
await import('@/components/shell/TalosMobileNotificationBell.vue')
await import('@/components/shell/TalosMobileDownloadCenterTrigger.vue')

describe('il pulsante indietro in alto', () => {
    it('da una pagina di dettaglio risale di UN passo, non chiude tutto', async () => {
        const suGiu = vi.fn()
        const wrapper = sheet({ parentBack: suGiu, parentTitle: 'Note' })
        const bottone = wrapper.get('[data-testid="talos-sheet-back"]')

        await bottone.trigger('click')
        expect(suGiu).toHaveBeenCalledTimes(1)
        // E NON ha chiuso: chiudere da qui butta via due passi invece di uno.
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('dice DOVE va, invece di farlo indovinare', () => {
        // Un pulsante che si chiama «torna alla chat» e va da un'altra parte è
        // peggio di uno che non c'è.
        const dentro = sheet({ parentBack: () => {}, parentTitle: 'Note' })
        expect(dentro.get('[data-testid="talos-sheet-back"]').attributes('aria-label'))
            .toContain('Note')

        const cima = sheet()
        expect(cima.get('[data-testid="talos-sheet-back"]').attributes('aria-label'))
            .toMatch(/chat/i)
    })

    it('dalla cima di una stazione chiude, come prima', async () => {
        // Chi non è dentro niente non deve accorgersi che questa strada esiste.
        const wrapper = sheet()
        await wrapper.get('[data-testid="talos-sheet-back"]').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
