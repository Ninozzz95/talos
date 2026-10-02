import { expect, test, type Page, type Route } from '@playwright/test'
import { TALOS_PROVIDER_STATE } from './chatFixtures'

/**
 * ⛔⛔ A3-OSS-2 (Pad, 01/10/2026, `oss1-riprodotto.png`): «Controlla azioni degli strumenti (1)» stava SOPRA il
 * pulsante «Interrompi risposta» — fisso in basso a destra, dove il compositore ha Invia/Interrompi. Una richiesta
 * lasciata a «Decidi più tardi» in una chat, e una risposta in corso in un'altra: lo Stop non si poteva toccare.
 * Owner 01/10: «pillola accanto alla pill selettore modello». Quattro viewport (telefono e tablet, verticale e
 * orizzontale).
 */
test.use({ storageState: TALOS_PROVIDER_STATE })

const VIEWPORTS = [
    { nome: 'telefono verticale', width: 375, height: 812 },
    { nome: 'telefono orizzontale', width: 812, height: 375 },
    // Il Pad vero (CDP, 01/10): 1292×914 CSS. Con 834/1194 il difetto NON si vedeva (primo giro verde).
    { nome: 'tablet verticale', width: 914, height: 1292 },
    { nome: 'tablet orizzontale', width: 1292, height: 914 },
] as const

/** Il fornitore finto: la nota chiede uno strumento che scrive; la domanda della seconda chat resta in sospeso. */
async function fornitore(page: Page) {
    let rilascia: () => void = () => undefined
    const inSospeso = new Promise<void>((resolve) => { rilascia = resolve })
    await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
        const request = route.request()
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ models: [{
                    name: 'models/gemini-live', displayName: 'Gemini Live', inputTokenLimit: 128000,
                    outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'],
                }] }),
            })
            return
        }
        const corpo = request.postData() ?? ''
        if (corpo.includes('Second chat question.')) {
            await inSospeso
            const evento = JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Done.' }] } }] })
            await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${evento}\n\n` })
                .catch(() => undefined)
            return
        }
        const evento = JSON.stringify({
            responseId: 'resp-oss2',
            candidates: [{
                finishReason: 'STOP',
                content: { parts: [{ functionCall: {
                    name: 'document_create',
                    args: { format: 'md', title: 'Groceries', body: 'Buy eggs tomorrow.' },
                } }] },
            }],
        })
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${evento}\n\n` })
    })
    return { rilascia: () => rilascia() }
}

async function scriviEInvia(page: Page, testo: string) {
    const campo = page.getByLabel('Message TALOS')
    await campo.fill(testo)
    await expect(page.getByTestId('talos-mobile-composer').getByRole('button', { name: 'Send message', exact: true }))
        .toBeEnabled({ timeout: 15_000 })
    await campo.press('Enter')
}

for (const viewport of VIEWPORTS) {
    test(`OSS2-E2E-01 ${viewport.nome}: il richiamo degli strumenti non copre mai «Interrompi risposta»`, async ({ page }) => {
        const errori: string[] = []
        page.on('pageerror', (e) => errori.push(e.message))
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        const finto = await fornitore(page)
        await page.goto('/')

        await scriviEInvia(page, 'Save a note: buy eggs tomorrow.')
        await expect(page.getByTestId('talos-tool-consent')).toBeVisible({ timeout: 15_000 })
        await page.getByTestId('talos-tool-consent-later').click()
        // Sulla chat il richiamo sta nel compositore, accanto al selettore del modello; il pulsante fisso non c'è.
        const richiamo = page.getByTestId('talos-composer-tool-review')
        await expect(richiamo).toBeVisible()
        await expect(page.getByTestId('talos-tool-authorization-reopen')).toHaveCount(0)

        await page.locator('[aria-label="Chat options"]').click()
        await page.getByRole('menuitem', { name: 'New chat' }).click()
        // La chat nuova azzera il campo quando è pronta: si scrive dopo, come farebbe una persona.
        await expect(page.getByText('What shall we do today?')).toBeVisible()
        await scriviEInvia(page, 'Second chat question.')
        const stop = page.getByTestId('talos-composer-action')
        await expect(stop).toHaveAccessibleName('Stop response')
        await expect(richiamo).toBeVisible()
        await expect(page.getByTestId('talos-tool-authorization-reopen')).toHaveCount(0)
        expect(await richiamo.evaluate((el) => el.previousElementSibling?.getAttribute('data-testid')))
            .toBe('talos-composer-model-chip')

        // Le due scatole non si sovrappongono, e al centro dello Stop c'è proprio lo Stop.
        const scatolaStop = (await stop.boundingBox())!
        const scatolaRichiamo = (await richiamo.boundingBox())!
        const siToccano = scatolaStop.x < scatolaRichiamo.x + scatolaRichiamo.width
            && scatolaRichiamo.x < scatolaStop.x + scatolaStop.width
            && scatolaStop.y < scatolaRichiamo.y + scatolaRichiamo.height
            && scatolaRichiamo.y < scatolaStop.y + scatolaStop.height
        expect(siToccano).toBe(false)
        const alCentro = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null
        }, { x: scatolaStop.x + scatolaStop.width / 2, y: scatolaStop.y + scatolaStop.height / 2 })
        expect(alCentro).toBe('talos-composer-action')
        // E il richiamo resta dentro lo schermo.
        expect(scatolaRichiamo.y).toBeGreaterThanOrEqual(0)

        // Toccarla riapre la richiesta.
        await richiamo.click()
        await expect(page.getByTestId('talos-tool-consent')).toBeVisible()
        await page.getByTestId('talos-tool-consent-later').click()

        await stop.click()
        await expect(stop).not.toHaveAccessibleName('Stop response')
        finto.rilascia()
        expect(errori).toEqual([])
    })
}
