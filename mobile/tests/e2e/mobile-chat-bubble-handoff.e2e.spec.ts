import { expect, test, type Page, type Route } from '@playwright/test'
import { TALOS_PROVIDER_STATE } from './chatFixtures'
import { geminiCompletionFulfill } from './completionMock'

/**
 * ⛔ 0.1.48, il testo doppio (owner 11/11 «Prima si cura il difetto»). Nella CI della #22 B3-E2E-01 era rossa 6 su 6 con
 * «getByText('First answer.') resolved to 2 elements»: il `<p>` del messaggio finito e quello dentro la bolla di scrittura
 * (`data-testid="talos-mobile-streaming"`), a schermo insieme per un attimo alla fine della risposta.
 *
 * Questa prova non cerca il testo con un'attesa: GUARDA OGNI DISEGNO. Uno script nella pagina, prima dell'app, segna
 *  - a ogni `requestAnimationFrame` (il disegno che sta per andare a schermo) se c'è un `<p>` fuori dalla bolla con lo stesso
 *    testo di un `<p>` dentro la bolla, e cosa c'era nel PRIMO disegno in cui il messaggio finito compare;
 *  - a ogni cambio del DOM (`MutationObserver`) da quando a quando i due convivono, in millisecondi.
 * Rossa se in un solo disegno, o per un solo istante del DOM, lo stesso testo sta in tutti e due i posti.
 */
test.use({ storageState: TALOS_PROVIDER_STATE })

declare global {
    interface Window {
        __bolla: {
            disegni: number
            disegniDoppi: number
            primoDisegnoColMessaggio: { bolla: boolean, doppio: boolean } | null
            msDoppio: number
            istantiDoppi: number
            dal: number | null
            attesi: string[]
        }
    }
}

function geminiResponse(text: string) {
    return { modelVersion: 'gemini-live', candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }
}

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
        await route.fulfill(geminiCompletionFulfill(request.url(), JSON.stringify(geminiResponse(testo)), testo)).catch(() => undefined)
    })
    return { richieste, rilascia: () => rilascia() }
}

/** Lo spettatore: nella pagina prima dell'app, guarda ogni disegno e ogni cambio del DOM. */
async function spettatore(page: Page, attesi: string[]) {
    await page.addInitScript((testi: string[]) => {
        const b = {
            disegni: 0, disegniDoppi: 0, primoDisegnoColMessaggio: null as { bolla: boolean, doppio: boolean } | null,
            msDoppio: 0, istantiDoppi: 0, dal: null as number | null, attesi: testi,
        }
        window.__bolla = b
        const guarda = () => {
            const bolla = document.querySelector('[data-testid="talos-mobile-streaming"]')
            const dentro = new Set(bolla ? [...bolla.querySelectorAll('p')].map((p) => (p.textContent ?? '').trim()).filter(Boolean) : [])
            let finito = false
            let doppio = false
            for (const p of document.querySelectorAll('p')) {
                if (bolla?.contains(p)) continue
                const testo = (p.textContent ?? '').trim()
                if (b.attesi.includes(testo)) finito = true
                if (testo && dentro.has(testo)) doppio = true
            }
            return { bolla: Boolean(bolla), finito, doppio }
        }
        const disegno = () => {
            const s = guarda()
            b.disegni += 1
            if (s.doppio) b.disegniDoppi += 1
            if (s.finito && b.primoDisegnoColMessaggio === null) b.primoDisegnoColMessaggio = { bolla: s.bolla, doppio: s.doppio }
            requestAnimationFrame(disegno)
        }
        requestAnimationFrame(disegno)
        new MutationObserver(() => {
            const s = guarda()
            const adesso = performance.now()
            if (s.doppio) {
                b.istantiDoppi += 1
                if (b.dal === null) b.dal = adesso
            } else if (b.dal !== null) {
                b.msDoppio += adesso - b.dal
                b.dal = null
            }
        }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
    }, attesi)
}

async function leggi(page: Page) {
    // Due disegni ancora, così il primo disegno col messaggio finito è stato davvero guardato (a CPU x4 i disegni si diradano).
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    // Un intervallo ancora aperto alla lettura conta fino a adesso.
    return page.evaluate(() => ({ ...window.__bolla, msDoppio: window.__bolla.msDoppio + (window.__bolla.dal === null ? 0 : performance.now() - window.__bolla.dal) }))
}

async function scriviEInvia(page: Page, testo: string) {
    const campo = page.getByLabel('Message TALOS')
    await campo.fill(testo)
    await expect(page.getByTestId('talos-mobile-composer').getByRole('button', { name: 'Send message', exact: true }))
        .toBeEnabled({ timeout: 15_000 })
    await campo.press('Enter')
}

/**
 * Il telefono lento: la CI della #22 era rossa su un runner più lento di questa macchina, e qui a velocità piena la finestra
 * fra il messaggio e la fine del giro non arriva mai a un disegno (misurato l'11/11: 0 istanti doppi su 3 corse a velocità piena, rossa 6 su 6 a ×4). La CPU
 * della pagina si rallenta ×4 (CDP `Emulation.setCPUThrottlingRate`), come un telefono di fascia bassa.
 */
async function telefonoLento(page: Page) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

function controlla(esito: Awaited<ReturnType<typeof leggi>>) {
    expect(esito.primoDisegnoColMessaggio, 'il messaggio finito non è mai comparso in un disegno').not.toBeNull()
    expect(esito.disegni, 'lo spettatore non ha visto nessun disegno').toBeGreaterThan(0)
    // Un solo confronto, così una prova rossa scrive TUTTE le misure: disegni doppi, istanti doppi del DOM e i loro millisecondi.
    expect({
        primoDisegnoDoppio: esito.primoDisegnoColMessaggio?.doppio,
        disegniDoppi: esito.disegniDoppi,
        istantiDoppi: esito.istantiDoppi,
        msDoppio: Math.round(esito.msDoppio * 10) / 10,
    }, 'lo stesso testo nella bolla e nel messaggio finito').toEqual({ primoDisegnoDoppio: false, disegniDoppi: 0, istantiDoppi: 0, msDoppio: 0 })
}

test('BOLLA-01 una risposta: nel disegno in cui compare il messaggio finito la bolla non ha più lo stesso testo', async ({ page }) => {
    await telefonoLento(page)
    await spettatore(page, ['Only answer.'])
    const finto = await fornitore(page, ['Only answer.'])
    await page.goto('/')
    await scriviEInvia(page, 'One question.')
    await expect.poll(() => finto.richieste.length).toBe(1)
    finto.rilascia()
    // Il giro è davvero finito (prima che la bolla compaia anche lei ha zero elementi, e il testo cercato può essere il suo).
    await expect(page.getByTestId('talos-composer-action')).toHaveAccessibleName('Send message')
    await expect(page.getByTestId('talos-mobile-streaming')).toHaveCount(0)
    await expect(page.locator('p', { hasText: 'Only answer.' })).toHaveCount(1)
    controlla(await leggi(page))
})

test('BOLLA-02 con un messaggio in coda (B3-E2E-01): il primo finito non resta anche nella bolla mentre parte il secondo', async ({ page }) => {
    await telefonoLento(page)
    await spettatore(page, ['First answer.', 'Second answer.'])
    const finto = await fornitore(page, ['First answer.', 'Second answer.'])
    await page.goto('/')
    await scriviEInvia(page, 'First question.')
    await expect.poll(() => finto.richieste.length).toBe(1)
    await page.getByLabel('Message TALOS').fill('Queued follow-up.')
    await page.getByTestId('talos-composer-queue').click()
    await expect(page.getByTestId('talos-queue-count')).toHaveText('1 queued')
    finto.rilascia()
    await expect.poll(() => finto.richieste.length).toBe(2)
    // Il giro è davvero finito (prima che la bolla compaia anche lei ha zero elementi, e il testo cercato può essere il suo).
    await expect(page.getByTestId('talos-composer-action')).toHaveAccessibleName('Send message')
    await expect(page.getByTestId('talos-mobile-streaming')).toHaveCount(0)
    await expect(page.locator('p', { hasText: 'Second answer.' })).toHaveCount(1)
    await expect(page.locator('p', { hasText: 'First answer.' })).toHaveCount(1)
    controlla(await leggi(page))
})

/**
 * Il difetto vicino, scoperto con la cura: nel primo giro di una chat nuova la bozza passava alla chat solo DOPO la fine del
 * giro, e il testo scritto appena compare il messaggio finito finiva sotto «chat nuova»: il campo si svuotava (ChatScreen
 * `inviandoDaChatNuova`; rossa 9 su 10 prima di quella cura).
 */
test('BOLLA-03 chat nuova: il testo scritto appena compare il messaggio finito resta nel campo', async ({ page }) => {
    await telefonoLento(page)
    const finto = await fornitore(page, ['Only answer.'])
    await page.goto('/')
    await scriviEInvia(page, 'One question.')
    await expect.poll(() => finto.richieste.length).toBe(1)
    finto.rilascia()
    await expect(page.locator('p', { hasText: 'Only answer.' })).toBeVisible()
    const campo = page.getByLabel('Message TALOS')
    await campo.fill('Typed while it ends.')
    await expect(page.getByTestId('talos-composer-action')).toHaveAccessibleName('Send message')
    await page.waitForTimeout(1_000)
    await expect(campo).toHaveValue('Typed while it ends.')
})
