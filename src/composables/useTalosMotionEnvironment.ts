import {
    computed,
    getCurrentInstance,
    getCurrentScope,
    onBeforeUnmount,
    onScopeDispose,
    ref,
    toValue,
    type MaybeRefOrGetter,
} from 'vue'

type NetworkInformation = {
    saveData?: boolean
    effectiveType?: string
    addEventListener?: (type: string, listener: EventListener) => void
    removeEventListener?: (type: string, listener: EventListener) => void
}

export type UseTalosMotionEnvironmentOptions = {
    workspaceReducedMotion?: MaybeRefOrGetter<boolean>
}

function networkInformation(): NetworkInformation | null {
    if (typeof navigator === 'undefined') return null
    return (navigator as Navigator & { connection?: NetworkInformation }).connection ?? null
}

function isLowPower(connection: NetworkInformation | null): boolean {
    return connection?.saveData === true
        || connection?.effectiveType === 'slow-2g'
        || connection?.effectiveType === '2g'
}

export function useTalosMotionEnvironment(options: UseTalosMotionEnvironmentOptions = {}) {
    const mediaReducedMotion = ref(false)
    const documentHidden = ref(typeof document !== 'undefined' && document.hidden)
    const connection = ref<NetworkInformation | null>(networkInformation())
    const lowPower = ref(isLowPower(connection.value))
    let reducedMotionQuery: MediaQueryList | null = null

    const prefersReducedMotion = computed(() => mediaReducedMotion.value
        || (options.workspaceReducedMotion !== undefined && toValue(options.workspaceReducedMotion) === true))

    function updateReducedMotion(event: MediaQueryListEvent) {
        mediaReducedMotion.value = event.matches
    }

    function updateLowPower() {
        lowPower.value = isLowPower(connection.value)
    }

    function updateVisibility() {
        documentHidden.value = document.hidden
    }

    function start() {
        if (typeof window !== 'undefined' && window.matchMedia) {
            reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
            mediaReducedMotion.value = reducedMotionQuery.matches
            reducedMotionQuery.addEventListener('change', updateReducedMotion)
        }
        connection.value = networkInformation()
        connection.value?.addEventListener?.('change', updateLowPower)
        updateLowPower()
        if (typeof document !== 'undefined') {
            documentHidden.value = document.hidden
            document.addEventListener('visibilitychange', updateVisibility)
        }
    }

    function stop() {
        reducedMotionQuery?.removeEventListener('change', updateReducedMotion)
        connection.value?.removeEventListener?.('change', updateLowPower)
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', updateVisibility)
        reducedMotionQuery = null
        connection.value = null
    }

    start()
    if (getCurrentInstance()) onBeforeUnmount(stop)
    else if (getCurrentScope()) onScopeDispose(stop)

    return {
        prefersReducedMotion,
        lowPower,
        documentHidden,
    }
}
