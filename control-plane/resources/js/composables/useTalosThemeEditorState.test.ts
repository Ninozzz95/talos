import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { TalosThemeId, TalosThemeCustomization } from '../lib/talosThemes'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import { useTalosThemeEditorState } from './useTalosThemeEditorState'

function settings(preferences: Record<string, unknown> = {}): TalosWorkspaceSettings {
    return {
        id: 'theme-editor-settings',
        preferences: {
            theme: 'paper',
            theme_customization: {},
            ...preferences,
        },
    }
}

async function flushAnimationFrame() {
    await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(() => resolve())
            return
        }
        setTimeout(resolve, 0)
    })
}

describe('useTalosThemeEditorState', () => {
    it('keeps preset fallback values display-only while synchronizing a draft delta', async () => {
        const settingsRef = ref(settings())
        const drafts: Array<TalosThemeCustomization | null> = []
        const editor = useTalosThemeEditorState({
            theme: ref<TalosThemeId>('forge'),
            settings: settingsRef,
            onDraftChanged: (draft) => drafts.push(draft),
        })

        editor.syncFromSettings()
        editor.activateTab('customize')
        await flushAnimationFrame()

        expect(editor.activeTheme.value).toBe('paper')
        expect(editor.sanitizedForm()).toEqual({})

        editor.updateCustomizationForm({ ...editor.customizationForm.value, font: 'mono' })
        await nextTick()

        expect(editor.sanitizedForm()).toEqual({ font: 'mono' })
        expect(drafts.at(-1)).toEqual({ font: 'mono' })
    })

    it('synchronizes the selected area form from persisted area tokens', async () => {
        const editor = useTalosThemeEditorState({
            theme: ref<TalosThemeId>('forge'),
            settings: ref(settings({
                theme_area_tokens: {
                    composer: { background: '#111827', text: '#f9fafb' },
                },
            })),
        })

        editor.syncFromSettings()
        expect(editor.areaTokenForm.value).toMatchObject({ background: '#111827', text: '#f9fafb' })

        editor.selectedArea.value = 'chat'
        await nextTick()

        expect(editor.areaTokenForm.value).toEqual({
            background: '',
            surface: '',
            text: '',
            muted: '',
            border: '',
            accent: '',
        })
    })

    it('does not emit draft changes while the customize tab is inactive', async () => {
        const onDraftChanged = vi.fn()
        const editor = useTalosThemeEditorState({
            theme: ref<TalosThemeId>('forge'),
            settings: ref(settings()),
            onDraftChanged,
        })

        editor.syncFromSettings()
        editor.updateCustomizationForm({ ...editor.customizationForm.value, font: 'mono' })
        await nextTick()

        expect(onDraftChanged).not.toHaveBeenCalled()
    })
})
