import { describe, expect, it, vi } from 'vitest'
import { talosLightImpact } from '@/services/haptics'

// F2-T6 — haptics are decorative: they fire through the injected impl and are
// NEVER allowed to throw into product flows.
describe('talosLightImpact (F2-T6)', () => {
    it('fires the injected impact implementation', async () => {
        const impact = vi.fn(async () => {})
        await talosLightImpact(impact)
        expect(impact).toHaveBeenCalledOnce()
    })

    it('swallows implementation failures silently', async () => {
        const impact = vi.fn(async () => { throw new Error('no vibrator') })
        await expect(talosLightImpact(impact)).resolves.toBeUndefined()
    })

    it('is a no-op on web without an implementation', async () => {
        await expect(talosLightImpact()).resolves.toBeUndefined()
    })
})
