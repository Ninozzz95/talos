import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import type { TalosColorScheme } from '@/theme/applyDesignTokens'

export type NativeFramingErrorCode = 'NATIVE_STATUSBAR_FAILED' | 'NATIVE_KEYBOARD_FAILED'

export class NativeFramingError extends Error {
    readonly code: NativeFramingErrorCode

    constructor(code: NativeFramingErrorCode, message: string) {
        super(message)
        this.name = 'NativeFramingError'
        this.code = code
    }
}

export interface ConfigureNativeFramingOptions {
    /** Active color scheme; drives status-bar content contrast. */
    scheme: TalosColorScheme
    /** Canonical background color (Android status-bar fill under the safe area). */
    background: string
    /** Controlled, observable failure channel; never throws into the caller. */
    onError?(error: NativeFramingError): void
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Frame the native chrome so the web view sits inside the OS safe area with a
 * status bar that matches the active theme. No-op on the web platform. Each
 * native channel fails closed independently through `onError`: a failure in one
 * never blocks the other and never throws into the render path. Safe-area insets
 * themselves are handled in CSS via `env(safe-area-inset-*)`.
 */
// Registered once: configureNativeFraming may run again on theme changes.
let keyboardHideListenerAttached = false

export async function configureNativeFraming(options: ConfigureNativeFramingOptions): Promise<void> {
    if (!Capacitor.isNativePlatform()) return

    try {
        // Capacitor 8 names these values after the bar style, not the icon
        // luminance: Dark = light text on a dark surface; Light = dark text on
        // a light surface. This setter remains effective on Android 16 and must
        // be re-run when the in-app theme changes.
        await StatusBar.setStyle({ style: options.scheme === 'dark' ? Style.Dark : Style.Light })
        // Android-only backward compatibility. Capacitor 8 documents both as
        // no-ops once Android 16/API 36 enforces edge-to-edge; older supported
        // Android releases still consume them.
        if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setBackgroundColor({ color: options.background })
            await StatusBar.setOverlaysWebView({ overlay: false })
        }
    } catch (error) {
        options.onError?.(new NativeFramingError('NATIVE_STATUSBAR_FAILED', messageOf(error)))
    }

    try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
        // Owner device 2026-07-25: dismissing the keyboard (gesture / system back)
        // hides it natively but leaves DOM focus on the field, so the composer
        // stayed in its focused/expanded state with no keyboard. Capacitor's
        // keyboardDidHide is the documented hook; release focus there.
        // https://capacitorjs.com/docs/apis/keyboard
        if (!keyboardHideListenerAttached) {
            keyboardHideListenerAttached = true
            await Keyboard.addListener('keyboardDidHide', () => {
                const active = document.activeElement
                if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
                    active.blur()
                }
            })
        }
    } catch (error) {
        options.onError?.(new NativeFramingError('NATIVE_KEYBOARD_FAILED', messageOf(error)))
    }
}

/** Test-only: the keyboard listener is registered once per process. */
export function __resetNativeFramingForTests(): void {
    keyboardHideListenerAttached = false
}
