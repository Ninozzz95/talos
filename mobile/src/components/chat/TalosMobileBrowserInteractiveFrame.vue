<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ArrowRight, ExternalLink, Minus, Plus, RefreshCw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import type { TalosMobileBrowserEvidenceArtifact } from '@/lib/browser/browserContracts'
import { mapBrowserImagePointer } from '@/lib/browser/browserImageGeometry'

const props = defineProps<{
    artifacts: readonly TalosMobileBrowserEvidenceArtifact[]
    interactionAvailable: boolean
    retryArtifactId: string | null
}>()

const emit = defineEmits<{
    retry: [artifactId: string]
    openLive: [url: string]
    interact: [value: { artifactId: string; normalizedX: number; normalizedY: number }]
}>()

const open = ref(false)
const activeIndex = ref(0)
const zoom = ref(1)
const activeArtifact = computed(() => props.artifacts[activeIndex.value] ?? null)

// R1-1 — reka Dialog never renders on the owner's WebView (F5.2 evidence):
// the capture lightbox was unreachable on device. Manual Teleport surface
// with the shared modality (inert #app, Tab trap, Escape/backdrop close).
// R1-SF-B1: this host is ALWAYS mounted under browser evidence — modality
// must follow the open STATE or the whole app goes inert with no modal.
const surfaceRoot = ref<HTMLElement | null>(null)
const { trapTab } = useTalosModalSurface(surfaceRoot, {
    active: computed(() => open.value && activeArtifact.value !== null),
})

function openArtifact(artifactId: string): boolean {
    const index = props.artifacts.findIndex((artifact) => artifact.id === artifactId)
    if (index < 0) return false
    activeIndex.value = index
    zoom.value = 1
    open.value = true
    return true
}

function step(delta: number): void {
    if (props.artifacts.length < 2) return
    activeIndex.value = (activeIndex.value + delta + props.artifacts.length) % props.artifacts.length
    zoom.value = 1
}

function changeZoom(delta: number): void {
    zoom.value = Math.min(4, Math.max(1, Number((zoom.value + delta).toFixed(2))))
}

function interact(event: MouseEvent): void {
    const artifact = activeArtifact.value
    const image = event.currentTarget as HTMLImageElement
    const container = image.parentElement
    if (!props.interactionAvailable || !artifact || !artifact.width || !artifact.height || !container) return
    const rect = container.getBoundingClientRect()
    const mapped = mapBrowserImagePointer(
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        artifact.width,
        artifact.height,
        { clientX: event.clientX, clientY: event.clientY },
        { zoom: zoom.value },
    )
    if (!mapped) return
    emit('interact', {
        artifactId: artifact.id,
        normalizedX: mapped.normalizedX,
        normalizedY: mapped.normalizedY,
    })
}

defineExpose({ openArtifact })
</script>

<template>
    <Teleport to="body">
    <!-- R1-SF-B2: explicit pointer-events-auto — a vaul drawer sets
         body{pointer-events:none}, which would make this surface
         hit-test-transparent. -->
    <div
        v-if="open && activeArtifact"
        class="pointer-events-auto fixed inset-0 z-[85] flex items-center justify-center p-2"
    >
        <div class="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden="true" @click="open = false" />
        <div
            ref="surfaceRoot"
            role="dialog"
            aria-modal="true"
            :aria-label="$t('browser.captureTitle')"
            tabindex="-1"
            data-testid="talos-mobile-browser-frame"
            :data-zoom="String(zoom)"
            class="relative z-10 flex h-[min(92dvh,860px)] w-full max-w-5xl flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-3 text-[var(--talos-text)] outline-none"
            @keydown.escape="open = false"
            @keydown="trapTab"
        >
            <div class="flex items-start justify-between gap-2 text-left">
                <div>
                    <h2 class="text-base font-semibold">{{ $t('browser.captureTitle') }}</h2>
                    <p class="text-sm text-[var(--talos-muted)]">
                        {{ $t('browser.capturePosition', { current: activeIndex + 1, total: artifacts.length }) }}
                    </p>
                </div>
                <Button type="button" size="icon" variant="ghost" :aria-label="$t('browser.closeCapture')" @click="open = false">
                    <X class="size-4" aria-hidden="true" />
                </Button>
            </div>

            <div class="flex min-w-0 flex-wrap items-center gap-1" :aria-label="$t('browser.captureControls')">
                <Button type="button" size="icon" variant="outline" :aria-label="$t('browser.previousCapture')" :disabled="artifacts.length < 2" @click="step(-1)">
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="outline" :aria-label="$t('browser.nextCapture')" :disabled="artifacts.length < 2" @click="step(1)">
                    <ArrowRight class="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="outline" :aria-label="$t('browser.zoomOut')" :disabled="zoom <= 1" @click="changeZoom(-0.5)">
                    <Minus class="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="outline" :aria-label="$t('browser.zoomIn')" :disabled="zoom >= 4" @click="changeZoom(0.5)">
                    <Plus class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="activeArtifact.id === retryArtifactId"
                    type="button"
                    size="icon"
                    variant="outline"
                    :aria-label="$t('browser.retryCurrentFrame')"
                    @click="emit('retry', activeArtifact.id)"
                >
                    <RefreshCw class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="activeArtifact.source_url"
                    type="button"
                    size="sm"
                    variant="outline"
                    class="ml-auto min-h-touch"
                    @click="emit('openLive', activeArtifact.source_url)"
                >
                    <ExternalLink class="size-4" aria-hidden="true" />
                    {{ $t('browser.openLivePage') }}
                </Button>
            </div>

            <div class="relative min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--talos-border)] bg-black/90">
                <img
                    data-testid="talos-mobile-browser-frame-image"
                    :src="activeArtifact.preview_uri ?? undefined"
                    :alt="$t('browser.currentCapture')"
                    class="h-full w-full object-contain transition-transform motion-reduce:transition-none"
                    :class="interactionAvailable ? 'cursor-crosshair' : 'cursor-default'"
                    :style="{ transform: `scale(${zoom})` }"
                    @click="interact"
                >
            </div>
            <p v-if="!interactionAvailable" class="text-xs leading-5 text-[var(--talos-muted)]">
                {{ $t('browser.trustedInteractionUnavailable') }}
            </p>
        </div>
    </div>
    </Teleport>
</template>
