// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({ device: null as null | Record<string, unknown> }))
const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/stores/localModels', () => ({
    talosLocalModels: reactive(state),
    talosRefreshDeviceCapacity: refresh,
}))
vi.mock('@/services/localEngine', () => ({
    talosLocalEngineStatus: vi.fn().mockResolvedValue({ available: true, backends: ['cpu'] }),
}))

import TalosMobileDeviceCapacityCard from '@/components/talos/models/TalosMobileDeviceCapacityCard.vue'

describe('TalosMobileDeviceCapacityCard', () => {
    beforeEach(() => {
        state.device = null
        refresh.mockReset().mockResolvedValue(undefined)
    })

    it('never turns a missing measurement into zero bytes and offers a real retry', async () => {
        const wrapper = mount(TalosMobileDeviceCapacityCard)
        await flushPromises()

        expect(wrapper.text()).toContain('Measure')
        expect(wrapper.text()).not.toContain('0 B')
        await wrapper.get('[data-testid="talos-device-capacity-retry"]').trigger('click')
        expect(refresh).toHaveBeenCalledTimes(2)
    })

    it('shows measured RAM, allocatable storage and the fixed safety reserve', async () => {
        state.device = {
            deviceModel: 'Test phone',
            availableRamBytes: 4 * 1024 ** 3,
            totalRamBytes: 8 * 1024 ** 3,
            freeStorageBytes: 32 * 1024 ** 3,
            memoryBandwidthBytesPerSecond: null,
            thermal: 'none',
            lowMemoryThresholdBytes: 0,
        }
        const wrapper = mount(TalosMobileDeviceCapacityCard)
        await flushPromises()

        expect(wrapper.text()).toContain('4 GB')
        expect(wrapper.text()).toContain('32 GB')
        expect(wrapper.text()).toContain('1 GB')
    })
})
