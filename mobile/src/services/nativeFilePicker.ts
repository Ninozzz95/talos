import { Capacitor } from '@capacitor/core'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { TALOS_MOBILE_ATTACHMENT_LIMITS, normalizeTalosAttachmentDisplayName } from '@/lib/chat/attachmentContracts'

export type TalosPickedFileSource =
    | { kind: 'native-uri'; uri: string }
    | { kind: 'web-blob'; blob: Blob }

export interface TalosPickedFile {
    name: string
    declaredMediaType: string
    sizeBytes: number
    source: TalosPickedFileSource
}

export interface TalosNativePickedFile {
    name: string
    mimeType: string
    size: number
    path?: string
    blob?: Blob
}

export interface TalosFilePickerPort {
    pickFiles(options: { limit: number; readData: boolean }): Promise<{
        files: TalosNativePickedFile[]
    }>
}

export interface TalosNativeFilePicker {
    pickFiles(): Promise<TalosPickedFile[]>
}

export interface TalosNativeFilePickerOptions {
    plugin?: TalosFilePickerPort
    platform?: string
}

function isCancellation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code.toUpperCase() : ''
    const message = typeof record.message === 'string' ? record.message.toLowerCase() : ''
    return ['PICKER_CANCELED', 'PICKER_CANCELLED', 'USER_CANCELED', 'USER_CANCELLED'].includes(code)
        || message === 'cancelled'
        || message === 'canceled'
}

export function createNativeFilePicker(
    options: TalosNativeFilePickerOptions = {},
): TalosNativeFilePicker {
    const plugin = options.plugin ?? FilePicker
    const platform = options.platform ?? Capacitor.getPlatform()
    return {
        async pickFiles() {
            let result: { files: TalosNativePickedFile[] }
            try {
                result = await plugin.pickFiles({ limit: 0, readData: false })
            } catch (error) {
                if (isCancellation(error)) return []
                throw error
            }
            if (!Array.isArray(result.files)) throw new Error('TALOS_ATTACHMENT_PICKER_RESULT_INVALID')
            if (result.files.length > TALOS_MOBILE_ATTACHMENT_LIMITS.maxFilesPerMessage) {
                throw new Error('TALOS_ATTACHMENT_TOO_MANY_FILES')
            }
            return result.files.map((file): TalosPickedFile => {
                if (!Number.isSafeInteger(file.size) || file.size < 0) {
                    throw new Error('TALOS_ATTACHMENT_PICKER_RESULT_INVALID')
                }
                const base = {
                    name: normalizeTalosAttachmentDisplayName(file.name),
                    declaredMediaType: typeof file.mimeType === 'string'
                        ? file.mimeType.trim().toLowerCase()
                        : '',
                    sizeBytes: file.size,
                }
                if (platform === 'web') {
                    if (!(file.blob instanceof Blob)) {
                        throw new Error('TALOS_ATTACHMENT_PICKER_RESULT_INVALID')
                    }
                    return { ...base, source: { kind: 'web-blob', blob: file.blob } }
                }
                if (typeof file.path !== 'string' || file.path.length === 0) {
                    throw new Error('TALOS_ATTACHMENT_PICKER_RESULT_INVALID')
                }
                return { ...base, source: { kind: 'native-uri', uri: file.path } }
            })
        },
    }
}
