import { expect, test, type FileChooser, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openAiCompletionFulfill } from './completionMock'
import { closeToolSheet } from './toolSheet'

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3S4AAAAASUVORK5CYII=',
    'base64',
)

async function configureVisionModel(page: Page): Promise<Array<Record<string, unknown>>> {
    const completions: Array<Record<string, unknown>> = []
    await page.route('https://api.openai.com/v1/models', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: [{
                    id: 'gpt-e2e-vision',
                    name: 'GPT E2E Vision',
                    architecture: {
                        input_modalities: ['text', 'image'],
                        output_modalities: ['text'],
                    },
                    supported_parameters: [],
                }],
            }),
        })
    })
    await page.route('https://api.openai.com/v1/responses', async (route) => {
        const request = route.request().postDataJSON() as Record<string, unknown>
        completions.push(request)
        await route.fulfill(openAiCompletionFulfill(
            request,
            'gpt-e2e-vision',
            'I received the release brief and the reference image.',
        ))
    })

    await page.goto('/')
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.getByTestId('settings-model-lab-link').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Providers and access' }).click()
    await expect(page.getByTestId('settings-models-providers-screen')).toBeVisible()
    if (await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').click()
    await page.getByLabel('OpenAI API key').fill('e2e-files-openai-key')
    await page.getByLabel('Save OpenAI key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()

    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Model catalog' }).click()
    const model = page.locator('[data-model-card][data-model-id="openai:gpt-e2e-vision"]')
    await expect(model).toBeVisible()
    await model.getByRole('button', { name: /Use .* as default model/ }).click()
    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-sheet-back').click()
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
    return completions
}

async function openFileChooser(page: Page): Promise<FileChooser> {
    const chooser = page.waitForEvent('filechooser')
    await page.getByLabel('Attach a file').click()
    return chooser
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))
    expect(overflow).toBeLessThanOrEqual(0)
}

async function expectAndroidTouchTarget(control: Locator): Promise<void> {
    await expect.poll(
        async () => (await control.boundingBox())?.width ?? 0,
        { message: 'Android touch target width' },
    ).toBeGreaterThanOrEqual(48)
    await expect.poll(
        async () => (await control.boundingBox())?.height ?? 0,
        { message: 'Android touch target height' },
    ).toBeGreaterThanOrEqual(48)
}

test('sends text and image evidence, downloads device copies, reuses Vault files and revokes deleted access', async ({ page }) => {
    // This is a deliberate end-to-end lifecycle with two persistence reloads,
    // two exports, model delivery, attach, and confirmed delete.
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: 390, height: 844 })
    const completions = await configureVisionModel(page)

    const chooser = await openFileChooser(page)
    await chooser.setFiles([
        {
            name: 'release-brief.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Release marker AVM-P1.6 must remain untrusted evidence.', 'utf8'),
        },
        {
            name: 'reference.png',
            mimeType: 'image/png',
            buffer: ONE_PIXEL_PNG,
        },
    ])

    const imageConsent = page.getByRole('dialog', { name: 'This image leaves the phone' })
    await expect(imageConsent).toBeVisible()
    await imageConsent.getByRole('button', { name: 'Just this once', exact: true }).click()

    const tray = page.getByTestId('talos-mobile-attachment-tray')
    await expect(tray.locator('[data-attachment-status="authorized"]')).toHaveCount(2, { timeout: 20_000 })
    await expect(tray).toContainText('release-brief.txt')
    await expect(tray).toContainText('reference.png')
    await expect(tray).toContainText('Model read')
    await expect(tray).toContainText('Browser upload')
    await expect(page.locator('body')).not.toContainText('talos-vault/files/')

    await page.getByLabel('Message TALOS').fill('Review both attached files and confirm receipt.')
    await page.getByLabel('Message TALOS').press('Enter')
    await expect(page.getByText('I received the release brief and the reference image.', { exact: true })).toBeVisible()
    await expect(tray).toHaveCount(0)

    expect(completions).toHaveLength(1)
    const wire = JSON.stringify(completions[0])
    expect(wire).toContain('[Untrusted attachment: release-brief.txt]')
    expect(wire).toContain('Release marker AVM-P1.6 must remain untrusted evidence.')
    expect(wire).toContain('data:image/png;base64,')
    expect(wire).not.toContain('talos-vault/files/')

    const attachedFiles = page.getByRole('list', { name: 'Attached files' })
    await expect(attachedFiles).toContainText('release-brief.txt')
    // Owner 2026-07-27: an image is SHOWN, so its name lives in the alt text
    // rather than in the bubble's prose — a photo rendered as a chip with a
    // filename is the one thing a photo is not.
    await expect(attachedFiles.locator('img[alt="reference.png"], [data-testid="talos-message-image-fallback"]'))
        .toHaveCount(1)

    await page.reload()
    await expect(page.getByText('I received the release brief and the reference image.', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('list', { name: 'Attached files' })).toContainText('release-brief.txt')

    // P1-CTX-UI-01/02: enabling the global master is not itself an implicit
    // mode choice. Select broad compatibility explicitly, then exercise the
    // narrower chat and one-turn layers against the same persisted files.
    await page.locator(MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="ai_defaults"]').click()
    await page.getByRole('switch', { name: 'Let chats use your Library' }).check()
    await expect(page.getByTestId('talos-library-mode-chooser')).toHaveAttribute('data-policy-source', 'pending')
    await page.getByLabel('Library context mode').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="broad_compat_v1"]').click()
    await expect(page.getByTestId('talos-library-mode-chooser')).toHaveAttribute('data-policy-source', 'global')
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)

    // Owner 2026-07-28: the scoped media Library and the global Library are one
    // product language. Compare the same persisted file in both real surfaces.
    await page.getByLabel('Chat options').click()
    await page.getByTestId('talos-chat-options-media').click()
    const chatMedia = page.getByTestId('talos-chat-media-panel')
    await expect(chatMedia).toBeVisible()
    const chatContextPolicy = chatMedia.getByTestId('talos-chat-media-context-policy')
    await expect(chatContextPolicy).toHaveAttribute('data-source', 'inherited')
    await expect(chatContextPolicy).toHaveAttribute('data-mode', 'broad_compat_v1')
    await expect(chatContextPolicy).toHaveAttribute('data-enabled', 'true')
    await chatMedia.getByLabel('Library context mode for this chat').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="smart_relevant_v1"]').click()
    await expect(chatContextPolicy).toHaveAttribute('data-source', 'chat')
    await expect(chatContextPolicy).toHaveAttribute('data-mode', 'smart_relevant_v1')
    await expect(chatContextPolicy).toHaveAttribute('data-enabled', 'true')
    const chatThumbnail = chatMedia.locator(
        '[data-talos-library-thumbnail][aria-label="Open release-brief.txt"]',
    )
    const chatThumbnailBox = await chatThumbnail.boundingBox()
    const chatFilterBox = await chatMedia.getByRole('radio', { name: 'Show All', exact: true }).boundingBox()
    const chatNameSize = await chatMedia.getByText('release-brief.txt', { exact: true })
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    const chatFileGlyph = chatThumbnail.locator('[data-talos-library-file-glyph]')
    const chatIconKind = await chatFileGlyph.locator('[data-talos-library-icon-kind]')
        .getAttribute('data-talos-library-icon-kind')
    const chatExtension = await chatFileGlyph.locator('[data-talos-library-extension]').textContent()
    expect(chatThumbnailBox).not.toBeNull()
    expect(chatFilterBox).not.toBeNull()
    expect(chatIconKind).toBe('text')
    expect(chatExtension).toBe('TXT')
    await expectAndroidTouchTarget(chatMedia.getByTestId('talos-chat-media-close'))
    await expectAndroidTouchTarget(chatMedia.getByRole('radio', { name: 'Show All', exact: true }))
    const chatReleaseRow = chatMedia.locator('[data-talos-library-row]')
        .filter({ hasText: 'release-brief.txt' })
    const chatActions = chatReleaseRow.getByRole('button', {
        name: 'Actions for release-brief.txt',
        exact: true,
    })
    await expectAndroidTouchTarget(chatActions)
    await expectAndroidTouchTarget(
        chatMedia.locator('[data-talos-library-name]').filter({ hasText: 'release-brief.txt' }).locator('..'),
    )

    // LIB-MENU-12: the real Reka menu follows keyboard focus semantics, and
    // the security state remains visible even while the control is closed.
    await expect(chatReleaseRow.getByText('Available to every chat', { exact: true })).toBeVisible()
    await chatActions.focus()
    await chatActions.press('Enter')
    await expect(page.getByRole('menu', { name: 'Actions for release-brief.txt' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(chatActions).toBeFocused()

    await chatActions.click()
    await page.getByRole('menuitemcheckbox', { name: 'Let the model read release-brief.txt' }).click()
    await expect(chatReleaseRow.getByText('Only available where explicitly attached', { exact: true })).toBeVisible()

    // Persistence is part of the user-visible permission contract.
    await chatMedia.getByTestId('talos-chat-media-close').click()
    await page.reload()
    await page.getByLabel('Chat options').click()
    await page.getByTestId('talos-chat-options-media').click()
    await expect(chatReleaseRow.getByText('Only available where explicitly attached', { exact: true })).toBeVisible()
    await chatActions.click()
    await page.getByRole('menuitemcheckbox', { name: 'Let the model read release-brief.txt' }).click()
    await expect(chatReleaseRow.getByText('Available to every chat', { exact: true })).toBeVisible()

    const chatDownloadEvent = page.waitForEvent('download')
    await chatActions.click()
    await page.getByRole('menuitem', { name: 'Save release-brief.txt to device' }).click()
    const chatDownload = await chatDownloadEvent
    expect(chatDownload.suggestedFilename()).toBe('release-brief.txt')
    expect(await readFile((await chatDownload.path())!))
        .toEqual(Buffer.from('Release marker AVM-P1.6 must remain untrusted evidence.', 'utf8'))
    await chatMedia.getByTestId('talos-chat-media-close').click()
    await expect(chatMedia).toHaveCount(0)

    // P1-CTX-UI-04: the turn layer is visibly independent from the persisted
    // chat policy, supports file-level decisions, and can return to inheritance.
    const libraryChip = page.getByTestId('talos-composer-library-chip')
    await expect(libraryChip).toBeVisible()
    await expect(libraryChip).toContainText('Relevant sources only')
    await libraryChip.click()
    const turnSheet = page.getByTestId('talos-library-context-sheet')
    await expect(turnSheet).toBeVisible()
    await turnSheet.getByTestId('talos-library-turn-mode-agentic_on_demand_v1').click()
    await expect(turnSheet.getByTestId('talos-library-turn-mode-agentic_on_demand_v1')).toHaveAttribute('aria-checked', 'true')
    const releaseContextGroup = turnSheet.getByRole('radiogroup', {
        name: 'Context for release-brief.txt',
        exact: true,
    })
    const includeRelease = releaseContextGroup.getByRole('radio', { name: 'Included', exact: true })
    await includeRelease.click()
    await expect(includeRelease).toHaveAttribute('aria-checked', 'true')
    await expect(turnSheet.getByTestId('talos-library-turn-reset')).toBeVisible()
    await turnSheet.getByTestId('talos-library-turn-reset').click()
    await expect(turnSheet.getByTestId('talos-library-turn-mode-inherit')).toHaveAttribute('aria-checked', 'true')
    await expect(turnSheet.getByTestId('talos-library-turn-reset')).toHaveCount(0)
    await turnSheet.getByRole('button', { name: 'Close' }).click()
    await expect(turnSheet).toHaveCount(0)
    await expect(libraryChip).toContainText('Relevant sources only')

    await page.getByLabel('Choose grounding context').click()
    await expect(page).toHaveURL(/\/context$/)
    // The gallery defaults to a grid; switch to the remembered list view to
    // compare the same canonical filename/glyph row used by chat media.
    await expectAndroidTouchTarget(page.getByLabel('Library options'))
    await page.getByLabel('Library options').click()
    await expectAndroidTouchTarget(page.getByTestId('talos-library-view-list'))
    await page.getByTestId('talos-library-view-list').click()
    const vault = page.getByRole('list', { name: 'Library files' })
    await expect(vault).toContainText('release-brief.txt')
    await expect(vault).toContainText('reference.png')
    const globalThumbnail = vault.locator(
        '[data-talos-library-thumbnail][aria-label="Open release-brief.txt"]',
    )
    const globalThumbnailBox = await globalThumbnail.boundingBox()
    const globalFilterBox = await page.getByTestId('talos-library-type-all').boundingBox()
    const globalNameSize = await vault.getByText('release-brief.txt', { exact: true })
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    const globalFileGlyph = globalThumbnail.locator('[data-talos-library-file-glyph]')
    const globalIconKind = await globalFileGlyph.locator('[data-talos-library-icon-kind]')
        .getAttribute('data-talos-library-icon-kind')
    const globalExtension = await globalFileGlyph.locator('[data-talos-library-extension]').textContent()
    expect(globalThumbnailBox).not.toBeNull()
    expect(globalFilterBox).not.toBeNull()
    expect(chatThumbnailBox!.width).toBe(globalThumbnailBox!.width)
    expect(chatThumbnailBox!.height).toBe(globalThumbnailBox!.height)
    expect(chatFilterBox!.height).toBe(globalFilterBox!.height)
    expect(chatNameSize).toBe(globalNameSize)
    expect(chatIconKind).toBe(globalIconKind)
    expect(chatExtension).toBe(globalExtension)
    await expectAndroidTouchTarget(page.getByTestId('talos-library-type-all'))
    const releaseRow = vault.locator('[data-talos-library-row]').filter({ hasText: 'release-brief.txt' })
    const globalActions = releaseRow.getByRole('button', {
        name: 'Actions for release-brief.txt',
        exact: true,
    })
    await expectAndroidTouchTarget(globalActions)
    await expectAndroidTouchTarget(
        vault.locator('[data-talos-library-name]').filter({ hasText: 'release-brief.txt' }).locator('..'),
    )

    const globalDownloadEvent = page.waitForEvent('download')
    await globalActions.click()
    await page.getByRole('menuitem', { name: 'Save release-brief.txt to device' }).click()
    const globalDownload = await globalDownloadEvent
    expect(globalDownload.suggestedFilename()).toBe('release-brief.txt')
    expect(await readFile((await globalDownload.path())!))
        .toEqual(Buffer.from('Release marker AVM-P1.6 must remain untrusted evidence.', 'utf8'))
    await page.setViewportSize({ width: 320, height: 568 })
    await expect(globalActions).toBeVisible()
    await globalActions.click()
    const narrowMenu = page.getByRole('menu', { name: 'Actions for release-brief.txt' })
    const narrowMenuBox = await narrowMenu.boundingBox()
    expect(narrowMenuBox).not.toBeNull()
    expect(narrowMenuBox!.x).toBeGreaterThanOrEqual(0)
    expect(narrowMenuBox!.x + narrowMenuBox!.width).toBeLessThanOrEqual(320)
    await page.keyboard.press('Escape')
    await expectNoDocumentOverflow(page)
    await page.setViewportSize({ width: 390, height: 844 })

    await globalActions.click()
    await page.getByRole('menuitem', { name: 'Attach release-brief.txt to message' }).click()
    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.getByTestId('talos-mobile-attachment-tray')).toContainText('release-brief.txt')
    await page.getByLabel('Remove release-brief.txt').click()
    await expect(page.getByTestId('talos-mobile-attachment-tray')).toHaveCount(0)

    await page.getByLabel('Choose grounding context').click()
    await page.getByLabel('Library options').click()
    await page.getByTestId('talos-library-view-list').click()
    await globalActions.click()
    await page.getByRole('menuitem', { name: 'Delete release-brief.txt' }).click()
    await expect(page.getByRole('heading', { name: 'Delete file?' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete file', exact: true }).click()
    await expect(vault).not.toContainText('release-brief.txt')
    await expect(vault).toContainText('reference.png')

    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
    await page.reload()
    const historicalAttachments = page.getByRole('list', { name: 'Attached files' })
    await expect(historicalAttachments).toContainText('release-brief.txt')
    await expect(historicalAttachments).toContainText('Access revoked')
    // Same after a reload: the image is an image, so its name is in the alt.
    // The fallback is accepted too — a vault file that has genuinely gone must
    // still say WHICH image was attached rather than leave a hole.
    await expect(historicalAttachments
        .locator('img[alt="reference.png"], [data-testid="talos-message-image-fallback"]'))
        .toHaveCount(1)

    await page.setViewportSize({ width: 320, height: 568 })
    await expectNoDocumentOverflow(page)
    expect(pageErrors).toEqual([])
})

test('handles an unsupported keyboard-selected file without trapping the composer', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await configureVisionModel(page)

    const attachButton = page.getByLabel('Attach a file')
    await attachButton.focus()
    await expect(attachButton).toBeFocused()
    const box = await attachButton.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    const chooserPromise = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    const chooser = await chooserPromise
    await chooser.setFiles({
        name: 'unsafe.exe',
        mimeType: 'application/x-msdownload',
        buffer: Buffer.from('MZ-not-an-accepted-mobile-attachment', 'utf8'),
    })

    const tray = page.getByTestId('talos-mobile-attachment-tray')
    await expect(tray.locator('[data-attachment-status="failed"]')).toHaveCount(1, { timeout: 15_000 })
    await expect(tray.getByRole('alert')).toContainText('need attention')
    await expect(tray).toContainText('Could not add file')

    await page.getByLabel('Message TALOS').fill('This text must not bypass a failed file.')
    await expect(page.getByTestId('talos-mobile-composer').getByRole('button', { name: 'Send message' })).toBeDisabled()
    await page.getByLabel('Remove unsafe.exe').click()
    await expect(tray).toHaveCount(0)
    await expect(page.getByTestId('talos-mobile-composer').getByRole('button', { name: 'Send message' })).toBeEnabled()
    await expectNoDocumentOverflow(page)
})

test('keeps the expanded attachment composer from occluding the empty state at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')

    const chooser = await openFileChooser(page)
    await chooser.setFiles([
        {
            name: 'compact-one.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('first compact layout proof', 'utf8'),
        },
        {
            name: 'compact-two.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('second compact layout proof', 'utf8'),
        },
    ])

    await expect(page.locator('[data-attachment-status="authorized"]')).toHaveCount(2, { timeout: 20_000 })
    const heroBox = await page.getByTestId('talos-empty-brand').boundingBox()
    const composerBox = await page.getByTestId('talos-mobile-composer').boundingBox()

    expect(heroBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect((heroBox?.y ?? 0) + (heroBox?.height ?? 0)).toBeLessThanOrEqual(composerBox?.y ?? 0)
    await expectNoDocumentOverflow(page)
})
