// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosComposerModelPicker from './TalosComposerModelPicker.vue'
import type { TalosModelProfile, TalosModelRoutingProfile } from '../../../lib/talosTypes'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

function profile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-a',
        display_name: 'Profile A',
        provider: 'openai',
        model: 'openai/gpt-5',
        status: 'ready',
        has_secret: true,
        ...overrides,
    } as unknown as TalosModelProfile
}

function routing(overrides: Partial<TalosModelRoutingProfile> = {}): TalosModelRoutingProfile {
    return {
        id: 'routing-a',
        name: 'Balanced routing',
        task_type: 'chat',
        status: 'enabled',
        lanes: [{}],
        created_at: '',
        updated_at: '',
        ...overrides,
    } as unknown as TalosModelRoutingProfile
}

type Emitted = { modelProfile: string[]; routingProfile: string[] }

function mountPicker(input: {
    modelProfiles?: TalosModelProfile[]
    modelRoutingProfiles?: TalosModelRoutingProfile[]
    selectedModelProfileId?: string
    selectedModelRoutingProfileId?: string
    loadingModelProfiles?: boolean
    loadingModelRoutingProfiles?: boolean
} = {}): Emitted {
    const emitted: Emitted = { modelProfile: [], routingProfile: [] }
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosComposerModelPicker, {
                modelProfiles: input.modelProfiles ?? [],
                modelRoutingProfiles: input.modelRoutingProfiles ?? [],
                selectedModelProfileId: input.selectedModelProfileId ?? '',
                selectedModelRoutingProfileId: input.selectedModelRoutingProfileId ?? '',
                loadingModelProfiles: input.loadingModelProfiles ?? false,
                loadingModelRoutingProfiles: input.loadingModelRoutingProfiles ?? false,
                onSelectModelProfile: (value: string) => { emitted.modelProfile.push(value) },
                onSelectModelRoutingProfile: (value: string) => { emitted.routingProfile.push(value) },
            })
        },
    }))
    app.mount(mountPoint)
    return emitted
}

describe('TalosComposerModelPicker', () => {
    it('renders a themed listbox with no native select or option elements', () => {
        mountPicker({
            modelProfiles: [profile(), profile({ id: 'profile-b', display_name: 'Profile B', model: 'anthropic/claude' })],
            modelRoutingProfiles: [routing()],
        })

        expect(document.querySelector('[data-testid="talos-composer-model-picker"]')).not.toBeNull()
        expect(document.querySelector('[role="listbox"]')).not.toBeNull()
        expect(document.querySelectorAll('[data-testid="talos-model-picker-option"]')).toHaveLength(2)
        expect(document.querySelectorAll('[data-testid="talos-model-picker-routing-option"]')).toHaveLength(1)
        // Regression guard: the OS-rendered native dropdown must be gone.
        expect(document.querySelector('select')).toBeNull()
        expect(document.querySelectorAll('option')).toHaveLength(0)
    })

    it('emits selectModelProfile with the row id when a callable model is chosen', async () => {
        const emitted = mountPicker({ modelProfiles: [profile({ id: 'profile-x' })] })

        document.querySelector<HTMLButtonElement>('[data-model-profile-id="profile-x"]')?.click()
        await nextTick()

        expect(emitted.modelProfile).toEqual(['profile-x'])
        expect(emitted.routingProfile).toEqual([])
    })

    it('emits selectModelRoutingProfile with the row id when an Auto route is chosen', async () => {
        const emitted = mountPicker({ modelRoutingProfiles: [routing({ id: 'routing-x' })] })

        document.querySelector<HTMLButtonElement>('[data-routing-profile-id="routing-x"]')?.click()
        await nextTick()

        expect(emitted.routingProfile).toEqual(['routing-x'])
        expect(emitted.modelProfile).toEqual([])
    })

    it('disables an uncallable model row and does not emit when it is clicked', async () => {
        const emitted = mountPicker({ modelProfiles: [profile({ id: 'profile-off', status: 'disabled' })] })

        const row = document.querySelector<HTMLButtonElement>('[data-model-profile-id="profile-off"]')
        expect(row?.disabled).toBe(true)
        row?.click()
        await nextTick()

        expect(emitted.modelProfile).toEqual([])
    })

    it('marks the active profile with aria-selected', () => {
        mountPicker({
            modelProfiles: [profile({ id: 'profile-sel' })],
            selectedModelProfileId: 'profile-sel',
        })

        const row = document.querySelector('[data-model-profile-id="profile-sel"]')
        expect(row?.getAttribute('aria-selected')).toBe('true')
    })
})
