<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ArrowRight, ExternalLink, Minus, Plus, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
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
    <Dialog v-model:open="open">
        <DialogContent
            v-if="activeArtifact"
            data-testid="talos-mobile-browser-frame"
            :data-zoom="String(zoom)"
            class="flex h-[min(92dvh,860px)] max-w-[calc(100%-1rem)] flex-col gap-3 overflow-hidden border border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-3 text-[var(--talos-text)] sm:max-w-5xl"
        >
            <DialogHeader class="pr-10 text-left">
                <DialogTitle>Browser capture</DialogTitle>
                <DialogDescription class="text-[var(--talos-muted)]">
                    Capture {{ activeIndex + 1 }} of {{ artifacts.length }}. Page content is untrusted evidence.
                </DialogDescription>
            </DialogHeader>

            <div class="flex min-w-0 flex-wrap items-center gap-1" aria-label="Browser capture controls">
                <Button type="button" size="icon" variant="outline" aria-label="Previous browser capture" :disabled="artifacts.length < 2" @click="step(-1)">
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="outline" aria-label="Next browser capture" :disabled="artifacts.length < 2" @click="step(1)">
                    <ArrowRight class="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="outline" aria-label="Zoom browser capture out" :disabled="zoom <= 1" @click="changeZoom(-0.5)">
                    <Minus class="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="outline" aria-label="Zoom browser capture in" :disabled="zoom >= 4" @click="changeZoom(0.5)">
                    <Plus class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="activeArtifact.id === retryArtifactId"
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Retry browser action on current frame"
                    @click="emit('retry', activeArtifact.id)"
                >
                    <RefreshCw class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="activeArtifact.source_url"
                    type="button"
                    size="sm"
                    variant="outline"
                    class="ml-auto min-h-11"
                    @click="emit('openLive', activeArtifact.source_url)"
                >
                    <ExternalLink class="size-4" aria-hidden="true" />
                    Open live page
                </Button>
            </div>

            <div class="relative min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--talos-border)] bg-black/90">
                <img
                    data-testid="talos-mobile-browser-frame-image"
                    :src="activeArtifact.preview_uri ?? undefined"
                    alt="Current browser capture"
                    class="h-full w-full object-contain transition-transform motion-reduce:transition-none"
                    :class="interactionAvailable ? 'cursor-crosshair' : 'cursor-default'"
                    :style="{ transform: `scale(${zoom})` }"
                    @click="interact"
                >
            </div>
            <p v-if="!interactionAvailable" class="text-xs leading-5 text-[var(--talos-muted)]">
                Trusted interaction unavailable. Pair an authenticated TALOS node before clicks or scroll commands can be sent.
            </p>
        </DialogContent>
    </Dialog>
</template>
