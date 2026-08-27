// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controllable platform + plugin spies. We test the REAL service decision logic
// (which style/mode per scheme/platform, fail-closed) against injected fakes for
// the native-only Capacitor plugins, which cannot run under jsdom.
const platform = { isNative: true, name: 'android' }
const statusBar = {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
}
const keyboard = {
    setResizeMode: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
}

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => platform.isNative,
        getPlatform: () => platform.name,
    },
}))
vi.mock('@capacitor/status-bar', () => ({
    StatusBar: {
        setStyle: (o: unknown) => statusBar.setStyle(o),
        setBackgroundColor: (o: unknown) => statusBar.setBackgroundColor(o),
        setOverlaysWebView: (o: unknown) => statusBar.setOverlaysWebView(o),
    },
    Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}))
vi.mock('@capacitor/keyboard', () => ({
    Keyboard: {
        setResizeMode: (o: unknown) => keyboard.setResizeMode(o),
        addListener: (event: string, handler: () => void) => keyboard.addListener(event, handler),
    },
    KeyboardResize: { Native: 'native', Body: 'body', Ionic: 'ionic', None: 'none' },
}))

import { configureNativeFraming, NativeFramingError, __resetNativeFramingForTests } from '@/services/nativeFraming'

beforeEach(() => {
    __resetNativeFramingForTests()
    platform.isNative = true
    platform.name = 'android'
    vi.clearAllMocks()
})

describe('native framing', () => {
    it('is a no-op on the web platform', async () => {
        platform.isNative = false
        await configureNativeFraming({ scheme: 'light', background: '#f1f8fa' })
        expect(statusBar.setStyle).not.toHaveBeenCalled()
        expect(keyboard.setResizeMode).not.toHaveBeenCalled()
    })

    it('uses a light status bar style (dark content) for the light scheme on native', async () => {
        await configureNativeFraming({ scheme: 'light', background: '#f1f8fa' })
        expect(statusBar.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
    })

    it('uses a dark status bar style (light content) for the dark scheme on native', async () => {
        await configureNativeFraming({ scheme: 'dark', background: '#0b0f11' })
        expect(statusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' })
    })

    it('applies the android status bar background and disables web-view overlay', async () => {
        await configureNativeFraming({ scheme: 'dark', background: '#0b0f11' })
        expect(statusBar.setBackgroundColor).toHaveBeenCalledWith({ color: '#0b0f11' })
        expect(statusBar.setOverlaysWebView).toHaveBeenCalledWith({ overlay: false })
    })

    it('does not touch android-only status bar apis on ios', async () => {
        platform.name = 'ios'
        await configureNativeFraming({ scheme: 'dark', background: '#0b0f11' })
        expect(statusBar.setStyle).toHaveBeenCalledOnce()
        expect(statusBar.setBackgroundColor).not.toHaveBeenCalled()
        expect(statusBar.setOverlaysWebView).not.toHaveBeenCalled()
    })

    it('configures the keyboard resize mode on native', async () => {
        await configureNativeFraming({ scheme: 'light', background: '#ffffff' })
        expect(keyboard.setResizeMode).toHaveBeenCalledWith({ mode: 'native' })
    })

    it('reports a status bar failure through onError without throwing, still configuring the keyboard', async () => {
        statusBar.setStyle.mockRejectedValueOnce(new Error('boom'))
        const onError = vi.fn()
        await configureNativeFraming({ scheme: 'light', background: '#ffffff', onError })
        expect(onError).toHaveBeenCalledTimes(1)
        const err = onError.mock.calls[0][0]
        expect(err).toBeInstanceOf(NativeFramingError)
        expect(err.code).toBe('NATIVE_STATUSBAR_FAILED')
        // fail-closed on one channel must not block the other
        expect(keyboard.setResizeMode).toHaveBeenCalledOnce()
    })

    // Owner device 2026-07-25: dismissing the keyboard left DOM focus on the field,
    // so the composer stayed in its focused/expanded state with no keyboard.
    it('releases input focus when the keyboard is dismissed', async () => {
        await configureNativeFraming({ native: true, scheme: 'dark', background: '#000000' })

        const registered = keyboard.addListener.mock.calls.find(([event]) => event === 'keyboardDidHide')
        expect(registered).toBeDefined()

        const field = document.createElement('textarea')
        document.body.appendChild(field)
        field.focus()
        expect(document.activeElement).toBe(field)

        ;(registered![1] as () => void)()
        expect(document.activeElement).not.toBe(field)
        field.remove()
    })

    // Misurato sul Pad 2026-08-27: `Keyboard.setResizeMode` su Android è uno
    // stub (`KeyboardPlugin.java` chiama `call.unimplemented()`) — SEMPRE
    // rifiutato. Il vecchio codice registrava il listener `keyboardDidHide`
    // nello stesso try/catch di `setResizeMode`: quel rifiuto garantito
    // impediva la registrazione, senza mai un errore visibile. Su un vero
    // Pad Android, la gesture di back con tastiera aperta chiudeva la
    // tastiera ma lasciava il focus sulla textarea. Questo test riproduce
    // esattamente quel fallimento del doppio: senza la separazione dei due
    // try, sarebbe rosso.
    it('registers the keyboardDidHide listener even when setResizeMode is rejected, as it always is on Android', async () => {
        keyboard.setResizeMode.mockRejectedValueOnce(new Error('not implemented'))
        const onError = vi.fn()
        await configureNativeFraming({ scheme: 'dark', background: '#000000', onError })

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0].code).toBe('NATIVE_KEYBOARD_FAILED')

        const registered = keyboard.addListener.mock.calls.find(([event]) => event === 'keyboardDidHide')
        expect(registered).toBeDefined()

        const field = document.createElement('textarea')
        document.body.appendChild(field)
        field.focus()
        expect(document.activeElement).toBe(field)

        ;(registered![1] as () => void)()
        expect(document.activeElement).not.toBe(field)
        field.remove()
    })
})
