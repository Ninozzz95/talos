import { expect, type Page } from '@playwright/test'
import { closeToolSheet } from './toolSheet'

/**
 * Getting a chat into a state worth testing: a provider that answers, a model
 * selected, and a message actually sent.
 *
 * Copied by hand into six specs before this existed, which is how they drifted.
 * It also matters more since 2026-07-31: a chat enters the HISTORY only when it
 * has something in it, so a test that needs a chat in a list has to put
 * something in it — clicking "New chat" is no longer enough, and should not be.
 */
/**
 * Where the once-configured provider state is saved (see provider.setup.ts).
 *
 * It lives HERE, in a plain module, because Playwright refuses to let one test
 * file import another — and a spec that imported the setup would be silently
 * dropped from the run rather than told off.
 */
export const TALOS_PROVIDER_STATE = 'tests/e2e/.auth/provider.json'
/** The same, on the immersive shell — `storageState` is one blob, never merged. */
export const TALOS_PROVIDER_IMMERSIVE_STATE = 'tests/e2e/.auth/provider-immersive.json'

/** The shell those journeys seed for themselves; the setup starts from it. */
export const TALOS_IMMERSIVE_SEED = {
    cookies: [],
    origins: [{
        origin: 'http://127.0.0.1:4173',
        localStorage: [{
            name: 'CapacitorStorage.talos.mobile.settings',
            value: JSON.stringify({
                defaults_v3: true,
                presentation_v2: true,
                shell: { immersive_header: true, composer_drawer: false },
                onboarding: { intro_version: 4, intro_outcome: 'completed', setup_dismissed: true },
            }),
        }],
    }],
}

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

/** A Gemini that lists one model and answers everything with `reply`. */
export async function mockChatProvider(page: Page, reply = 'Understood.'): Promise<void> {
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    models: [{ name: 'models/gemini-live', supportedGenerationMethods: ['generateContent'] }],
                }),
            })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse(reply)),
        })
    })
}

/**
 * ⛔⛔⛔ L'INTRO COPRE TUTTO, E VA CHIUSA PRIMA DI QUALUNQUE COSA.
 *
 * Il setup e2e falliva da chissa quando: `[aria-label="Open menu"]` esisteva nel
 * DOM ma non diventava mai «visible, enabled and stable». Guardando il DOM non
 * si capiva; guardando lo SCHERMO si e visto subito — una schermata di scelta
 * lingua a tutto campo, con il pulsante dietro.
 *
 * ⛔ E nessuno se n'era accorto perche la CI non esegue mai i test e2e. Un test
 * che non gira non e un test: e un file.
 *
 * ⇒ Si chiude col pulsante vero, quello che userebbe una persona. Non
 * scrivendo a mano la chiave in `localStorage`: cosi la prova attraversa
 * davvero il percorso, e il giorno in cui l'intro cambia forma questo si
 * accorge invece di continuare a passare su un mondo che non esiste piu.
 */
export async function saltaIntroSePresente(page: Page): Promise<void> {
    const intro = page.getByTestId('talos-intro-modal')
    /*
     * ⛔⛔ SI ASPETTA CHE COMPAIA, non si guarda se c'e gia.
     *
     * L'intro e un componente a caricamento pigro dietro un cancello che legge
     * uno stato salvato: fra l'apertura della pagina e la sua comparsa passa un
     * tempo variabile. Chiedere `count()` subito dava zero in una corsa e uno
     * nella successiva — la stessa suite, due mondi diversi.
     *
     * ⇒ E la ragione per cui questo test era rotto in modo intermittente e
     * nessuno riusciva a dargli un nome.
     *
     * ⛔ E un'osservazione sul PRODOTTO, non sul test: se l'intro arriva dopo,
     * per un istante l'app e toccabile prima di essere coperta. Una persona puo
     * premere qualcosa e vedersi il gesto inghiottito. Non lo sistemo qui — e
     * un'altra cosa — ma non lo lascio nemmeno senza nome.
     */
    await intro.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null)
    if (await intro.count() === 0) return
    const salta = page.getByTestId('talos-setup-skip')
    // ⛔ Un'attesa breve e con un tetto: se l'intro non c'e non si paga niente,
    // e se c'e ma non si chiude il test deve fallire per QUELLO, non per un
    // pulsante irraggiungibile trenta secondi dopo.
    await salta.waitFor({ state: 'visible', timeout: 10_000 })
    await salta.click()
    await intro.waitFor({ state: 'detached', timeout: 10_000 })
}

/** Save a key and pick the model, through the real Settings flow. */
export async function configureChatProvider(page: Page, key = 'e2e-key'): Promise<void> {
    await saltaIntroSePresente(page)
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.getByTestId('settings-model-lab-link').click()
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await page.getByTestId('talos-model-lab-destination')
        .filter({ hasText: 'Providers and access' })
        .click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
    const expander = page.locator('[data-provider="gemini"] button[aria-controls="provider-gemini-body"]')
    if (await expander.getAttribute('aria-expanded') === 'false') await expander.click()
    await page.getByLabel('Google Gemini API key').fill(key)
    await page.getByLabel('Save Google Gemini key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()

    // Provider is a route child now. Walk to the hub and choose the discovered
    // model through the dedicated catalog before the fresh-install intro can
    // reclaim focus when the station closes.
    await page.getByTestId('talos-sheet-back').click()
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await page.getByTestId('talos-model-lab-destination')
        .filter({ hasText: 'Model catalog' })
        .click()
    const model = page.locator('[data-model-card][data-model-id="gemini:gemini-live"]')
    await expect(model).toBeVisible()
    await model.getByRole('button', { name: /Use .* as default model/ }).click()
    await expect(model.getByRole('button', { name: /Use .* as default model/ }))
        .toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('talos-sheet-back').click()
    await expect(page.getByTestId('talos-model-lab-hub')).toBeVisible()
    await page.getByTestId('talos-sheet-back').click()
    await expect(page).toHaveURL(/\/settings$/)
    await closeToolSheet(page)
}

/** Send one message and wait for the answer to land. */
export async function sendChatMessage(page: Page, text: string, reply = 'Understood.'): Promise<void> {
    const composer = page.getByLabel('Message TALOS')
    await composer.fill(text)
    await expect(page.getByTestId('talos-composer-action')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText(reply, { exact: true }).first()).toBeVisible()
}

/** Everything above, in the order a person would do it. */
export async function startChatWithContent(page: Page, text: string): Promise<void> {
    await mockChatProvider(page)
    await configureChatProvider(page)
    await sendChatMessage(page, text)
}
