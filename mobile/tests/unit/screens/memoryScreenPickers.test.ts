// @vitest-environment jsdom

/**
 * The two pickers on the Memory screen — kind and scope — were raw <select>
 * elements and had no test at all. They are now the shared TalosThemedSelect,
 * and this file is the proof the conversion kept the behaviour rather than the
 * appearance: what is asserted is the value the form ends up holding, not that
 * a handler ran.
 *
 * It also pins the guard that came with the conversion. The shared picker emits
 * a plain string, and the form field is a narrow union; instead of casting the
 * string back into the union — which would let any value through — the choice
 * is looked up in the list it came from. An unrecognised value must therefore
 * leave the form exactly as it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MemoryScreen from '@/screens/MemoryScreen.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'

const mockState: { controller: unknown } = { controller: null }
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

const created: Array<Record<string, unknown>> = []

function controllerStub() {
    return {
        memories: {
            list: vi.fn(async () => []),
            create: vi.fn(async (memory: Record<string, unknown>) => { created.push(memory) }),
            setStatus: vi.fn(async () => undefined),
            remove: vi.fn(async () => undefined),
        },
    }
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
}

// The pickers live inside the new-memory form, which starts closed — so every
// test opens it first, exactly as a user reaching them would have to.
async function openForm(wrapper: ReturnType<typeof mount>): Promise<void> {
    await wrapper.get('[data-testid="talos-memory-new"]').trigger('click')
    await settle(wrapper)
}

function picker(wrapper: ReturnType<typeof mount>, testid: string) {
    return wrapper.getComponent<typeof TalosThemedSelect>(`[data-testid="${testid}"]`)
}

describe('MemoryScreen — the kind and scope pickers', () => {
    beforeEach(() => {
        created.length = 0
        mockState.controller = controllerStub()
    })

    it('offers exactly the four kinds and the three scopes, and starts where it always did', async () => {
        const wrapper = mount(MemoryScreen)
        await settle(wrapper)
        await openForm(wrapper)

        expect(picker(wrapper, 'talos-memory-kind').props('items').map((item) => item.value))
            .toEqual(['preference', 'project_fact', 'procedure', 'policy_note'])
        expect(picker(wrapper, 'talos-memory-scope').props('items').map((item) => item.value))
            .toEqual(['global', 'project', 'session'])

        // The defaults the screen shipped with, unchanged by the conversion.
        expect(picker(wrapper, 'talos-memory-kind').props('modelValue')).toBe('project_fact')
        expect(picker(wrapper, 'talos-memory-scope').props('modelValue')).toBe('global')
    })

    it('carries the choice all the way into the saved memory, not just into the picker', async () => {
        const wrapper = mount(MemoryScreen)
        await settle(wrapper)
        await openForm(wrapper)

        picker(wrapper, 'talos-memory-kind').vm.$emit('update:modelValue', 'policy_note')
        picker(wrapper, 'talos-memory-scope').vm.$emit('update:modelValue', 'session')
        await settle(wrapper)

        await wrapper.get('[data-testid="talos-memory-title"]').setValue('una nota')
        await wrapper.get('[data-testid="talos-memory-content"]').setValue('il contenuto')
        await wrapper.get('[data-testid="talos-memory-save"]').trigger('submit')
        await settle(wrapper)

        // The outcome, not the handler: what the repository was actually asked
        // to store. A picker that shows the right label but writes the old value
        // would pass an assertion on modelValue and fail this one.
        expect(created).toHaveLength(1)
        expect(created[0]).toMatchObject({ kind: 'policy_note', scope_type: 'session' })
    })

    it('ignores a value that is not on the list instead of writing it into the form', async () => {
        const wrapper = mount(MemoryScreen)
        await settle(wrapper)
        await openForm(wrapper)

        picker(wrapper, 'talos-memory-kind').vm.$emit('update:modelValue', 'not_a_kind')
        picker(wrapper, 'talos-memory-scope').vm.$emit('update:modelValue', '')
        await settle(wrapper)

        expect(picker(wrapper, 'talos-memory-kind').props('modelValue')).toBe('project_fact')
        expect(picker(wrapper, 'talos-memory-scope').props('modelValue')).toBe('global')
    })
})
