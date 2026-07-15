import type { InjectionKey, Ref } from 'vue'

export const tooltipPortalTargetKey: InjectionKey<Readonly<Ref<string>>> = Symbol('talos-tooltip-portal-target')
