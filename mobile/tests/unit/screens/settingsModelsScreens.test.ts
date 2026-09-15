// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsModelsScreen from '@/screens/SettingsModelsScreen.vue'
import SettingsModelsProvidersScreen from '@/screens/SettingsModelsProvidersScreen.vue'
import SettingsModelsCatalogScreen from '@/screens/SettingsModelsCatalogScreen.vue'
import SettingsModelsLocalScreen from '@/screens/SettingsModelsLocalScreen.vue'

const stubs = {
    TalosMobileModelLabHub: { template: '<main data-testid="hub" />' },
    TalosMobileProviderRuntimePanel: { template: '<main data-testid="providers" />' },
    TalosMobileHuggingFaceAccessCard: { template: '<aside data-testid="hf-access" />' },
    TalosMobileModelAdvancedOptions: { template: '<div data-testid="advanced" />' },
    TalosMobileModelCatalog: { template: '<main data-testid="catalog" />' },
    TalosMobileLocalModels: { template: '<main data-testid="local" />' },
}

describe('dedicated Model Lab screens', () => {
    it.each([
        [SettingsModelsScreen, 'hub'],
        [SettingsModelsProvidersScreen, 'providers'],
        [SettingsModelsCatalogScreen, 'catalog'],
        [SettingsModelsLocalScreen, 'local'],
    ])('mounts only its dedicated content and no duplicated device card', (screen, testId) => {
        const wrapper = mount(screen, { global: { stubs } })
        expect(wrapper.get(`[data-testid="${testId}"]`).exists()).toBe(true)
        if (testId !== 'hub') expect(wrapper.find('[data-testid="talos-model-lab-device"]').exists()).toBe(false)
        if (testId === 'providers') expect(wrapper.findAll('[data-testid="hf-access"]')).toHaveLength(1)
    })
})
