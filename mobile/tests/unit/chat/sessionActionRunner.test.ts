import { describe, expect, it, vi } from 'vitest'
import { createSessionActionRunner } from '@/lib/sessionActionRunner'
import { talosTestT } from '../../helpers/talosTestI18n'

const translate = talosTestT('en')

// F4-#22 — session actions (new/select/rename/delete) must never fail
// silently: a rejection surfaces as a toast carrying the real error text,
// the busy flag always resets, and the runner never rethrows into a void
// call site (that was an unhandled rejection the owner could not see).
describe('createSessionActionRunner', () => {
    it('runs the action once and guards re-entry while busy', async () => {
        const toasts = { push: vi.fn() }
        const runner = createSessionActionRunner(toasts, translate)
        let resolveFirst: () => void = () => {}
        const first = runner.run('Rename chat', () => new Promise<void>((resolve) => { resolveFirst = resolve }))
        expect(runner.busy.value).toBe(true)
        const second = vi.fn().mockResolvedValue(undefined)
        await runner.run('Rename chat', second)
        expect(second).not.toHaveBeenCalled()
        resolveFirst()
        await first
        expect(runner.busy.value).toBe(false)
        expect(toasts.push).not.toHaveBeenCalled()
    })

    it('surfaces a rejection as a toast with the real error and resets busy', async () => {
        const toasts = { push: vi.fn() }
        const runner = createSessionActionRunner(toasts, translate)
        await expect(runner.run('Delete chat', () => Promise.reject(new Error('TALOS_CHAT_DELETE_UNVERIFIED'))))
            .resolves.toBeUndefined()
        expect(runner.busy.value).toBe(false)
        expect(toasts.push).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Delete chat failed: TALOS_CHAT_DELETE_UNVERIFIED'),
        }))
    })
})
