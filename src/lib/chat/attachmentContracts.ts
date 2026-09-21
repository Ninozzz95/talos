export type TalosMobileAttachmentPermission = 'model.read' | 'browser.upload'
export type TalosMobileAttachmentStatus = 'pending' | 'available' | 'failed' | 'revoked'

export interface TalosMobileTextInputPart {
    type: 'text'
    text: string
}

export interface TalosMobileImageInputPart {
    type: 'image'
    attachmentId: string
    name: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
    base64: string
    sha256: string
}

export interface TalosMobileDocumentTextInputPart {
    type: 'document_text'
    attachmentId: string
    name: string
    mediaType: string
    text: string
    sha256: string
}

export type TalosMobileInputPart =
    | TalosMobileTextInputPart
    | TalosMobileImageInputPart
    | TalosMobileDocumentTextInputPart

export interface TalosMobileCompletionAttachment {
    attachmentId: string
    grantId: string
    parts: TalosMobileInputPart[]
}

export interface TalosMobileAttachmentAnalysis {
    mediaType: string
    extension: string
    sha256: string
    extractedText: string | null
    pageCount: number | null
}

export const TALOS_MOBILE_ATTACHMENT_LIMITS = Object.freeze({
    maxFilesPerMessage: 6,
    maxBytesPerFile: 10 * 1024 * 1024,
    maxBytesPerMessage: 20 * 1024 * 1024,
    maxExtractedCodeUnits: 200_000,
    maxPdfPages: 100,
    extractionTimeoutMs: 15_000,
})

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('TALOS_ATTACHMENT_PART_INVALID')
    }
    return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new Error('TALOS_ATTACHMENT_PART_INVALID')
    }
}

function identifier(value: unknown): string {
    if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
        throw new Error('TALOS_ATTACHMENT_PART_INVALID')
    }
    return value
}

function mediaType(value: unknown): string {
    if (typeof value !== 'string' || value.length < 3 || value.length > 127
        || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)) {
        throw new Error('TALOS_ATTACHMENT_PART_INVALID')
    }
    return value.toLowerCase()
}

function sha256(value: unknown): string {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
        throw new Error('TALOS_ATTACHMENT_PART_INVALID')
    }
    return value.toLowerCase()
}

export function parseTalosMobileAttachmentPermission(value: unknown): TalosMobileAttachmentPermission {
    if (value === 'model.read' || value === 'browser.upload') return value
    throw new Error('TALOS_ATTACHMENT_PERMISSION_INVALID')
}

export function normalizeTalosAttachmentDisplayName(value: string): string {
    const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? ''
    const normalized = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    if (!normalized || normalized === '.' || normalized === '..' || normalized.length > 255) {
        throw new Error('TALOS_ATTACHMENT_NAME_INVALID')
    }
    return normalized
}

export function parseTalosMobileInputParts(value: unknown): TalosMobileInputPart[] {
    if (!Array.isArray(value) || value.length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxFilesPerMessage + 1) {
        throw new Error('TALOS_ATTACHMENT_PART_INVALID')
    }
    const attachmentIds = new Set<string>()
    return value.map((candidate) => {
        const part = record(candidate)
        if (part.type === 'text') {
            exactKeys(part, ['type', 'text'])
            if (typeof part.text !== 'string' || part.text.length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxExtractedCodeUnits) {
                throw new Error('TALOS_ATTACHMENT_TEXT_TOO_LARGE')
            }
            return { type: 'text', text: part.text }
        }
        if (part.type !== 'image' && part.type !== 'document_text') {
            throw new Error('TALOS_ATTACHMENT_PART_INVALID')
        }

        const attachmentId = identifier(part.attachmentId)
        if (attachmentIds.has(attachmentId)) throw new Error('TALOS_ATTACHMENT_PART_DUPLICATE')
        attachmentIds.add(attachmentId)
        const name = typeof part.name === 'string'
            ? normalizeTalosAttachmentDisplayName(part.name)
            : (() => { throw new Error('TALOS_ATTACHMENT_PART_INVALID') })()
        const normalizedMediaType = mediaType(part.mediaType)
        const normalizedSha256 = sha256(part.sha256)

        if (part.type === 'image') {
            exactKeys(part, ['type', 'attachmentId', 'name', 'mediaType', 'base64', 'sha256'])
            if (!IMAGE_MEDIA_TYPES.has(normalizedMediaType)
                || typeof part.base64 !== 'string'
                || part.base64.length === 0
                || !BASE64_PATTERN.test(part.base64)) {
                throw new Error('TALOS_ATTACHMENT_PART_INVALID')
            }
            return {
                type: 'image',
                attachmentId,
                name,
                mediaType: normalizedMediaType as TalosMobileImageInputPart['mediaType'],
                base64: part.base64,
                sha256: normalizedSha256,
            }
        }

        exactKeys(part, ['type', 'attachmentId', 'name', 'mediaType', 'text', 'sha256'])
        if (typeof part.text !== 'string') throw new Error('TALOS_ATTACHMENT_PART_INVALID')
        if (part.text.length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxExtractedCodeUnits) {
            throw new Error('TALOS_ATTACHMENT_TEXT_TOO_LARGE')
        }
        return {
            type: 'document_text',
            attachmentId,
            name,
            mediaType: normalizedMediaType,
            text: part.text,
            sha256: normalizedSha256,
        }
    })
}
