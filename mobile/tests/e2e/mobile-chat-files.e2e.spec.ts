import { expect, test, type FileChooser, type Page } from '@playwright/test'
import { openAiCompletionFulfill } from './completionMock'

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
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
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
    await page.locator('[data-settings-tab="models"]').click()
    if (await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').getAttribute('aria-expanded') === 'false') await page.locator('[data-provider="openai"] button[aria-controls="provider-openai-body"]').click()
    await page.getByLabel('OpenAI API key').fill('e2e-files-openai-key')
    await page.getByLabel('Save OpenAI key').click()
    await expect(page.getByText('1 model available', { exact: true })).toBeVisible()
    await page.getByLabel('Default chat model').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="openai:gpt-e2e-vision"]').click()
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
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

test('sends text and image evidence, persists safe labels, reuses Vault files and revokes deleted access', async ({ page }) => {
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

    await page.getByLabel('Choose grounding context').click()
    await expect(page).toHaveURL(/\/context$/)
    // The gallery defaults to a grid (image tiles show no name text, tap-to-open);
    // switch to the list view (remembered across visits) where names + per-file
    // attach/delete actions live.
    await page.getByLabel('Library options').click()
    await page.getByTestId('talos-library-view-list').click()
    const vault = page.getByRole('list', { name: 'Library files' })
    await expect(vault).toContainText('release-brief.txt')
    await expect(vault).toContainText('reference.png')

    await page.getByLabel('Attach release-brief.txt to message').click()
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.getByTestId('talos-mobile-attachment-tray')).toContainText('release-brief.txt')
    await page.getByLabel('Remove release-brief.txt').click()
    await expect(page.getByTestId('talos-mobile-attachment-tray')).toHaveCount(0)

    await page.getByLabel('Choose grounding context').click()
    await page.getByLabel('Library options').click()
    await page.getByTestId('talos-library-view-list').click()
    await page.getByLabel('Delete release-brief.txt').click()
    await expect(page.getByRole('heading', { name: 'Delete file?' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete file', exact: true }).click()
    await expect(vault).not.toContainText('release-brief.txt')
    await expect(vault).toContainText('reference.png')

    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
    if (await page.locator('[data-testid="talos-mobile-tool-sheet"]').count() > 0) { await page.locator('[data-testid="talos-sheet-back"]').click(); await page.waitForTimeout(320) }
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
