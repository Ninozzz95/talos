export type TalosBrowserImageContainer = {
    left: number
    top: number
    width: number
    height: number
}

export type TalosBrowserImageTransform = {
    zoom?: number
    panX?: number
    panY?: number
}

export type TalosBrowserPaintedImageRect = {
    left: number
    top: number
    width: number
    height: number
    scale: number
}

export type TalosBrowserMappedPointer = {
    normalizedX: number
    normalizedY: number
    sourceX: number
    sourceY: number
    paintedRect: TalosBrowserPaintedImageRect
}

export type TalosBrowserClampedPan = {
    panX: number
    panY: number
}

function finitePositive(value: number) {
    return Number.isFinite(value) && value > 0
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value))
}

export function clampBrowserImagePan(
    container: TalosBrowserImageContainer,
    imageWidth: number,
    imageHeight: number,
    transform: TalosBrowserImageTransform = {},
): TalosBrowserClampedPan {
    const painted = resolveBrowserImageRect(container, imageWidth, imageHeight, {
        zoom: transform.zoom,
        panX: 0,
        panY: 0,
    })
    const requestedPanX = transform.panX ?? 0
    const requestedPanY = transform.panY ?? 0
    if (!painted || !Number.isFinite(requestedPanX) || !Number.isFinite(requestedPanY)) {
        return { panX: 0, panY: 0 }
    }

    const maximumPanX = Math.max(0, (painted.width - container.width) / 2)
    const maximumPanY = Math.max(0, (painted.height - container.height) / 2)
    return {
        panX: clamp(requestedPanX, -maximumPanX, maximumPanX),
        panY: clamp(requestedPanY, -maximumPanY, maximumPanY),
    }
}

export function resolveBrowserImageRect(
    container: TalosBrowserImageContainer,
    imageWidth: number,
    imageHeight: number,
    transform: TalosBrowserImageTransform = {},
): TalosBrowserPaintedImageRect | null {
    if (![container.left, container.top].every(Number.isFinite)
        || !finitePositive(container.width)
        || !finitePositive(container.height)
        || !finitePositive(imageWidth)
        || !finitePositive(imageHeight)) {
        return null
    }

    const requestedZoom = transform.zoom ?? 1
    const panX = transform.panX ?? 0
    const panY = transform.panY ?? 0
    if (!finitePositive(requestedZoom) || !Number.isFinite(panX) || !Number.isFinite(panY)) {
        return null
    }

    const zoom = clamp(requestedZoom, 1, 4)
    const baseScale = Math.min(container.width / imageWidth, container.height / imageHeight)
    const scale = baseScale * zoom
    const width = imageWidth * scale
    const height = imageHeight * scale

    return {
        left: container.left + ((container.width - width) / 2) + panX,
        top: container.top + ((container.height - height) / 2) + panY,
        width,
        height,
        scale,
    }
}

export function mapBrowserImagePointer(
    container: TalosBrowserImageContainer,
    imageWidth: number,
    imageHeight: number,
    pointer: { clientX: number; clientY: number },
    transform: TalosBrowserImageTransform = {},
): TalosBrowserMappedPointer | null {
    if (!Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) {
        return null
    }
    const paintedRect = resolveBrowserImageRect(container, imageWidth, imageHeight, transform)
    if (!paintedRect) {
        return null
    }

    const containerRight = container.left + container.width
    const containerBottom = container.top + container.height
    const paintedRight = paintedRect.left + paintedRect.width
    const paintedBottom = paintedRect.top + paintedRect.height
    if (pointer.clientX < container.left
        || pointer.clientX > containerRight
        || pointer.clientY < container.top
        || pointer.clientY > containerBottom
        || pointer.clientX < paintedRect.left
        || pointer.clientX > paintedRight
        || pointer.clientY < paintedRect.top
        || pointer.clientY > paintedBottom) {
        return null
    }

    const sourceX = clamp((pointer.clientX - paintedRect.left) / paintedRect.scale, 0, imageWidth)
    const sourceY = clamp((pointer.clientY - paintedRect.top) / paintedRect.scale, 0, imageHeight)

    return {
        normalizedX: clamp(sourceX / imageWidth, 0, 1),
        normalizedY: clamp(sourceY / imageHeight, 0, 1),
        sourceX,
        sourceY,
        paintedRect,
    }
}
