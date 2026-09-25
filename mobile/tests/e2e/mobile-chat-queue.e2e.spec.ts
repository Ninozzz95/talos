import { expect, test, type Page, type Route } from '@playwright/test'
import { TALOS_PROVIDER_STATE } from './chatFixtures'
import { geminiCompletionFulfill } from './completionMock'

/**
 * ⭐ B3 «Giro in corso» — la coda dei messaggi dal compositore vero al fornitore (LEDGER-B3-2026-09-24).
 * Decisioni owner 24/09: mentre TALOS risponde, con del testo compaiono Stop + Accoda; la voce parte da sola a fine
 * giro; lo Stop mette la coda in pausa; la coda è su disco e dopo una ricarica è ancora lì, in pausa.
 */
test.use({ storageState: TALOS_PROVIDER_STATE })

function geminiResponse(text: string) {
    return { modelVersion: 'gemini-live', candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }
}

/** Il fornitore finto: la PRIMA risposta resta in sospeso finché la prova non la rilascia; le altre rispondono subito. */
async function fornitore(page: Page, risposte: string[]) {
    const richieste: Array<Record<string, unknown>> = []
    let rilascia: () => void = () => undefined
    const primaInSospeso = new Promise<void>((r) => { rilascia = r })
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
        richieste.push(request.postDataJSON() as Record<string, unknown>)
        const indice = richieste.length - 1
        if (indice === 0) await primaInSospeso
        const testo = risposte[indice] ?? 'Unexpected completion.'
        // Dopo uno Stop la richiesta è già annullata: rispondere non deve far cadere la prova.
        await route.fulfill(geminiCompletionFulfill(request.url(), JSON.stringify(geminiResponse(testo)), testo)).catch(() => undefined)
    })
    return { richieste, rilascia: () => rilascia() }
}

async function scriviEInvia(page: Page, testo: string) {
    const campo = page.getByLabel('Message TALOS')
    await campo.fill(testo)
    await expect(page.getByTestId('talos-mobile-composer').getByRole('button', { name: 'Send message', exact: true }))
        .toBeEnabled({ timeout: 15_000 })
    await campo.press('Enter')
}

test('B3-E2E-01 scritto mentre TALOS risponde: si accoda e parte da solo a fine giro', async ({ page }) => {
    const errori: string[] = []
    page.on('pageerror', (e) => errori.push(e.message))
    const finto = await fornitore(page, ['First answer.', 'Second answer.'])
    await page.goto('/')
    await scriviEInvia(page, 'First question.')
    await expect.poll(() => finto.richieste.length).toBe(1)

    await page.getByLabel('Message TALOS').fill('Queued follow-up.')
    await expect(page.getByTestId('talos-composer-action')).toHaveAccessibleName('Stop response')
    await page.getByTestId('talos-composer-queue').click()
    await expect(page.getByTestId('talos-queue-strip')).toBeVisible()
    await expect(page.getByTestId('talos-queue-count')).toHaveText('1 queued')
    await expect(page.getByLabel('Message TALOS')).toHaveValue('')

    finto.rilascia()
    await expect(page.getByText('First answer.', { exact: true })).toBeVisible()
    await expect(page.getByText('Second answer.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-queue-strip')).toHaveCount(0)
    expect(finto.richieste).toHaveLength(2)
    expect(JSON.stringify(finto.richieste[1])).toContain('Queued follow-up.')
    expect(errori).toEqual([])
})

test('B3-E2E-02 lo Stop mette la coda in pausa; dopo una ricarica è ancora lì e parte solo con «Invia ora»', async ({ page }) => {
    const errori: string[] = []
    page.on('pageerror', (e) => errori.push(e.message))
    const finto = await fornitore(page, ['Never delivered.', 'Answer after resume.'])
    await page.goto('/')
    await scriviEInvia(page, 'Start something long.')
    await expect.poll(() => finto.richieste.length).toBe(1)

    await page.getByLabel('Message TALOS').fill('Waiting in line.')
    await page.getByTestId('talos-composer-queue').click()
    await expect(page.getByTestId('talos-queue-count')).toHaveText('1 queued')
    await page.getByTestId('talos-composer-action').click()
    await expect(page.getByTestId('talos-queue-count')).toHaveText('1 paused')
    finto.rilascia()

    await page.reload()
    await expect(page.getByTestId('talos-queue-strip')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('talos-queue-count')).toHaveText('1 paused')
    expect(finto.richieste).toHaveLength(1)

    await page.getByTestId('talos-queue-strip').getByRole('button', { name: 'Send now' }).click()
    await expect(page.getByText('Answer after resume.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-queue-strip')).toHaveCount(0)
    expect(JSON.stringify(finto.richieste[1])).toContain('Waiting in line.')
    expect(errori).toEqual([])
})
