<script lang="ts">
export type TalosBrowserInteractiveFrameHandle = {
    openArtifact: (artifactId: string) => Promise<void>
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
    ArrowDown,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Hand,
    Loader2,
    MousePointer2,
    RotateCcw,
    ShieldCheck,
    TriangleAlert,
    X,
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
    DialogTitle,
} from '../../ui/dialog'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
} from '../../ui/drawer'
import { talosFetch } from '../../../lib/api'
import { clampBrowserImagePan, mapBrowserImagePointer } from '../../../lib/talosBrowserImageGeometry'
import { browserScrollStep, normalizeBrowserWheelDelta } from '../../../lib/talosBrowserWheel'
import type {
    TalosBrowserActivity,
    TalosBrowserArtifact,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserRefFrame,
    TalosBrowserRefInteraction,
    TalosBrowserRefTarget,
    TalosBrowserScrollFrame,
    TalosBrowserSession,
    TalosMobileWindowPresentation,
} from '../../../lib/talosTypes'

type ApiEnvelope<T> = { data: T }
type FramePresentation = 'desktop-dialog' | TalosMobileWindowPresentation

const props = withDefaults(defineProps<{
    artifactIds: string[]
    talosSessionId: string | null
    activeBrowserSession?: TalosBrowserSession | null
    currentFrameActivity?: TalosBrowserActivity | null
    interactionPending?: boolean
    interactionLocked?: boolean
    interactionError?: string | null
    pendingInteractionApproval?: TalosBrowserHmiChallenge | null
    refFrame?: TalosBrowserRefFrame | null
    refTargetsLoading?: boolean
    refTargetsError?: string | null
    mobile?: boolean
    mobileWindowPresentation?: TalosMobileWindowPresentation
}>(), {
    activeBrowserSession: null,
    currentFrameActivity: null,
    interactionPending: false,
    interactionLocked: false,
    interactionError: null,
    pendingInteractionApproval: null,
    refFrame: null,
    refTargetsLoading: false,
    refTargetsError: null,
    mobile: false,
    mobileWindowPresentation: 'drawer',
})

const emit = defineEmits<{
    interact: [frame: TalosBrowserPointerFrame]
    interactRef: [interaction: TalosBrowserRefInteraction]
    scroll: [frame: TalosBrowserScrollFrame]
    confirm: [decision: 'approve' | 'reject']
}>()

const viewerOpen = ref(false)
const activePresentation = ref<FramePresentation>('desktop-dialog')
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
const titleEl = ref<HTMLElement | null>(null)
const naturalSize = ref({ width: 0, height: 0 })
const imageReady = ref(false)
const previewRevision = ref(0)
const pendingMarker = ref<{ x: number; y: number } | null>(null)
const pointerDispatchLocked = ref(false)
const approvalNow = ref(Date.now())
const launcherEl = ref<HTMLElement | null>(null)
const focusRestored = ref(false)
let pendingSingleClick: ReturnType<typeof setTimeout> | null = null
let pendingWheel: ReturnType<typeof setTimeout> | null = null
let pendingWheelDelta = 0
let approvalClock: ReturnType<typeof setInterval> | null = null
let artifactLoadRevision = 0

const currentFrameArtifactIds = computed(() => {
    const activity = props.currentFrameActivity
    if (!viewerOpen.value
        || !activity
        || activity.operation !== 'screenshot'
        || activity.status !== 'succeeded') return []

    return activity.artifact_ids
})

const galleryArtifactIds = computed(() => [...new Set([
    ...props.artifactIds,
    ...currentFrameArtifactIds.value,
])].slice(-8))
const selectedIndex = computed(() => galleryArtifactIds.value.indexOf(selectedArtifactId.value ?? ''))
const selectedArtifact = computed(() => selectedArtifactId.value ? artifacts.value[selectedArtifactId.value] ?? null : null)
const selectedPreviewUrl = computed(() => selectedArtifactId.value
    ? artifactPreviewUrl(selectedArtifactId.value, previewRevision.value)
    : '')
const usesDrawer = computed(() => activePresentation.value === 'drawer')
const surface = computed(() => usesDrawer.value ? {
    root: Drawer,
    content: DrawerContent,
    title: DrawerTitle,
    description: DrawerDescription,
    upstream: 'shadcn-vue-reka-drawer',
} : {
    root: Dialog,
    content: DialogContent,
    title: DialogTitle,
    description: DialogDescription,
    upstream: 'shadcn-vue-dialog',
})
const surfaceContentClass = computed(() => usesDrawer.value
    ? 'z-[80] h-[min(92dvh,900px)] max-h-[calc(100dvh-env(safe-area-inset-top))] gap-0 overflow-hidden rounded-t-md border-[var(--talos-border)] bg-[var(--talos-background)] p-0 text-[var(--talos-text)]'
    : activePresentation.value === 'fullscreen'
        ? 'inset-0 left-0 top-0 z-[80] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[var(--talos-background)] p-0 text-[var(--talos-text)]'
        : 'z-[80] flex h-[min(88dvh,900px)] w-[min(94vw,1440px)] max-w-none flex-col gap-0 overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)] p-0 text-[var(--talos-text)]')

function metadataDimension(key: 'width' | 'height') {
    const metadata = selectedArtifact.value?.metadata
    if (!metadata || typeof metadata !== 'object') return 0
    const value = Number(metadata[key])
    return Number.isFinite(value) && value > 0 ? value : 0
}

const sourceSize = computed(() => ({
    width: metadataDimension('width') || naturalSize.value.width || props.activeBrowserSession?.viewport?.width || 0,
    height: metadataDimension('height') || naturalSize.value.height || props.activeBrowserSession?.viewport?.height || 0,
}))
const selectedIsCurrentArtifact = computed(() => {
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
        && /^[a-f0-9]{64}$/.test(hash))
})
const currentDecodedRefFrame = computed(() => {
    const frame = props.refFrame
    const artifact = selectedArtifact.value
    const session = props.activeBrowserSession
    if (!frame
        || !artifact
        || !session
        || !selectedIsCurrentArtifact.value
        || !imageReady.value
        || naturalSize.value.width !== metadataDimension('width')
        || naturalSize.value.height !== metadataDimension('height')
        || frame.browser_session_id !== session.id
        || frame.state_version !== session.state_version
        || frame.screenshot.id !== artifact.id
        || frame.screenshot.state_version !== artifact.state_version
        || frame.snapshot_id.trim() === ''
        || frame.frame_sha256 !== `sha256:${artifact.sha256?.replace(/^sha256:/, '') ?? ''}`) return null

    return frame
})
const refControlsDisabled = computed(() => Boolean(
    !currentDecodedRefFrame.value
    || props.interactionPending
    || props.interactionLocked
    || pointerDispatchLocked.value,
))
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
            || response.data.type !== 'screenshot'
            || response.data.mime !== 'image/png'
            || response.data.trust_boundary !== 'untrusted_browser_content') {
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

async function selectArtifact(artifactId: string) {
    if (!props.talosSessionId || !galleryArtifactIds.value.includes(artifactId)) return
    clearPendingWheel()
    artifactLoadRevision += 1
    artifactLoading.value = false
    selectedArtifactId.value = artifactId
    imageReady.value = false
    naturalSize.value = { width: 0, height: 0 }
    artifactError.value = null
    resetViewport()
    await loadArtifact(artifactId)
}

async function openArtifact(artifactId: string) {
    if (!props.talosSessionId || !galleryArtifactIds.value.includes(artifactId)) return
    const opening = !viewerOpen.value
    if (opening) {
        launcherEl.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
        focusRestored.value = false
        activePresentation.value = props.mobile ? props.mobileWindowPresentation : 'desktop-dialog'
    }
    const artifactSelection = selectArtifact(artifactId)
    if (opening) {
        viewerOpen.value = true
        await nextTick()
    }
    await artifactSelection
    if (opening) {
        await nextTick()
        focusTitleElement()
    }
}

async function selectAt(index: number) {
    if (!galleryArtifactIds.value.length) return
    const bounded = (index + galleryArtifactIds.value.length) % galleryArtifactIds.value.length
    await selectArtifact(galleryArtifactIds.value[bounded])
}

function updateViewerOpen(open: boolean) {
    viewerOpen.value = open
}

function setZoom(value: number) {
    zoom.value = Math.min(4, Math.max(1, value))
    if (zoom.value === 1) {
        panX.value = 0
        panY.value = 0
        return
    }
    const clamped = clampCurrentPan(panX.value, panY.value)
    panX.value = clamped.panX
    panY.value = clamped.panY
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
    if (pendingSingleClick === null) return
    clearTimeout(pendingSingleClick)
    pendingSingleClick = null
}

function clearPendingWheel() {
    if (pendingWheel !== null) clearTimeout(pendingWheel)
    pendingWheel = null
    pendingWheelDelta = 0
}

function dispatchScroll(deltaY: number) {
    if (pointerDispatchLocked.value
        || !isCurrentInteractiveFrame.value
        || props.interactionPending
        || props.interactionLocked
        || !selectedArtifact.value
        || !props.activeBrowserSession
        || !Number.isFinite(deltaY)
        || deltaY === 0) return

    clearPendingSingleClick()
    pointerDispatchLocked.value = true
    pendingMarker.value = null
    emit('scroll', {
        browserSessionId: props.activeBrowserSession.id,
        artifact: selectedArtifact.value,
        deltaY,
    })
}

function onStageWheel(event: WheelEvent) {
    if (pointerDispatchLocked.value
        || !isCurrentInteractiveFrame.value
        || props.interactionPending
        || props.interactionLocked) return
    const deltaY = normalizeBrowserWheelDelta(event, sourceSize.value.height)
    if (deltaY === 0) return

    event.preventDefault()
    pendingWheelDelta = normalizeBrowserWheelDelta({
        deltaY: pendingWheelDelta + deltaY,
        deltaMode: 0,
    }, sourceSize.value.height)
    if (pendingWheel !== null) clearTimeout(pendingWheel)
    pendingWheel = setTimeout(() => {
        const coalescedDelta = pendingWheelDelta
        pendingWheel = null
        pendingWheelDelta = 0
        dispatchScroll(coalescedDelta)
    }, 80)
}

function scrollByControl(direction: 'up' | 'down') {
    clearPendingWheel()
    dispatchScroll(browserScrollStep(sourceSize.value.height, direction))
}

function destinationHost(destination: string | null) {
    if (!destination) return null
    try {
        return new URL(destination).host || null
    } catch {
        return null
    }
}

function dispatchRef(target: TalosBrowserRefTarget) {
    const frame = currentDecodedRefFrame.value
    const artifact = selectedArtifact.value
    const session = props.activeBrowserSession
    if (!frame
        || !artifact
        || !session
        || refControlsDisabled.value
        || !frame.targets.some((candidate) => candidate.ref === target.ref)) return

    clearPendingSingleClick()
    clearPendingWheel()
    pointerDispatchLocked.value = true
    pendingMarker.value = null
    emit('interactRef', {
        browserSessionId: session.id,
        artifact,
        snapshotId: frame.snapshot_id,
        ref: target.ref,
        clickCount: 1,
    })
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

    clearPendingWheel()
    pointerDispatchLocked.value = true
    const bounds = stageEl.value.getBoundingClientRect()
    pendingMarker.value = {
        x: mapped.paintedRect.left - bounds.left + (mapped.normalizedX * mapped.paintedRect.width),
        y: mapped.paintedRect.top - bounds.top + (mapped.normalizedY * mapped.paintedRect.height),
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
    if (pointerDispatchLocked.value
        || !isCurrentInteractiveFrame.value
        || props.interactionPending
        || props.interactionLocked
        || !stageEl.value) return

    const mapped = mapBrowserImagePointer(
        stageEl.value.getBoundingClientRect(),
        sourceSize.value.width,
        sourceSize.value.height,
        { clientX: event.clientX, clientY: event.clientY },
        { zoom: zoom.value, panX: panX.value, panY: panY.value },
    )
    if (!mapped) return
    const bounds = stageEl.value.getBoundingClientRect()
    pendingMarker.value = {
        x: mapped.paintedRect.left - bounds.left + (mapped.normalizedX * mapped.paintedRect.width),
        y: mapped.paintedRect.top - bounds.top + (mapped.normalizedY * mapped.paintedRect.height),
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

function focusFrameTitle(event: Event) {
    event.preventDefault()
    void nextTick(focusTitleElement)
}

function focusTitleElement() {
    const title = titleEl.value
        ?? document.querySelector<HTMLElement>('[data-testid="talos-browser-interactive-frame-title"]')
    title?.focus()
}

function restoreLauncherFocus(event?: Event) {
    event?.preventDefault()
    if (focusRestored.value) return
    focusRestored.value = true
    void nextTick(() => {
        if (isVisibleFocusTarget(launcherEl.value)) launcherEl.value.focus()
    })
}

function isVisibleFocusTarget(element: HTMLElement | null): element is HTMLElement {
    if (!element?.isConnected || element.hasAttribute('disabled') || element.closest('[hidden]')) return false
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const browserHasLayout = document.documentElement.getClientRects().length > 0
    return !browserHasLayout || element.getClientRects().length > 0
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
    if (approvalClock === null) return
    clearInterval(approvalClock)
    approvalClock = null
}

watch(() => props.talosSessionId, () => {
    artifactLoadRevision += 1
    clearPendingSingleClick()
    clearPendingWheel()
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
    galleryArtifactIds.value.join('|'),
], ([artifactId]) => {
    if (viewerOpen.value && artifactId && galleryArtifactIds.value.includes(artifactId)) {
        pointerDispatchLocked.value = false
        if (selectedArtifactId.value !== artifactId) void selectArtifact(artifactId)
    }
})

watch(() => props.interactionPending, (pending) => {
    if (pending) clearPendingWheel()
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
    if (error && !props.interactionPending && !props.pendingInteractionApproval && !props.interactionLocked) {
        pointerDispatchLocked.value = false
    }
})

watch(() => props.interactionLocked, (locked) => {
    if (locked) {
        clearPendingSingleClick()
        clearPendingWheel()
        pointerDispatchLocked.value = true
        pendingMarker.value = null
    } else if (!props.interactionPending && !props.pendingInteractionApproval) {
        pointerDispatchLocked.value = false
    }
})

watch(viewerOpen, (open) => {
    if (open) return
    clearPendingSingleClick()
    clearPendingWheel()
    pointerDispatchLocked.value = false
    pendingMarker.value = null
    restoreLauncherFocus()
})

onBeforeUnmount(() => {
    clearPendingSingleClick()
    clearPendingWheel()
    stopApprovalClock()
    restoreLauncherFocus()
})

defineExpose<TalosBrowserInteractiveFrameHandle>({ openArtifact })
</script>

<template>
    <component
        :is="surface.root"
        :open="viewerOpen"
        :modal="true"
        @update:open="updateViewerOpen"
    >
        <component
            :is="surface.content"
            :show-close="false"
            :class="surfaceContentClass"
            data-testid="talos-browser-interactive-frame"
            aria-modal="true"
            :data-window-presentation="activePresentation"
            :data-talos-upstream="surface.upstream"
            @open-auto-focus="focusFrameTitle"
            @close-auto-focus="restoreLauncherFocus"
            @keydown="onViewerKeydown"
        >
            <header class="flex shrink-0 items-start gap-3 border-b border-[var(--talos-border)] px-4 py-3 text-left">
                <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                    <component :is="surface.title" as-child>
                        <h2
                            ref="titleEl"
                            data-testid="talos-browser-interactive-frame-title"
                            tabindex="-1"
                            class="truncate text-sm font-semibold text-[var(--talos-text)] outline-none"
                        >
                            Integrity-verified capture
                        </h2>
                    </component>
                    <component :is="surface.description" class="mt-1 text-xs text-[var(--talos-muted)]">
                        Untrusted browser content. Human pointer actions are policy checked and recorded.
                    </component>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Close browser capture" @click="viewerOpen = false">
                    <X aria-hidden="true" />
                </Button>
            </header>

            <div class="flex min-h-0 flex-1 flex-col bg-[var(--talos-panel-soft)]">
                <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--talos-border)] px-3 py-2">
                    <div class="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" :disabled="galleryArtifactIds.length < 2" aria-label="Previous capture" @click="selectAt(selectedIndex - 1)">
                            <ChevronLeft aria-hidden="true" />
                        </Button>
                        <span class="min-w-14 text-center text-xs text-[var(--talos-muted)]">{{ selectedIndex + 1 }} / {{ galleryArtifactIds.length }}</span>
                        <Button variant="ghost" size="icon-sm" :disabled="galleryArtifactIds.length < 2" aria-label="Next capture" @click="selectAt(selectedIndex + 1)">
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </div>
                    <div class="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" :disabled="!isCurrentInteractiveFrame || pointerDispatchLocked" aria-label="Scroll browser page up" @click="scrollByControl('up')"><ArrowUp aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon-sm" :disabled="!isCurrentInteractiveFrame || pointerDispatchLocked" aria-label="Scroll browser page down" @click="scrollByControl('down')"><ArrowDown aria-hidden="true" /></Button>
                        <span class="mx-1 h-4 w-px bg-[var(--talos-border)]" aria-hidden="true" />
                        <Button variant="ghost" size="icon-sm" :disabled="zoom <= 1" aria-label="Zoom out" @click="setZoom(zoom - 0.25)"><ZoomOut aria-hidden="true" /></Button>
                        <span class="min-w-12 text-center text-xs tabular-nums text-[var(--talos-muted)]">{{ Math.round(zoom * 100) }}%</span>
                        <Button variant="ghost" size="icon-sm" :disabled="zoom >= 4" aria-label="Zoom in" @click="setZoom(zoom + 0.25)"><ZoomIn aria-hidden="true" /></Button>
                        <Button variant="ghost" size="icon-sm" :disabled="zoom === 1 && panX === 0 && panY === 0" aria-label="Reset view" @click="resetViewport"><RotateCcw aria-hidden="true" /></Button>
                    </div>
                </div>

                <div class="flex min-h-0 flex-1 flex-col xl:flex-row">
                    <div
                        ref="stageEl"
                        data-testid="browser-evidence-stage"
                        class="relative min-h-[240px] min-w-0 flex-1 overflow-hidden bg-black/90"
                        :class="[
                            zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : isCurrentInteractiveFrame ? 'cursor-crosshair' : 'cursor-default',
                            interactionPending || interactionLocked ? 'pointer-events-none' : '',
                        ]"
                        :aria-busy="artifactLoading || Boolean(selectedArtifactId && !imageReady && !artifactError) || interactionPending"
                        @click="onStageClick"
                        @wheel="onStageWheel"
                        @pointerdown.stop="onPointerDown"
                        @pointermove="onPointerMove"
                        @pointerup="onPointerUp"
                        @pointercancel="onPointerUp"
                        @touchstart.stop
                    >
                        <img
                            v-if="selectedArtifactId && selectedArtifact"
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
                            <Loader2 class="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading capture
                        </div>
                        <div v-if="artifactError" role="alert" class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--talos-warning)]">
                            <span class="flex items-center"><TriangleAlert class="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> {{ artifactError }}</span>
                            <Button data-testid="browser-evidence-retry" variant="outline" size="sm" @click.stop="retrySelectedArtifact">Retry capture</Button>
                        </div>
                        <span
                            v-if="pendingMarker"
                            class="pointer-events-none absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--talos-accent)] shadow-[0_0_0_6px_rgb(255_255_255/0.18)]"
                            :style="{ left: `${pendingMarker.x}px`, top: `${pendingMarker.y}px` }"
                            aria-hidden="true"
                        />
                    </div>

                    <aside
                        v-if="selectedIsCurrentArtifact"
                        data-testid="browser-page-controls"
                        :role="refTargetsLoading || refTargetsError ? 'status' : undefined"
                        aria-live="polite"
                        aria-label="Page controls"
                        class="max-h-48 w-full shrink-0 overflow-y-auto border-t border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left xl:max-h-none xl:w-72 xl:border-l xl:border-t-0"
                    >
                        <div class="mb-2 flex items-center gap-2">
                            <MousePointer2 class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <h3 class="text-[11px] font-semibold uppercase tracking-wide text-[var(--talos-text)]">Page controls</h3>
                            <span v-if="currentDecodedRefFrame" class="ml-auto text-[10px] tabular-nums text-[var(--talos-muted)]">{{ currentDecodedRefFrame.targets.length }}</span>
                        </div>
                        <div v-if="refTargetsLoading" class="flex items-center gap-2 py-2 text-xs text-[var(--talos-muted)]">
                            <Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            Finding current controls
                        </div>
                        <p v-else-if="refTargetsError" class="break-words text-xs leading-5 text-[var(--talos-muted)]">
                            {{ refTargetsError }}
                        </p>
                        <ul v-else-if="currentDecodedRefFrame?.targets.length" class="space-y-1.5" aria-label="Current page controls">
                            <li v-for="target in currentDecodedRefFrame.targets" :key="target.ref">
                                <button
                                    type="button"
                                    :data-browser-ref="target.ref"
                                    :data-testid="`browser-page-control-${target.ref}`"
                                    class="flex min-h-11 w-full items-start gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)] px-2.5 py-2 text-left transition-colors hover:border-[var(--talos-border-strong)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                                    :disabled="refControlsDisabled"
                                    :aria-label="`Activate ${target.role} ${target.name}`"
                                    @click="dispatchRef(target)"
                                >
                                    <span class="mt-0.5 min-w-12 shrink-0 truncate font-mono text-[10px] uppercase text-[var(--talos-accent)]">{{ target.role }}</span>
                                    <span class="min-w-0 flex-1">
                                        <span class="block break-words text-xs font-medium leading-4 text-[var(--talos-text)] [overflow-wrap:anywhere]">{{ target.name }}</span>
                                        <span v-if="destinationHost(target.destination)" class="mt-0.5 block truncate text-[10px] text-[var(--talos-muted)]">{{ destinationHost(target.destination) }}</span>
                                    </span>
                                </button>
                            </li>
                        </ul>
                        <p v-else class="text-xs leading-5 text-[var(--talos-muted)]">
                            {{ imageReady ? 'No supported controls in the current view.' : 'Decode the current capture to reveal its controls.' }}
                        </p>
                    </aside>
                </div>

                <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs">
                    <div role="status" aria-live="polite" class="flex min-w-0 items-center gap-2 text-[var(--talos-muted)]">
                        <Hand v-if="zoom > 1" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <MousePointer2 v-else class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span v-if="interactionPending">Interaction in progress</span>
                        <span v-else-if="interactionLocked">Recovery required before further interaction</span>
                        <span v-else-if="selectedArtifactId && !imageReady && !artifactError">Capture is still loading</span>
                        <span v-else-if="isCurrentInteractiveFrame">Click or scroll the current frame to interact</span>
                        <span v-else>Historical frame, inspection only</span>
                    </div>
                    <span v-if="interactionError" role="alert" class="max-w-full break-words text-[var(--talos-warning)]">{{ interactionError }}</span>
                </div>
            </div>
        </component>
    </component>

    <AlertDialog :open="Boolean(viewerOpen && pendingInteractionApproval)">
        <AlertDialogContent
            class="z-[90] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto border-[var(--talos-warning-border)] bg-[var(--talos-background)]"
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
