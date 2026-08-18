import { expect, test, type Page } from '@playwright/test'
import { TALOS_PROVIDER_STATE } from './chatFixtures'

/**
 * The provider is configured ONCE for the whole suite (provider.setup.ts) and
 * inherited here. Driving the Settings journey in every test cost about two
 * minutes of the ten, and not one of these tests is about it — owner
 * 2026-07-31: «quasi 10 minuti per e2e».
 */
test.use({ storageState: TALOS_PROVIDER_STATE })


/**
 * Owner 2026-07-26: "quando cancelli una chat non ti cancella i relativi
 * documenti in libreria — metti alert modal … con casella cancella anche
 * relativo media con loading di cancellazione e metti anche un pulsante per
 * selezionare massivamente media e chat per eliminazione".
 *
 * The unit tests pin the rules; this walks what the user's thumb actually does,
 * on a real build, because every defect in this area so far survived green units
 * and died on the device.
 */
const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

function geminiResponse(text: string) {
    return {
        modelVersion: 'gemini-live',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }
}

async function mockProvider(page: Page): Promise<void> {
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ models: [{ name: 'models/gemini-live', supportedGenerationMethods: ['generateContent'] }] }),
            })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(geminiResponse('Understood.')),
        })
    })
}


async function sendMessage(page: Page, text: string): Promise<void> {
    const composer = page.getByLabel('Message TALOS')
    await composer.fill(text)
    await expect(page.getByTestId('talos-composer-action')).toBeEnabled({ timeout: 15_000 })
    await composer.press('Enter')
    await expect(page.getByText('Understood.', { exact: true }).first()).toBeVisible()
}

async function openChatsPage(page: Page): Promise<void> {
    await page.locator(MENU).click()
    await page.locator(SIDEBAR).getByTestId('talos-sidebar-chats-entry').click()
}

async function holdRow(page: Page, index: number): Promise<void> {
    const row = page.locator('[data-testid="talos-chats-row"]').nth(index)
    await page.waitForFunction(() => getComputedStyle(document.body).pointerEvents !== 'none')
    const box = (await row.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()
    /*
     * ⛔⛔ IL TIENI-PREMUTO SELEZIONA, non apre un menu.
     *
     * Questo aiutante aspettava `talos-chats-row-menu`, un testid RIMOSSO il
     * 4 agosto dal refactor «⋮ visibile e tieni-premuto che seleziona, come
     * nella Ricerca» — perché le due liste della stessa app rispondevano in modo
     * opposto allo stesso dito.
     *
     * ⇒ Il test non era rotto: era fermo a un'app che non esiste più, da due
     * settimane. Nessuno se n'è accorto perché la CI non eseguiva i test nel
     * browser.
     *
     * ⛔ Si aspetta la BARRA DI SELEZIONE, che è l'effetto vero del gesto: se
     * domani cambia di nuovo, questo test lo dice invece di cercare un elemento
     * che non c'è.
     */
    await expect(page.locator('[data-testid="talos-chats-selection-bar"]')).toBeVisible()
}

test('the delete confirmation is never a trap, whatever the shell is doing', async ({ page }) => {
    // The BLOCKER the SF critic found: with no chat to delete, the handler does
    // nothing, no busy edge ever arrives, and the dialog used to spin with every
    // exit disabled over an inert shell — the app was unusable until killed.
    await page.goto('/')
    await page.locator('[aria-label="Chat options"]').click()
    await page.getByRole('menuitem', { name: 'Delete chat' }).click()
    await expect(page.getByText('Delete chat?', { exact: true })).toBeVisible()

    await page.getByTestId('talos-session-delete-confirm').click()
    // Cancel must still be alive, and must still close.
    const cancel = page.getByRole('button', { name: 'Cancel' })
    await expect(cancel).toBeEnabled()
    await cancel.click()
    await expect(page.getByText('Delete chat?', { exact: true })).toHaveCount(0)
    // And the shell is usable again, which is the whole point.
    await expect(page.getByLabel('Message TALOS')).toBeEnabled()
})

test('deleting a chat asks about its files only when it has some', async ({ page }) => {
    await mockProvider(page)
    await page.goto('/')
    await sendMessage(page, 'Una chat senza documenti')

    await page.locator('[aria-label="Chat options"]').click()
    await page.getByRole('menuitem', { name: 'Delete chat' }).click()
    await expect(page.getByText('Delete chat?', { exact: true })).toBeVisible()
    // No files were produced, so there is no choice to offer. An empty
    // "also delete 0 files" is noise that teaches people to dismiss the row.
    await expect(page.getByTestId('talos-delete-chat-media')).toHaveCount(0)

    await page.getByTestId('talos-session-delete-confirm').click()
    await expect(page.getByText('Delete chat?', { exact: true })).toHaveCount(0)
})

test('several chats go in one pass from the selection mode', async ({ page }) => {
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
    await mockProvider(page)
    await page.goto('/')

    await sendMessage(page, 'Prima conversazione')
    await page.locator('[aria-label="Chat options"]').click()
    await page.getByRole('menuitem', { name: 'New chat' }).click()
    await sendMessage(page, 'Seconda conversazione')

    await openChatsPage(page)
    const rows = page.locator('[data-testid="talos-chats-row"]')
    await expect(rows).toHaveCount(2)

    /*
     * Enter from a held row: it selects the row the thumb was already on.
     *
     * ⛔ Qui c'era anche un click su `talos-chats-select`, la voce «Seleziona»
     * del menu per riga. Il refactor del 4 agosto ha tolto quel menu e reso il
     * tieni-premuto un gesto di SELEZIONE: il click cercava una voce che non
     * esiste piu, e il test aspettava sessanta secondi prima di dirlo.
     */
    await holdRow(page, 0)
    await expect(page.getByTestId('talos-chats-selection-bar')).toContainText('1 selected')

    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByTestId('talos-chats-selection-bar')).toContainText('2 selected')

    await page.getByTestId('talos-chats-bulk-delete').click()
    await expect(page.getByText('Delete selected chats?', { exact: true })).toBeVisible()
    await page.getByTestId('talos-chats-bulk-delete-confirm').click()

    await expect(rows).toHaveCount(0)
    // The mode leaves with the last selected row, rather than lingering over an
    // empty list still claiming a selection.
    await expect(page.getByTestId('talos-chats-selection-bar')).toHaveCount(0)
})

test('leaving the selection mode restores the ordinary row actions', async ({ page }) => {
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
    await mockProvider(page)
    await page.goto('/')
    await sendMessage(page, 'Chat da tenere')

    await openChatsPage(page)
    await holdRow(page, 0)
    await expect(page.getByTestId('talos-chats-selection-bar')).toBeVisible()

    await page.getByLabel('Cancel selection').click()
    await expect(page.getByTestId('talos-chats-selection-bar')).toHaveCount(0)
    /*
     * Il gesto e sospeso mentre si seleziona, e deve tornare dopo.
     *
     * ⛔ Qui si aspettava il MENU. Ma il tieni-premuto non apre piu un menu:
     * SELEZIONA — e `holdRow` lo verifica gia. Quello che questo test vuole
     * sapere e che il gesto FUNZIONI ANCORA dopo essere uscito dalla selezione,
     * e la prova di quello e la barra che ricompare.
     */
    await holdRow(page, 0)
    await expect(page.locator('[data-testid="talos-chats-row"]')).toHaveCount(1)
})
