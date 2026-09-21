import { Capacitor } from '@capacitor/core'

/**
 * F2-T6 — guarded haptics (§4.2 pin: `@capacitor/haptics@8.0.2`). Light impact
 * on primary actions (send, session switch, lock/unlock). Decorative only:
 * lazy plugin import, no-op on web, failures are swallowed — haptics must
 * never break a product flow.
 */
export async function talosLightImpact(impl?: () => Promise<void>): Promise<void> {
    try {
        if (impl) {
            await impl()
            return
        }
        if (!Capacitor.isNativePlatform()) return
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
        await Haptics.impact({ style: ImpactStyle.Light })
    } catch {
        // Decorative — never propagate.
    }
}
