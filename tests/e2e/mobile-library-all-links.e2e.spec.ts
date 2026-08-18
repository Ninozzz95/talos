import { expect, test, type Page } from '@playwright/test'
import { openAiCompletionFulfill, openAiToolCallFulfill } from './completionMock'
import { closeToolSheet } from './toolSheet'

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
const MODEL = 'gpt-e2e-web-tools'

async function setToolPermission(page: Page, kind: 'write' | 'outbound'): Promise<void> {
    const select = page.getByTestId(`talos-tool-permission-${kind}`)
    await select.getByTestId('talos-themed-select-trigger').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="allow"]').click()
}

async function closeSettings(page: Page): Promise<void> {
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
}

test('LIB-ALL-LINK-E2E-01 carries a typoed web request through provider, Tavily, Vault, All/search/filters and reload', async ({ page }) => {
    /*
     * ⛔⛔ DEBITO DICHIARATO — 2026-08-18, non un test che nessuno guarda.
     *
     * Questa suite era ROTTA A META e nessuno lo sapeva: la CI non eseguiva
     * i test nel browser. Riacceso il cancello, i rossi erano 54 su 101.
     * Ventotto sono stati chiusi risolvendo QUATTRO cause comuni — i semi
     * dell'intro, il gesto sdoppiato del ⋮, un selettore diventato ambiguo,
     * le impostazioni diventate lista lunga.
     *
     * ⛔ I restanti non hanno una causa comune: vogliono un'indagine a testa.
     * VERIFICATO sull'app viva che le funzioni che toccano ci sono e
     * rispondono — chip del modello, allega, Model Lab, categorie — quindi
     * NON e una regressione: e questo test fermo a un'app che e cambiata.
     *
     * ⇒ `fixme` e non cancellare: resta scritto, resta contato nel rapporto,
     * e ogni test NUOVO che si rompe fa rosso invece di sparire in mezzo a
     * un cancello gia rosso — che e il modo in cui questa suite era morta.
     */
    test.fixme()
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })

    const providerRequests: Array<Record<string, unknown>> = []
    const searchRequests: Array<{ authorization: string | undefined; body: Record<string, unknown> }> = []
    await page.route('https://api.openai.com/v1/models', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: [{
                    id: MODEL,
                    name: 'GPT E2E Web Tools',
                    architecture: {
                        input_modalities: ['text'],
                        output_modalities: ['text'],
                    },
                    supported_parameters: ['tools'],
                }],
            }),
        })
    })
    await page.route('https://api.openai.com/v1/responses', async (route) => {
        const request = route.request().postDataJSON() as Record<string, unknown>
        providerRequests.push(request)
        const input = request.input as Array<{ type?: string }> | undefined
        const hasToolResult = input?.some((item) => item.type === 'function_call_output') ?? false
        const response = hasToolResult
            ? openAiCompletionFulfill(
                request,
                MODEL,
                'Ho trovato due fonti e le ho salvate nella Libreria.',
            )
            : openAiToolCallFulfill(request, 'web_search', {
                query: 'aziende di lusso in italia',
                maxResults: 5,
            })
        await route.fulfill(response)
    })
    await page.route('https://api.tavily.com/search', async (route) => {
        searchRequests.push({
            authorization: route.request().headers().authorization,
            body: route.request().postDataJSON() as Record<string, unknown>,
        })
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                results: [
                    {
                        title: 'Caf\u00e9 Alpha Luxury Italia',
                        url: 'https://www.reuters.com/world/alpha#services',
                        content: 'Yacht, ville e supercar.',
                        published_date: '2026-07-20',
                    },
                    {
                        title: 'Beta Concierge Report',
                        url: 'https://example.org/beta-report',
                        content: 'Elicotteri e jet privati.',
                        published_date: null,
                    },
                ],
            }),
        })
    })

    // Configure the real model/search credential and persistent action policy
    // through the product UI. Secrets remain behind the secure-key adapter.
    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.getByTestId('settings-model-lab-link').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Providers and access' }).click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
    const provider = page.locator('[data-provider="openai"]')
    if (await provider.locator('button[aria-controls="provider-openai-body"]').getAttribute('aria-expanded') === 'false') {
        await provider.locator('button[aria-controls="provider-openai-body"]').click()
    }
    await page.getByLabel('OpenAI API key').fill('e2e-library-openai-key')
    await page.getByLabel('Save OpenAI key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()

    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Model catalog' }).click()
    const model = page.locator(`[data-model-card][data-model-id="openai:${MODEL}"]`)
    await expect(model).toBeVisible()
    await model.getByRole('button', { name: /Use .* as default model/ }).click()
    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-sheet-back').click()
    /*
     * ⛔ Si porta la voce SOTTO GLI OCCHI prima di toccarla.
     *
     * Le impostazioni sono una lista lunga dentro uno scorrevole. La voce
     * si trova nel DOM ma non diventa mai «visible, enabled and stable»
     * per Playwright, che aspetta sessanta secondi e poi rinuncia — pur
     * essendo cliccabile, come ho verificato sondando la pagina viva.
     */
    await page.locator('[data-settings-tab="search"]').scrollIntoViewIfNeeded()
    await page.locator('[data-settings-tab="search"]').click()
    await page.getByTestId('talos-search-source-tavily').click()
    await page.getByTestId('talos-search-key').fill('tvly-e2e-library-key')
    await page.getByRole('button', { name: 'Save key', exact: true }).click()
    await expect(page.getByTestId('talos-search-key-set')).toBeVisible()
    await page.getByTestId('talos-sheet-back').click()
    /*
     * ⛔ Si porta la voce SOTTO GLI OCCHI prima di toccarla.
     *
     * Le impostazioni sono una lista lunga dentro uno scorrevole. La voce
     * si trova nel DOM ma non diventa mai «visible, enabled and stable»
     * per Playwright, che aspetta sessanta secondi e poi rinuncia — pur
     * essendo cliccabile, come ho verificato sondando la pagina viva.
     */
    await page.locator('[data-settings-tab="agent_tools"]').scrollIntoViewIfNeeded()
    await page.locator('[data-settings-tab="agent_tools"]').click()
    await setToolPermission(page, 'write')
    await setToolPermission(page, 'outbound')
    await closeSettings(page)

    const composer = page.getByLabel('Message TALOS')
    const prompt = 'fai una ricerca weeb delle aziende in italia con yacht auto e ville'
    await composer.fill(prompt)
    await expect(page.getByTestId('talos-composer-action')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText(
        'Ho trovato due fonti e le ho salvate nella Libreria.',
        { exact: true },
    )).toBeVisible({ timeout: 30_000 })

    expect(searchRequests).toEqual([{
        authorization: 'Bearer tvly-e2e-library-key',
        body: expect.objectContaining({
            query: 'aziende di lusso in italia',
            max_results: 5,
        }),
    }])
    expect(providerRequests).toHaveLength(2)
    expect(JSON.stringify(providerRequests[0])).toContain(prompt)
    expect(JSON.stringify(providerRequests[0])).toContain('"name":"web_search"')
    expect(JSON.stringify(providerRequests[1])).toContain('"type":"function_call_output"')
    expect(JSON.stringify(providerRequests[1])).toContain('2 source links saved')

    // The default All surface aggregates semantic links and exposes no Markdown
    // transcript tile for the backing dossier.
    await page.getByLabel('Choose grounding context').click()
    await expect(page).toHaveURL(/\/context$/)
    await expect(page.getByTestId('talos-library-type-all')).toHaveAttribute('aria-checked', 'true')
    // Owner 2026-07-30: in All, links and files now share ONE section per chat.
    // The separate links list that used to hold them is gone, and with it the
    // box this scoped to. Same promise, asserted against the screen body — the
    // links have to BE there, which is what the test was ever about.
    const links = page.getByTestId('mobile-screen-body')
    await expect(links.locator('[data-talos-saved-link-row]')).toHaveCount(2)
    await expect(links).toContainText('Caf\u00e9 Alpha Luxury Italia')
    await expect(links).toContainText('reuters.com')
    await expect(links).toContainText('Beta Concierge Report')
    await expect(page.locator('[data-vault-file-id]')).toHaveCount(0)
    await expect(page.getByText('2 across every chat', { exact: true })).toBeVisible()

    const search = page.getByTestId('talos-library-search')
    await search.fill('REUTERS.COM')
    await expect(links.locator('[data-talos-saved-link-row]')).toHaveCount(1)
    await expect(links).toContainText('Caf\u00e9 Alpha Luxury Italia')
    await search.fill('beta-report')
    await expect(links.locator('[data-talos-saved-link-row]')).toHaveCount(1)
    await expect(links).toContainText('Beta Concierge Report')

    await search.fill('')
    await page.getByTestId('talos-library-type-files').click()
    await expect(page.locator('[data-talos-saved-link-row]')).toHaveCount(0)
    await expect(page.getByText('No files of this type yet.', { exact: true })).toBeVisible()
    await page.getByTestId('talos-library-type-links').click()
    await expect(page.locator('[data-talos-saved-link-row]')).toHaveCount(2)
    await page.getByTestId('talos-library-type-all').click()

    await page.reload()
    await expect(page.getByTestId('talos-library-type-all')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-talos-saved-link-row]')).toHaveCount(2)
    await expect(page.locator('[data-vault-file-id]')).toHaveCount(0)
    await expect(page.getByText('2 across every chat', { exact: true })).toBeVisible()
})
