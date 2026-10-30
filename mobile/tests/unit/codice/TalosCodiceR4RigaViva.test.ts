// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import TalosCodiceR4RigaViva from '@/components/codice/TalosCodiceR4RigaViva.vue'
import TalosMobileCompactionRow from '@/components/chat/TalosMobileCompactionRow.vue'

/*
 * Ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md` — la riga viva del riassunto sopra il compositore del Codice (decisione dell'owner
 * 21/10) e la riga del ripiego col perché che si apre al tocco. Regole del desktop B1 (`context-progress.js` @ f87c8f800): la live
 * region dice solo lo stato; il percento e il tempo stanno fuori (`aria-live=off`); `aria-valuetext` sul `<progress>`; i nomi dei
 * pulsanti contengono la parola visibile (WCAG 2.5.3).
 */
type Composer = { mergeLocaleMessage(locale: string, messages: object): void, locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
    global.mergeLocaleMessage('it', { chat: { compaction: (TALOS_IT_MESSAGES as { chat: { compaction: object } }).chat.compaction } })
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => {
    ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
})

describe('RV-UI — la riga viva del riassunto', () => {
    it('RV-UI-01 senza numeri: la frase e la barra indeterminata (l\u2019annuncio lo fa la regione sempre montata nel dock)', () => {
        const riga = mount(TalosCodiceR4RigaViva, { props: { stato: { tipo: 'inizio', motivo: 'overflow' }, azioni: true } })
        const stato = riga.get('[data-testid="talos-codice-r4-riga-viva-stato"]')
        // revisione avversaria (8): una regione di stato che nasce già piena spesso non si annuncia; qui non ce n'è una
        expect(stato.attributes('role')).toBeUndefined()
        expect(riga.find('[role="status"]').exists()).toBe(false)
        expect(stato.text()).toBe('Riassumo il contesto')
        const barra = riga.get('progress')
        expect(barra.attributes('value')).toBeUndefined()
        expect(barra.attributes('aria-label')).toBe('Riassunto della conversazione in corso')
        expect(riga.find('[data-testid="talos-codice-r4-riga-viva-filo"]').exists()).toBe(false)
    })

    it('RV-UI-02 coi numeri: il dettaglio fuori dalla live region, la barra coi valori e il filo a due tratti', () => {
        const riga = mount(TalosCodiceR4RigaViva, {
            props: { stato: { tipo: 'progresso', fase: 'lettura', letti: 6_200, inCache: 4_000, totale: 10_000, stimaRestanteSec: 64 }, azioni: true },
        })
        const dettaglio = riga.get('[data-testid="talos-codice-r4-riga-viva-dettaglio"]')
        expect(dettaglio.text()).toBe('62% · ~1 min')
        expect(dettaglio.attributes('aria-live')).toBe('off')
        const barra = riga.get('progress')
        expect(barra.attributes('max')).toBe('10000')
        expect(barra.attributes('value')).toBe('6200')
        expect(barra.attributes('aria-valuetext')).toBe('62% · ~1 min')
        const filo = riga.get('[data-testid="talos-codice-r4-riga-viva-filo"]')
        expect(filo.attributes('aria-hidden')).toBe('true')
        expect(filo.attributes('style')).toContain('--talos-riga-viva-cache: 40%')
        expect(filo.attributes('style')).toContain('--talos-riga-viva-letto: 22%')
        // il resto (da leggere, in cache) per chi usa lo schermo, senza allungare la riga
        expect(riga.get('[data-testid="talos-codice-r4-riga-viva-titolo"]').text()).toBe('10.000 token da leggere, 4000 già in cache')
    })

    it('RV-UI-03 Salta e Ferma: parole visibili dentro i nomi, 44 px, un Salta solo finché è in volo; senza azioni niente pulsanti', async () => {
        const riga = mount(TalosCodiceR4RigaViva, { props: { stato: { tipo: 'inizio', motivo: 'overflow' }, azioni: true } })
        const salta = riga.get('[data-testid="talos-codice-r4-riga-viva-salta"]')
        const ferma = riga.get('[data-testid="talos-codice-r4-riga-viva-ferma"]')
        expect(salta.text()).toBe('Salta')
        expect(salta.attributes('aria-label')).toContain('Salta')
        expect(ferma.text()).toBe('Ferma')
        expect(ferma.attributes('aria-label')).toContain('Ferma')
        await salta.trigger('click')
        await ferma.trigger('click')
        expect(riga.emitted('salta')).toHaveLength(1)
        expect(riga.emitted('ferma')).toHaveLength(1)
        await riga.setProps({ saltando: true })
        expect(riga.get('[data-testid="talos-codice-r4-riga-viva-salta"]').attributes('disabled')).toBeDefined()
        const aMano = mount(TalosCodiceR4RigaViva, { props: { stato: { tipo: 'inizio', motivo: 'manuale' }, azioni: false } })
        expect(aMano.findAll('button')).toHaveLength(0)
        const css = readFileSync(resolve(process.cwd(), 'src/components/codice/TalosCodiceR4RigaViva.vue'), 'utf8')
        // revisione avversaria (4): la regola dei 44 px sul selettore dei PULSANTI, non sul contenitore
        expect(css).toMatch(/\.talos-riga-viva__azione \{[^}]*min-width: 44px;[^}]*min-height: 44px;/)
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    })
})

describe('RV-UI — il posto nella schermata del Codice', () => {
    it('RV-UI-06 la riga viva sta nel dock, sopra il compositore; Annulla della lista arriva a r4; a mano niente pulsanti', () => {
        const schermata = readFileSync(resolve(process.cwd(), 'src/screens/CodiceR4Screen.vue'), 'utf8')
        const dock = schermata.slice(schermata.indexOf('data-testid="talos-codice-r4-dock"'))
        const riga = dock.indexOf('<TalosCodiceR4RigaViva')
        expect(riga).toBeGreaterThan(0)
        expect(riga).toBeLessThan(dock.indexOf('<TalosMobileComposer'))
        expect(schermata).toContain('@undo-compaction="annullaCompattazione"')
        expect(schermata).toMatch(/rigaVivaConAzioni = computed\(\(\) => conversazione\.value\?\.rigaVivaAMano\.value !== true\)/)
        // revisione avversaria (8): la regione di stato è sempre montata nel dock, e si riempie quando la riga c'è
        const annuncio = dock.indexOf('data-testid="talos-codice-r4-riga-viva-annuncio"')
        expect(annuncio).toBeGreaterThan(0)
        expect(dock.slice(annuncio - 80, annuncio)).toContain('role="status"')
        expect(dock.slice(annuncio - 200, annuncio)).not.toContain('v-if')
        // «Ferma tutto» (owner 29/10/2026, scheda voce 3): il «Ferma» della riga viva passa da `decidiStopR4` come lo Stop del compositore
        // (`suStop`); senza agenti vivi resta lo Stop di oggi (`conversazione.ferma()`, corpo `{}`, FT-SCR-03)
        expect(schermata).toMatch(/<TalosCodiceR4RigaViva[\s\S]*?@ferma="suStop"/)
        expect(schermata).toMatch(/if \(d\.tipo === 'immediato'\) void fermaConLaScelta\(null\)/)
    })
})

describe('RV-UI — la riga dell\'esito nel Codice', () => {
    it('RV-UI-04 il ripiego: ragione e numeri brevi; il perché si apre e si chiude col tocco', async () => {
        const riga = mount(TalosMobileCompactionRow, {
            props: { tokenPrima: 31_234, tokenDopo: 9_870, annullata: false, ripiego: true, ragione: 'saltato' },
        })
        const etichetta = riga.get('[data-testid="talos-compaction-why-toggle"]')
        expect(etichetta.text()).toBe('Compattata senza il modello (saltato) · 31,2k → 9,9k')
        expect(etichetta.attributes('aria-expanded')).toBe('false')
        expect(riga.find('[data-testid="talos-compaction-why"]').exists()).toBe(false)
        await etichetta.trigger('click')
        expect(etichetta.attributes('aria-expanded')).toBe('true')
        expect(riga.get('[data-testid="talos-compaction-why"]').text())
            .toBe('Hai saltato il riassunto del modello, quindi TALOS è andato avanti con un riassunto fatto senza il modello.')
        await etichetta.trigger('click')
        expect(riga.find('[data-testid="talos-compaction-why"]').exists()).toBe(false)
        // l'annullo resta, separato
        expect(riga.get('[data-testid="talos-compaction-undo"]').text()).toBe('Annulla')
    })

    it('RV-UI-05 non annullabile: niente Annulla; non riuscita: la frase col motivo e nessuna azione', () => {
        const aMano = mount(TalosMobileCompactionRow, { props: { tokenPrima: 100, tokenDopo: 50, annullata: false, annullabile: false } })
        expect(aMano.find('[data-testid="talos-compaction-undo"]').exists()).toBe(false)
        const fallita = mount(TalosMobileCompactionRow, {
            props: { tokenPrima: null, tokenDopo: null, annullata: false, stato: 'non-riuscita', motivo: 'ripiego', dettaglio: null },
        })
        expect(fallita.text()).toBe('Conversazione non riassunta · il motore del contesto non ha risposto, quindi la chat è andata avanti con la compattazione semplice')
        expect(fallita.findAll('button')).toHaveLength(0)
        // la chat non passa le prop nuove: resta com'era
        const chat = mount(TalosMobileCompactionRow, { props: { tokenPrima: 14_273, tokenDopo: 2_526, annullata: false } })
        expect(chat.text()).toContain('Conversazione riassunta · 14.273 → 2526 token')
        expect(chat.find('[data-testid="talos-compaction-why-toggle"]').exists()).toBe(false)
    })
})
