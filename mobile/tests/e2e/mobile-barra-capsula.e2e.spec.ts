import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { TALOS_IMMERSIVE_SEED, configureChatProvider, mockChatProvider, sendChatMessage } from './chatFixtures'

/*
 * Judge v2261 (19/11), small round 2 of the top bar in a capsule, from the real APK photos.
 *
 * The reply header scrolls UNDER the bar: «Talos» on the left, «model · time» on the right. Measured on the Pad:
 *   - a short name («gpt-5») left a hole of ~14 px before the time (`min-width: 7.5ch` on the name piece);
 *   - on the tablet «Talos» sat under the back button and the name ran under the ⋯ pill, cut mid-letter.
 * Here it is measured with RECTANGLES (getBoundingClientRect / Range), never by eye: the header can sit at any height under
 * the bar, so what must never meet is the horizontal extent of a text and of a button. Two themes, four sizes (phone and
 * tablet, portrait and landscape), a short and a long name. The phone was already right: its numbers must not move.
 */

const CORTO = 'gpt-5'
const LUNGO = 'gemma-4-E2B-it-Q5_K_M'
/** Longer than any header at any size: it must end with the ellipsis everywhere, the tablet included. */
const ENORME = `openrouter/${'very-long-model-identifier-'.repeat(6)}preview`
const MISURE = [
    { nome: 'telefono-verticale', width: 411, height: 914, tablet: false },
    { nome: 'telefono-orizzontale', width: 914, height: 411, tablet: false },
    { nome: 'tablet-verticale', width: 914, height: 1292, tablet: true },
    { nome: 'tablet-orizzontale', width: 1292, height: 914, tablet: true },
] as const
const FILLER = Array.from({ length: 40 }, () => 'river stone cloud green small bright quiet garden window paper').join(' ')

interface Striscia { left: number, right: number }
interface Misura {
    tasto: Striscia | null
    capsula: Striscia
    talos: Striscia
    pezzoNome: Striscia
    /** Where the glyphs of «name · » really end (a box can be wider than its text: that was the hole). */
    testoDelPezzo: Striscia
    nome: Striscia & { troncato: boolean }
    ora: Striscia
    padding: string
}

/** The settings seed on ANY origin: the port is the config's business, not the test's. */
test.use({ storageState: { cookies: [], origins: [] } })

async function seme(page: Page) {
    const { name, value } = TALOS_IMMERSIVE_SEED.origins[0].localStorage[0]
    await page.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v) }, [name, value] as const)
}

/** Puts the first reply's header right under the bar, like the content does when it scrolls. */
async function portaSottoLaBarra(page: Page) {
    await page.evaluate(() => {
        const testa = document.querySelector('.assistant-header') as HTMLElement
        let box: HTMLElement | null = testa.parentElement
        while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/u.test(getComputedStyle(box).overflowY))) box = box.parentElement
        const barra = document.querySelector('[data-testid="talos-immersive-actions"]') as HTMLElement
        if (box) box.scrollTop += testa.getBoundingClientRect().top - barra.getBoundingClientRect().top
    })
}

async function misura(page: Page, nome: string): Promise<Misura> {
    return page.evaluate((testo) => {
        const striscia = (r: DOMRect) => ({ left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100 })
        const delTesto = (n: Node) => { const r = document.createRange(); r.selectNodeContents(n); return striscia(r.getBoundingClientRect()) }
        const testa = document.querySelector('.assistant-header') as HTMLElement
        for (const n of document.querySelectorAll('.talos-meta-nome')) n.textContent = testo
        const tasto = document.querySelector('[data-testid="talos-shell-menu"], [data-testid="talos-chat-back"]')
        const talos = [...testa.children].find((c) => c.textContent?.trim() === 'Talos') as HTMLElement
        const riga = testa.querySelector('.talos-meta-riga') as HTMLElement
        const pezzoNome = riga.querySelector('.talos-meta-modello') as HTMLElement
        const nomeEl = riga.querySelector('.talos-meta-nome') as HTMLElement
        const ora = [...riga.children].find((c) => !c.classList.contains('talos-meta-modello')) as HTMLElement
        return {
            tasto: tasto ? striscia(tasto.getBoundingClientRect()) : null,
            capsula: striscia(document.querySelector('[data-testid="talos-immersive-actions"]')!.getBoundingClientRect()),
            talos: delTesto(talos),
            pezzoNome: striscia(pezzoNome.getBoundingClientRect()),
            testoDelPezzo: delTesto(pezzoNome),
            nome: { ...striscia(nomeEl.getBoundingClientRect()), troncato: nomeEl.scrollWidth > nomeEl.clientWidth },
            ora: delTesto(ora),
            padding: getComputedStyle(testa).paddingInline,
        }
    }, nome)
}

const siToccano = (a: Striscia, b: Striscia) => a.left < b.right && b.left < a.right

test('the reply header never runs under the bar, with no hole before the time (judge v2261)', async ({ page }, info) => {
    test.setTimeout(120_000)
    await seme(page)
    await mockChatProvider(page, 'OK')
    await page.setViewportSize({ width: 411, height: 914 })
    await page.goto('/')
    await configureChatProvider(page)
    await sendChatMessage(page, 'Reply with the single word OK.', 'OK')
    await sendChatMessage(page, `Reply with OK. ${FILLER}`, 'OK')
    const risultati: Record<string, Misura> = {}

    for (const m of MISURE) {
        await page.setViewportSize({ width: m.width, height: m.height })
        await expect(page.locator(m.tablet ? '[data-testid="talos-chat-back"]' : '[data-testid="talos-shell-menu"]')).toBeVisible()
        for (const tema of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme: tema })
            for (const nome of [CORTO, LUNGO, ENORME]) {
                const chiave = `${m.nome}-${tema}-${nome === CORTO ? 'corto' : nome === LUNGO ? 'lungo' : 'enorme'}`
                await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(tema === 'dark')
                const x = await misura(page, nome)
                risultati[chiave] = x
                // «Talos» clear of the menu pill (phone) or of the back button (tablet)
                expect.soft(x.tasto && siToccano(x.talos, x.tasto), `${chiave}: «Talos» under the left button`).toBeFalsy()
                // the name and the time end before the capsule (⋯ alone on the tablet)
                expect.soft(siToccano(x.nome, x.capsula), `${chiave}: the name under the capsule`).toBe(false)
                expect.soft(siToccano(x.ora, x.capsula), `${chiave}: the time under the capsule`).toBe(false)
                expect.soft(x.talos.right <= x.nome.left, `${chiave}: «Talos» and the name overlap`).toBe(true)
                if (nome === CORTO) {
                    expect.soft(x.nome.troncato, `${chiave}: a short name is cut`).toBe(false)
                    // the piece hugs «gpt-5 · »: the time follows the glyphs at once (measured on the text, not on the box)
                    expect.soft(Math.abs(x.ora.left - x.testoDelPezzo.right), `${chiave}: hole before the time`).toBeLessThanOrEqual(1)
                    expect.soft(Math.abs(x.pezzoNome.right - x.testoDelPezzo.right), `${chiave}: the name piece is wider than its text`).toBeLessThanOrEqual(1)
                }
                // the ellipsis, not a half letter under a button: the real Gemma name on the portrait phone, a huge one everywhere
                if ((m.nome === 'telefono-verticale' && nome === LUNGO) || nome === ENORME) {
                    expect.soft(x.nome.troncato, `${chiave}: a name with no room ends with the ellipsis`).toBe(true)
                }
                // photos: light with the long name, dark with the short one (two per size)
                if (tema === 'light' ? nome === LUNGO : nome === CORTO) {
                    await portaSottoLaBarra(page)
                    await page.screenshot({ path: info.outputPath(`${MISURE.indexOf(m) + 1}-${chiave}.png`) })
                }
            }
        }
    }
    writeFileSync(info.outputPath('misure.json'), JSON.stringify(risultati, null, 1))
})
