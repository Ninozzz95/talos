<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
    ChevronLeft,
    ChevronRight,
    Hand,
    Loader2,
    MousePointer2,
    RotateCcw,
    ShieldCheck,
    TriangleAlert,
    ZoomIn,
    ZoomOut,
} from '@lucide/vue'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../ui/alert-dialog'
import { Button } from '../../ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog'
import { talosFetch } from '../../../lib/api'
import { mergePersistedBrowserEvidenceWithCurrentFrame } from '../../../lib/talosBrowserEvidence'
import { clampBrowserImagePan, mapBrowserImagePointer } from '../../../lib/talosBrowserImageGeometry'
import type {
    TalosBrowserActivity,
    TalosBrowserArtifact,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserSession,
} from '../../../lib/talosTypes'

type ApiEnvelope<T> = { data: T }

const props = withDefaults(defineProps<{
    activities: TalosBrowserActivity[]
    talosSessionId: string | null
    activeBrowserSession?: TalosBrowserSession | null
    currentFrameActivity?: TalosBrowserActivity | null
    interactionPending?: boolean
    interactionLocked?: boolean
    interactionError?: string | null
    pendingInteractionApproval?: TalosBrowserHmiChallenge | null
    excludedArtifactIds?: string[]
    loadingStrategy?: 'eager' | 'lazy'
}>(), {
    activeBrowserSession: null,
    currentFrameActivity: null,
    interactionPending: false,
    interactionLocked: false,
    interactionError: null,
    pendingInteractionApproval: null,
    excludedArtifactIds: () => [],
    loadingStrategy: 'lazy',
})

const emit = defineEmits<{
    interact: [frame: TalosBrowserPointerFrame]
    confirm: [decision: 'approve' | 'reject']
}>()

const viewerOpen = ref(false)
const selectedArtifactId = ref<string | null>(null)
const artifacts = ref<Record<string, TalosBrowserArtifact>>({})
const artifactLoading = ref(false)
const artifactError = ref<string | null>(null)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
const dragMoved = ref(false)
const dragOrigin = ref({ clientX: 0, clientY: 0, panX: 0, panY: 0 })
const stageEl = ref<HTMLElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const naturalSize = ref({ width: 0, height: 0 })
const imageReady = ref(false)
const previewRevision = ref(0)
const pendingMarker = ref<{ x: number; y: number } | null>(null)
const pointerDispatchLocked = ref(false)
const approvalNow = ref(Date.now())
let pendingSingleClick: ReturnType<typeof setTimeout> | null = null
let approvalClock: ReturnType<typeof setInterval> | null = null
let artifactLoadRevision = 0

const screenshotEvidence = computed(() => {
    if (!props.talosSessionId) return []

    const excluded = new Set(props.excludedArtifactIds)
    const evidence = new Map<string, TalosBrowserActivity>()
    const activities = mergePersistedBrowserEvidenceWithCurrentFrame(
        props.activities,
        viewerOpen.value && props.currentFrameActivity ? [props.currentFrameActivity] : [],
    )
    for (const activity of activities) {
        if (activity.operation !== 'screenshot' || activity.status !== 'succeeded') continue
        for (const artifactId of activity.artifact_ids) {
            if (!excluded.has(artifactId)) evidence.set(artifactId, activity)
        }
    }

    return [...evidence.entries()].slice(-8).map(([artifactId, activity]) => ({ artifactId, activity }))
})

const selectedIndex = computed(() => screenshotEvidence.value.findIndex((item) => item.artifactId === selectedArtifactId.value))
const selectedArtifact = computed(() => selectedArtifactId.value ? artifacts.value[selectedArtifactId.value] ?? null : null)
const selectedPreviewUrl = computed(() => selectedArtifactId.value
    ? artifactPreviewUrl(selectedArtifactId.value, previewRevision.value)
    : '')

function metadataDimension(key: 'width' | 'height') {
    const metadata = selectedArtifact.value?.metadata
    if (!metadata || typeof metadata !== 'object') return 0
    const value = Number(metadata[key])
    return Number.isFinite(value) && value > 0 ? value : 0
}

const sourceSize = computed(() => {
    const metadata = selectedArtifact.value?.metadata
    const width = metadata && typeof metadata === 'object' && Number.isFinite(Number(metadata.width)) && Number(metadata.width) > 0
        ? Number(metadata.width)
        : naturalSize.value.width || props.activeBrowserSession?.viewport?.width || 0
    const height = metadata && typeof metadata === 'object' && Number.isFinite(Number(metadata.height)) && Number(metadata.height) > 0
        ? Number(metadata.height)
        : naturalSize.value.height || props.activeBrowserSession?.viewport?.height || 0

    return { width, height }
})

const isCurrentInteractiveFrame = computed(() => {
    const artifact = selectedArtifact.value
    const session = props.activeBrowserSession
    const hash = artifact?.sha256?.replace(/^sha256:/, '') ?? ''

    return Boolean(artifact
        && session
        && session.id === artifact.browser_session_id
        && session.last_screenshot_artifact_id === artifact.id
        && session.state_version === artifact.state_version
        && ['ready', 'active'].includes(session.status)
        && session.capabilities.includes('interact')
        && !props.interactionLocked
        && !props.interactionPending
        && !artifactLoading.value
        && !artifactError.value
        && imageReady.value
        && naturalSize.value.width === metadataDimension('width')
        && naturalSize.value.height === metadataDimension('height')
        && /^[a-f0-9]{64}$/.test(hash)
        && sourceSize.value.width > 0
        && sourceSize.value.height > 0)
})

const approvalExpiresAt = computed(() => Date.parse(props.pendingInteractionApproval?.expires_at ?? ''))
const approvalExpired = computed(() => !Number.isFinite(approvalExpiresAt.value) || approvalExpiresAt.value <= approvalNow.value)
const approvalSecondsRemaining = computed(() => approvalExpired.value
    ? 0
    : Math.ceil((approvalExpiresAt.value - approvalNow.value) / 1000))
const approvalExpiryLabel = computed(() => {
    if (!Number.isFinite(approvalExpiresAt.value)) return 'invalid expiry'
    return new Date(approvalExpiresAt.value).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
})

function artifactPreviewUrl(artifactId: string, revision = 0) {
    const query = new URLSearchParams({
        talos_session_id: props.talosSessionId ?? '',
        ...(revision > 0 ? { retry: String(revision) } : {}),
    }).toString()
    return `/api/talos/browser/artifacts/${encodeURIComponent(artifactId)}/preview?${query}`
}

function artifactMetadataUrl(artifactId: string) {
    return `/api/talos/browser/artifacts/${encodeURIComponent(artifactId)}`
}

function scopedHeaders() {
    return new Headers({ 'X-Talos-Session-Id': props.talosSessionId ?? '' })
}

function resetViewport() {
    zoom.value = 1
    panX.value = 0
    panY.value = 0
    pendingMarker.value = null
}

async function loadArtifact(artifactId: string, force = false) {
    if (!props.talosSessionId || (!force && artifacts.value[artifactId])) return
    const revision = ++artifactLoadRevision
    artifactLoading.value = true
    artifactError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(artifactMetadataUrl(artifactId), {
            headers: scopedHeaders(),
        })
        if (response.data.id !== artifactId
            || response.data.type !== 'screenshot') {
            throw new Error('The browser artifact did not match the requested capture.')
        }
        artifacts.value = { ...artifacts.value, [artifactId]: response.data }
    } catch (error) {
        if (revision === artifactLoadRevision && selectedArtifactId.value === artifactId) {
            artifactError.value = error instanceof Error ? error.message : 'TALOS could not load this browser capture.'
        }
    } finally {
        if (revision === artifactLoadRevision) artifactLoading.value = false
    }
}

async function openArtifact(artifactId: string) {
    artifactLoadRevision += 1
    artifactLoading.value = false
    selectedArtifactId.value = artifactId
    imageReady.value = false
    naturalSize.value = { width: 0, height: 0 }
    artifactError.value = null
    resetViewport()
    viewerOpen.value = true
    await nextTick()
    await loadArtifact(artifactId)
}

async function selectAt(index: number) {
    if (!screenshotEvidence.value.length) return
    const bounded = (index + screenshotEvidence.value.length) % screenshotEvidence.value.length
    await openArtifact(screenshotEvidence.value[bounded].artifactId)
}

function setZoom(value: number) {
    zoom.value = Math.min(4, Math.max(1, value))
    if (zoom.value === 1) {
        panX.value = 0
        panY.value = 0
    } else {
        const clamped = clampCurrentPan(panX.value, panY.value)
        panX.value = clamped.panX
        panY.value = clamped.panY
    }
}

function onImageLoad(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    if (image.dataset.browserArtifactId !== selectedArtifactId.value) return
    naturalSize.value = { width: image.naturalWidth, height: image.naturalHeight }
    const expectedWidth = metadataDimension('width')
    const expectedHeight = metadataDimension('height')
    if (!expectedWidth || !expectedHeight) {
        imageReady.value = false
        artifactError.value = 'Capture dimensions were missing from signed metadata.'
        return
    }
    if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        imageReady.value = false
        artifactError.value = 'The decoded capture dimensions did not match signed metadata.'
        return
    }
    artifactError.value = null
    imageReady.value = true
}

function onImageError(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    if (image.dataset.browserArtifactId !== selectedArtifactId.value) return
    imageReady.value = false
    naturalSize.value = { width: 0, height: 0 }
    artifactError.value = 'TALOS could not decode this browser capture.'
}

async function retrySelectedArtifact() {
    const artifactId = selectedArtifactId.value
    if (!artifactId) return
    artifactError.value = null
    imageReady.value = false
    naturalSize.value = { width: 0, height: 0 }
    previewRevision.value += 1
    await loadArtifact(artifactId, !artifacts.value[artifactId])
}

function clearPendingSingleClick() {
    if (pendingSingleClick !== null) {
        clearTimeout(pendingSingleClick)
        pendingSingleClick = null
    }
}

function dispatchPointer(
    mapped: NonNullable<ReturnType<typeof mapBrowserImagePointer>>,
    clickCount: 1 | 2,
) {
    if (pointerDispatchLocked.value
        || !isCurrentInteractiveFrame.value
        || props.interactionPending
        || props.interactionLocked
        || !stageEl.value
        || !selectedArtifact.value
        || !props.activeBrowserSession) return

    pointerDispatchLocked.value = true
    pendingMarker.value = {
        x: mapped.paintedRect.left - stageEl.value.getBoundingClientRect().left + (mapped.normalizedX * mapped.paintedRect.width),
        y: mapped.paintedRect.top - stageEl.value.getBoundingClientRect().top + (mapped.normalizedY * mapped.paintedRect.height),
    }
    emit('interact', {
        browserSessionId: props.activeBrowserSession.id,
        artifact: selectedArtifact.value,
        normalizedX: mapped.normalizedX,
        normalizedY: mapped.normalizedY,
        clickCount,
    })
}

function onStageClick(event: MouseEvent) {
    if (dragMoved.value) {
        dragMoved.value = false
        return
    }
    if (pointerDispatchLocked.value || !isCurrentInteractiveFrame.value || props.interactionPending || props.interactionLocked || !stageEl.value || !selectedArtifact.value || !props.activeBrowserSession) return

    const mapped = mapBrowserImagePointer(
        stageEl.value.getBoundingClientRect(),
        sourceSize.value.width,
        sourceSize.value.height,
        { clientX: event.clientX, clientY: event.clientY },
        { zoom: zoom.value, panX: panX.value, panY: panY.value },
    )
    if (!mapped) return

    pendingMarker.value = {
        x: mapped.paintedRect.left - stageEl.value.getBoundingClientRect().left + (mapped.normalizedX * mapped.paintedRect.width),
        y: mapped.paintedRect.top - stageEl.value.getBoundingClientRect().top + (mapped.normalizedY * mapped.paintedRect.height),
    }

    if (event.detail >= 2) {
        clearPendingSingleClick()
        dispatchPointer(mapped, 2)
        return
    }
    if (pendingSingleClick !== null) return

    pendingSingleClick = setTimeout(() => {
        pendingSingleClick = null
        dispatchPointer(mapped, 1)
    }, 220)
}

function onPointerDown(event: PointerEvent) {
    if (zoom.value <= 1 || event.button !== 0) return
    dragging.value = true
    dragMoved.value = false
    dragOrigin.value = { clientX: event.clientX, clientY: event.clientY, panX: panX.value, panY: panY.value }
    stageEl.value?.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
    if (!dragging.value) return
    const dx = event.clientX - dragOrigin.value.clientX
    const dy = event.clientY - dragOrigin.value.clientY
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved.value = true
    const clamped = clampCurrentPan(dragOrigin.value.panX + dx, dragOrigin.value.panY + dy)
    panX.value = clamped.panX
    panY.value = clamped.panY
}

function clampCurrentPan(requestedPanX: number, requestedPanY: number) {
    const bounds = stageEl.value?.getBoundingClientRect()
    if (!bounds) return { panX: 0, panY: 0 }
    return clampBrowserImagePan(
        bounds,
        sourceSize.value.width,
        sourceSize.value.height,
        { zoom: zoom.value, panX: requestedPanX, panY: requestedPanY },
    )
}

function onPointerUp(event: PointerEvent) {
    if (!dragging.value) return
    dragging.value = false
    stageEl.value?.releasePointerCapture?.(event.pointerId)
}

function onViewerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
        event.preventDefault()
        void selectAt(selectedIndex.value - 1)
    } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        void selectAt(selectedIndex.value + 1)
    }
}

function onApprovalEscape(event: Event) {
    event.preventDefault()
    if (!props.interactionPending && props.pendingInteractionApproval) emit('confirm', 'reject')
}

function confirmApproval(decision: 'approve' | 'reject') {
    if (props.interactionPending || !props.pendingInteractionApproval) return
    if (decision === 'approve' && approvalExpired.value) return
    emit('confirm', decision)
}

function stopApprovalClock() {
    if (approvalClock !== null) {
        clearInterval(approvalClock)
        approvalClock = null
    }
}

watch(() => props.talosSessionId, () => {
    artifactLoadRevision += 1
    clearPendingSingleClick()
    viewerOpen.value = false
    selectedArtifactId.value = null
    artifacts.value = {}
    artifactLoading.value = false
    artifactError.value = null
    naturalSize.value = { width: 0, height: 0 }
    imageReady.value = false
    previewRevision.value = 0
    pointerDispatchLocked.value = false
    resetViewport()
})

watch(() => [
    props.activeBrowserSession?.last_screenshot_artifact_id ?? '',
    screenshotEvidence.value.map((item) => item.artifactId).join('|'),
], ([artifactId]) => {
    if (viewerOpen.value && artifactId && screenshotEvidence.value.some((item) => item.artifactId === artifactId)) {
        pointerDispatchLocked.value = false
        if (selectedArtifactId.value !== artifactId) void openArtifact(artifactId)
    }
})

watch(() => props.interactionPending, (pending) => {
    if (!pending && !props.pendingInteractionApproval && !props.interactionLocked) {
        pointerDispatchLocked.value = false
        pendingMarker.value = null
    }
})

watch(() => props.pendingInteractionApproval, (approval) => {
    stopApprovalClock()
    approvalNow.value = Date.now()
    if (approval) {
        approvalClock = setInterval(() => {
            approvalNow.value = Date.now()
        }, 1000)
    } else if (!props.interactionPending && !props.interactionLocked) {
        pointerDispatchLocked.value = false
    }
}, { immediate: true })

watch(() => props.interactionError, (error) => {
    if (error && !props.interactionPending && !props.pendingInteractionApproval && !props.interactionLocked) pointerDispatchLocked.value = false
})

watch(() => props.interactionLocked, (locked) => {
    if (locked) {
        clearPendingSingleClick()
        pointerDispatchLocked.value = true
        pendingMarker.value = null
    } else if (!props.interactionPending && !props.pendingInteractionApproval) {
        pointerDispatchLocked.value = false
    }
})

watch(viewerOpen, (open) => {
    if (!open) {
        clearPendingSingleClick()
        pointerDispatchLocked.value = false
        pendingMarker.value = null
    }
})

onBeforeUnmount(() => {
    clearPendingSingleClick()
    stopApprovalClock()
})
</script>

<template>
    <figure v-if="screenshotEvidence.length" data-testid="talos-browser-screenshot-evidence" class="mt-3 min-w-0 max-w-full overflow-hidden">
        <figcaption class="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase text-[var(--talos-muted)]">
            <span>Integrity-verified capture</span>
            <span>{{ screenshotEvidence.length }} artifact{{ screenshotEvidence.length === 1 ? '' : 's' }}</span>
        </figcaption>
        <div class="grid min-w-0 gap-2" :class="screenshotEvidence.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'">
            <button
                v-for="evidence in screenshotEvidence.slice(-2)"
                :key="evidence.artifactId"
                type="button"
                :data-testid="`browser-evidence-open-${evidence.artifactId}`"
                class="group relative block min-w-0 overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-label="`Inspect browser capture ${screenshotEvidence.findIndex((item) => item.artifactId === evidence.artifactId) + 1} of ${screenshotEvidence.length}`"
                @click="openArtifact(evidence.artifactId)"
            >
                <img
                    :src="artifactPreviewUrl(evidence.artifactId)"
                    :data-browser-artifact-id="evidence.artifactId"
                    :alt="`Browser screenshot ${screenshotEvidence.findIndex((item) => item.artifactId === evidence.artifactId) + 1} of ${screenshotEvidence.length}`"
                    class="aspect-[8/5] w-full bg-[var(--talos-panel-soft)] object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                    :loading="loadingStrategy"
                >
                <span class="absolute bottom-2 right-2 rounded border border-[var(--talos-border)] bg-[var(--talos-background)]/90 px-2 py-1 text-[10px] font-semibold text-[var(--talos-text)]">Inspect</span>
            </button>
        </div>
    </figure>

    <Dialog v-model:open="viewerOpen">
        <DialogContent
            class="inset-0 left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[var(--talos-background)] p-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88dvh,900px)] sm:w-[min(94vw,1440px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md sm:border sm:border-[var(--talos-border)]"
        >
            <div class="contents" @keydown="onViewerKeydown">
            <DialogHeader class="shrink-0 border-b border-[var(--talos-border)] px-4 py-3 pr-14 text-left">
                <div class="flex min-w-0 items-center gap-3">
                    <ShieldCheck class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                    <div class="min-w-0">
                        <DialogTitle class="truncate text-sm font-semibold text-[var(--talos-text)]">Integrity-verified capture</DialogTitle>
                        <DialogDescription class="mt-0.5 text-xs text-[var(--talos-muted)]">
                            Untrusted browser content. Human pointer actions are policy checked and recorded.
                        </DialogDescription>
                    </div>
                </div>
            </DialogHeader>

            <div class="flex min-h-0 flex-1 flex-col bg-[var(--talos-panel-soft)]">
                <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--talos-border)] px-3 py-2">
                    <div class="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" :disabled="screenshotEvidence.length < 2" aria-label="Previous capture" @click="selectAt(selectedIndex - 1)">
                            <ChevronLeft />
                        </Button>
                        <span class="min-w-14 text-center text-xs text-[var(--talos-muted)]">{{ selectedIndex + 1 }} / {{ screenshotEvidence.length }}</span>
                        <Button variant="ghost" size="icon-sm" :disabled="screenshotEvidence.length < 2" aria-label="Next capture" @click="selectAt(selectedIndex + 1)">
                            <ChevronRight />
                        </Button>
                    </div>
                    <div class="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" :disabled="zoom <= 1" aria-label="Zoom out" @click="setZoom(zoom - 0.25)"><ZoomOut /></Button>
                        <span class="min-w-12 text-center text-xs tabular-nums text-[var(--talos-muted)]">{{ Math.round(zoom * 100) }}%</span>
                        <Button variant="ghost" size="icon-sm" :disabled="zoom >= 4" aria-label="Zoom in" @click="setZoom(zoom + 0.25)"><ZoomIn /></Button>
                        <Button variant="ghost" size="icon-sm" :disabled="zoom === 1 && panX === 0 && panY === 0" aria-label="Reset view" @click="resetViewport"><RotateCcw /></Button>
                    </div>
                </div>

                <div
                    ref="stageEl"
                    data-testid="browser-evidence-stage"
                    class="relative min-h-0 flex-1 overflow-hidden bg-black/90"
                    :class="[
                        zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : isCurrentInteractiveFrame ? 'cursor-crosshair' : 'cursor-default',
                        interactionPending || interactionLocked ? 'pointer-events-none' : '',
                    ]"
                    :aria-busy="artifactLoading || Boolean(selectedArtifactId && !imageReady && !artifactError) || interactionPending"
                    @click="onStageClick"
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @pointercancel="onPointerUp"
                >
                    <img
                        v-if="selectedArtifactId && selectedArtifact"
                        ref="imageEl"
                        :key="`${selectedArtifactId}-${previewRevision}`"
                        :src="selectedPreviewUrl"
                        :data-browser-artifact-id="selectedArtifactId"
                        :data-testid="`browser-evidence-image-${selectedArtifactId}`"
                        alt="Selected browser screenshot"
                        class="pointer-events-none h-full w-full select-none object-contain will-change-transform"
                        :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
                        draggable="false"
                        @load="onImageLoad"
                        @error="onImageError"
                    >
                    <div v-if="artifactLoading || (selectedArtifactId && !imageReady && !artifactError)" role="status" aria-live="polite" class="absolute inset-0 z-20 flex items-center justify-center text-sm text-white/80">
                        <Loader2 class="mr-2 h-4 w-4 animate-spin" /> Loading capture
                    </div>
                    <div v-if="artifactError" role="alert" class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--talos-warning)]">
                        <span class="flex items-center"><TriangleAlert class="mr-2 h-4 w-4 shrink-0" /> {{ artifactError }}</span>
                        <Button data-testid="browser-evidence-retry" variant="outline" size="sm" @click.stop="retrySelectedArtifact">Retry capture</Button>
                    </div>
                    <span
                        v-if="pendingMarker"
                        class="pointer-events-none absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--talos-accent)] shadow-[0_0_0_6px_rgb(255_255_255/0.18)]"
                        :style="{ left: `${pendingMarker.x}px`, top: `${pendingMarker.y}px` }"
                        aria-hidden="true"
                    />
                </div>

                <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-2 text-xs">
                    <div role="status" aria-live="polite" class="flex min-w-0 items-center gap-2 text-[var(--talos-muted)]">
                        <Hand v-if="zoom > 1" class="h-3.5 w-3.5 shrink-0" />
                        <MousePointer2 v-else class="h-3.5 w-3.5 shrink-0" />
                        <span v-if="interactionPending">Interaction in progress</span>
                        <span v-else-if="interactionLocked">Recovery required before further interaction</span>
                        <span v-else-if="selectedArtifactId && !imageReady && !artifactError">Capture is still loading</span>
                        <span v-else-if="isCurrentInteractiveFrame">Click the current frame to interact</span>
                        <span v-else>Historical frame, inspection only</span>
                    </div>
                    <span v-if="interactionError" role="alert" class="max-w-full break-words text-[var(--talos-warning)]">{{ interactionError }}</span>
                </div>
            </div>
            </div>
        </DialogContent>
    </Dialog>

    <AlertDialog :open="Boolean(viewerOpen && pendingInteractionApproval)">
        <AlertDialogContent
            class="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto border-[var(--talos-warning-border)] bg-[var(--talos-background)]"
            @escape-key-down="onApprovalEscape"
        >
            <AlertDialogHeader>
                <AlertDialogTitle class="text-[var(--talos-text)]">Confirm browser action</AlertDialogTitle>
                <AlertDialogDescription class="space-y-3 text-[var(--talos-muted)]">
                    <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ pendingInteractionApproval?.action.label }}</span>
                    <span class="block break-all text-xs">{{ pendingInteractionApproval?.action.origin }}</span>
                    <span class="block text-sm">{{ pendingInteractionApproval?.action.consequence }}</span>
                    <span class="block text-xs uppercase text-[var(--talos-warning)]">Category: {{ pendingInteractionApproval?.action.category }}</span>
                    <span v-if="approvalExpired" role="alert" class="block text-sm font-semibold text-[var(--talos-warning)]">Approval expired. Reject and retry the action.</span>
                    <span v-else role="status" aria-live="polite" class="block text-xs">Approval expires at {{ approvalExpiryLabel }} ({{ approvalSecondsRemaining }}s remaining).</span>
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel data-testid="browser-hmi-reject" :disabled="interactionPending" @click="confirmApproval('reject')">Reject</AlertDialogCancel>
                <AlertDialogAction data-testid="browser-hmi-confirm" :disabled="interactionPending || approvalExpired" @click="confirmApproval('approve')">Confirm action</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
</template>
