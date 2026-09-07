import { ref } from 'vue'

export function useTalosMediaObjectUrl() {
    const objectUrl = ref<string | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    let controller: AbortController | null = null
    let generation = 0

    function revokeCurrent() {
        if (objectUrl.value) {
            URL.revokeObjectURL(objectUrl.value)
            objectUrl.value = null
        }
    }

    function abort() {
        generation += 1
        controller?.abort()
        controller = null
        loading.value = false
    }

    async function load(contentUrl: string | null | undefined) {
        abort()
        revokeCurrent()
        error.value = null
        const normalizedUrl = contentUrl?.trim()
        if (!normalizedUrl) return

        const requestGeneration = generation
        const requestController = new AbortController()
        controller = requestController
        loading.value = true

        try {
            const response = await fetch(normalizedUrl, {
                method: 'GET',
                credentials: 'same-origin',
                headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
                signal: requestController.signal,
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const blob = await response.blob()
            if (generation !== requestGeneration || requestController.signal.aborted) return
            if (!blob.type.startsWith('image/')) throw new Error('Unexpected media type')

            objectUrl.value = URL.createObjectURL(blob)
        } catch (reason) {
            if (generation !== requestGeneration || requestController.signal.aborted) return
            error.value = reason instanceof Error && reason.message
                ? `TALOS could not load this image. ${reason.message}`
                : 'TALOS could not load this image.'
        } finally {
            if (generation === requestGeneration) {
                loading.value = false
                controller = null
            }
        }
    }

    function dispose() {
        abort()
        revokeCurrent()
        error.value = null
    }

    return {
        objectUrl,
        loading,
        error,
        load,
        abort,
        dispose,
    }
}
