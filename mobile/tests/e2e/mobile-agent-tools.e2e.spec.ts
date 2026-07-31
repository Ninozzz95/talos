import { expect, test } from '@playwright/test'

test.use({
    storageState: {
        cookies: [],
        origins: [{
            origin: 'http://127.0.0.1:4173',
            localStorage: [{
                name: 'CapacitorStorage.talos.mobile.settings',
                value: JSON.stringify({
                    defaults_v3: true,
                    presentation_v2: true,
                    onboarding: {
                        intro_version: 2,
                        intro_outcome: 'completed',
                        setup_dismissed: true,
                    },
                    shell: { immersive_header: false, composer_drawer: false },
                }),
            }],
        }],
    },
})

test('AGENT-TOOLS-09 switches and enabled count survive reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.locator('[data-testid="talos-mobile-sidebar"]')
        .getByRole('button', { name: 'Open Settings' })
        .click()
    await page.locator('[data-settings-tab="agent_tools"]').click()

    const panel = page.getByTestId('talos-settings-agent-tools')
    await expect(panel).toBeVisible()
    await expect(panel.locator('[data-agent-tool]')).toHaveCount(14)
    await expect(panel).toContainText('13 of 14 enabled')

    // R8-D adds one dedicated, confirmation-gated policy mutation capability.
    // It is intentionally disabled by default; the twelve established tools
    // retain their previous enabled defaults.
    const policyUpdate = panel.locator(
        '[data-agent-tool="library_context_policy_update"] input[role="switch"]',
    )
    await expect(policyUpdate).not.toBeChecked()

    const librarySearchRow = panel.locator('[data-agent-tool="library_search"]')
    const librarySearch = librarySearchRow.locator('input[role="switch"]')
    await expect(librarySearch).toBeChecked()
    await librarySearchRow.click()
    await expect(librarySearch).not.toBeChecked()
    await expect(panel).toContainText('12 of 14 enabled')

    await page.reload()
    await page.locator('[data-settings-tab="agent_tools"]').click()
    const reloadedPanel = page.getByTestId('talos-settings-agent-tools')
    await expect(reloadedPanel.locator('[data-agent-tool="library_search"] input[role="switch"]'))
        .not.toBeChecked()
    await expect(reloadedPanel.locator(
        '[data-agent-tool="library_context_policy_update"] input[role="switch"]',
    )).not.toBeChecked()
    await expect(reloadedPanel).toContainText('12 of 14 enabled')
})
