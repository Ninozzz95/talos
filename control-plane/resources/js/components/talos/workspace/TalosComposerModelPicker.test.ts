// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
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

    it('owns provider groups directly from the listbox and options directly from their groups', () => {
        mountPicker({
            modelProfiles: [
                profile({ id: 'profile-openai', provider: 'openai' }),
                profile({ id: 'profile-anthropic', provider: 'anthropic' }),
            ],
            modelRoutingProfiles: [routing()],
        })

        const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!
        const groups = Array.from(listbox.querySelectorAll<HTMLElement>(':scope > [role="group"]'))
        const options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))

        expect(groups).toHaveLength(3)
        expect(options).toHaveLength(3)
        expect(options.every((option) => option.parentElement?.getAttribute('role') === 'group')).toBe(true)
        expect(groups.every((group) => group.parentElement === listbox)).toBe(true)
    })

    it('does not expose an empty or loading option container as a listbox', () => {
        mountPicker({ loadingModelProfiles: true })

        expect(document.querySelector('[role="listbox"]')).toBeNull()
        expect(document.querySelector('#talos-composer-model-listbox')).not.toBeNull()
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

    it('groups models by provider and filters by provider, display name or model id', async () => {
        mountPicker({
            modelProfiles: [
                profile({ id: 'profile-openai', provider: 'openai', display_name: 'Fast GPT', model: 'gpt-5-mini' }),
                profile({ id: 'profile-anthropic', provider: 'anthropic', display_name: 'Careful Claude', model: 'claude-sonnet-4-6' }),
                profile({ id: 'profile-deepseek', provider: 'deepseek', display_name: 'Code lane', model: 'deepseek-v4-flash' }),
            ],
        })

        expect(Array.from(document.querySelectorAll('[data-testid="talos-model-picker-provider-heading"]')).map((heading) => heading.textContent?.trim())).toEqual([
            'OpenAI',
            'Anthropic',
            'DeepSeek',
        ])

        const search = document.querySelector<HTMLInputElement>('[aria-label="Search models"]')!
        search.value = 'anthropic'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()

        expect(Array.from(document.querySelectorAll('[data-testid="talos-model-picker-option"]')).map((row) => row.getAttribute('data-model-profile-id'))).toEqual([
            'profile-anthropic',
        ])

        search.value = 'deepseek-v4'
        search.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()
        expect(document.querySelector('[data-model-profile-id="profile-deepseek"]')).not.toBeNull()
    })

    it('moves arrow focus only across currently rendered selectable options', async () => {
        mountPicker({
            modelProfiles: [
                profile({ id: 'profile-a' }),
                profile({ id: 'profile-b', provider: 'anthropic' }),
            ],
            modelRoutingProfiles: [routing({ id: 'routing-a' })],
        })

        const route = document.querySelector<HTMLButtonElement>('[data-routing-profile-id="routing-a"]')!
        route.focus()
        route.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await nextTick()

        expect(document.activeElement?.getAttribute('data-model-profile-id')).toBe('profile-a')
    })

    it('renders a newly added shared profile without remounting or reloading the page', async () => {
        const profiles = ref<TalosModelProfile[]>([profile({ id: 'profile-before' })])
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)
        app = createApp(defineComponent({
            setup() {
                return () => h(TalosComposerModelPicker, {
                    modelProfiles: profiles.value,
                    modelRoutingProfiles: [],
                    selectedModelProfileId: '',
                    selectedModelRoutingProfileId: '',
                })
            },
        }))
        app.mount(mountPoint)

        profiles.value = [
            profile({ id: 'profile-new', provider: 'anthropic', display_name: 'New Claude' }),
            ...profiles.value,
        ]
        await nextTick()

        expect(document.querySelector('[data-model-profile-id="profile-new"]')?.textContent).toContain('New Claude')
    })
})
