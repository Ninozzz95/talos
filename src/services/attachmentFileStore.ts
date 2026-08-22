import { Directory, Filesystem } from '@capacitor/filesystem'
import { TALOS_MOBILE_ATTACHMENT_LIMITS } from '@/lib/chat/attachmentContracts'
import { normalizeRepositoryId } from '@/repositories/chatRepository'
import type { TalosPickedFile } from '@/services/nativeFilePicker'

export interface TalosPrivateFileCopy {
    privateUri: string
    bytes: Uint8Array
}

export interface TalosFilesystemPort {
    mkdir(options: { path: string; directory?: Directory; recursive?: boolean }): Promise<unknown>
    readFile(options: { path: string; directory?: Directory }): Promise<{ data: string | Blob }>
    writeFile(options: {
        path: string
        data: string | Blob
        directory?: Directory
        recursive?: boolean
    }): Promise<unknown>
    deleteFile(options: { path: string; directory?: Directory }): Promise<unknown>
    /** Presence without reading: card capture asks before any network call. */
    stat(options: { path: string; directory?: Directory }): Promise<unknown>
}

export interface TalosAttachmentFileStore {
    copyToPrivate(file: TalosPickedFile, fileId: string): Promise<TalosPrivateFileCopy>
    readPrivate(privateUri: string): Promise<Uint8Array>
    /** Source cards: write already-encoded bytes under the cards prefix. */
    writePrivateBytes(privateUri: string, base64: string): Promise<void>
    /** Source cards: is it already stored? Asked before any network call. */
    existsPrivate(privateUri: string): Promise<boolean>
    deletePrivate(privateUri: string): Promise<void>
}

export interface TalosAttachmentFileStoreOptions {
    filesystem?: TalosFilesystemPort
}

const ALLOWED_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'webp', 'pdf', 'docx', 'txt', 'md', 'markdown', 'json',
    'csv', 'html', 'htm', 'xml', 'js', 'jsx', 'ts', 'tsx', 'vue', 'css', 'scss',
    'php', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cpp',
    'hpp', 'cs', 'sh', 'bash', 'zsh', 'ps1', 'sql', 'yaml', 'yml', 'toml', 'ini',
])
const PRIVATE_PREFIX = 'talos-vault/files/'

function extension(name: string): string {
    const candidate = name.split('.').at(-1)?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.has(candidate)) throw new Error('TALOS_ATTACHMENT_EXTENSION_UNSUPPORTED')
    return candidate === 'jpeg' ? 'jpg' : candidate
}

function privatePath(fileId: string, name: string): string {
    return `${PRIVATE_PREFIX}${normalizeRepositoryId(fileId)}.${extension(name)}`
}

function bytesFromBase64(value: string): Uint8Array {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
}

function base64FromBytes(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 32_768
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
}

async function decodeData(data: string | Blob): Promise<Uint8Array> {
    if (typeof data === 'string') return bytesFromBase64(data)
    return new Uint8Array(await data.arrayBuffer())
}

/**
 * Source card bytes — a favicon and a preview keyed by URL — live beside the
 * attachments rather than among them: they are not files the user added, and
 * mixing them would make the attachment area untrue.
 */
const CARD_PREFIX = 'talos-vault/cards/'

function assertPrivateUri(value: string): string {
    // Widened to a second prefix, and the traversal checks deliberately stay
    // outside that choice: a card path is derived from a URL a stranger
    // controls, so accepting one more directory must not accept a way out of
    // it. `startsWith` alone would let `talos-vault/cardsX/` through.
    const allowed = value.startsWith(PRIVATE_PREFIX) || value.startsWith(CARD_PREFIX)
    if (!allowed || value.includes('..') || value.includes('\\')) {
        throw new Error('TALOS_ATTACHMENT_PRIVATE_URI_INVALID')
    }
    return value
}

export function createAttachmentFileStore(
    options: TalosAttachmentFileStoreOptions = {},
): TalosAttachmentFileStore {
    const filesystem = options.filesystem ?? Filesystem

    async function deletePrivate(privateUri: string): Promise<void> {
        await filesystem.deleteFile({
            path: assertPrivateUri(privateUri),
            directory: Directory.Data,
        })
    }

    return {
        async copyToPrivate(file, fileId) {
            if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0
                || file.sizeBytes > TALOS_MOBILE_ATTACHMENT_LIMITS.maxBytesPerFile) {
                throw new Error('TALOS_ATTACHMENT_FILE_TOO_LARGE')
            }
            const target = privatePath(fileId, file.name)
            let wrote = false
            try {
                const bytes = file.source.kind === 'web-blob'
                    ? new Uint8Array(await file.source.blob.arrayBuffer())
                    : await decodeData((await filesystem.readFile({ path: file.source.uri })).data)
                if (bytes.byteLength !== file.sizeBytes
                    || bytes.byteLength > TALOS_MOBILE_ATTACHMENT_LIMITS.maxBytesPerFile) {
                    throw new Error('TALOS_ATTACHMENT_SIZE_MISMATCH')
                }
                await filesystem.mkdir({
                    path: PRIVATE_PREFIX.slice(0, -1),
                    directory: Directory.Data,
                    recursive: true,
                }).catch(() => undefined)
                wrote = true
                await filesystem.writeFile({
                    path: target,
                    data: base64FromBytes(bytes),
                    directory: Directory.Data,
                    recursive: true,
                })
                return { privateUri: target, bytes }
            } catch (error) {
                if (wrote) {
                    try {
                        await deletePrivate(target)
                    } catch {
                        // Preserve the original write fault; startup reconciliation handles residue.
                    }
                }
                throw error
            }
        },
        async readPrivate(privateUri) {
            return decodeData((await filesystem.readFile({
                path: assertPrivateUri(privateUri),
                directory: Directory.Data,
            })).data)
        },
        /** Write already-encoded bytes: a captured favicon or preview. */
        async writePrivateBytes(privateUri, base64) {
            const target = assertPrivateUri(privateUri)
            await filesystem.mkdir({
                path: CARD_PREFIX.slice(0, -1),
                directory: Directory.Data,
                recursive: true,
            }).catch(() => undefined)
            await filesystem.writeFile({
                path: target,
                data: base64,
                directory: Directory.Data,
                recursive: true,
            })
        },
        /**
         * Is it already there? Card capture asks this before any network call,
         * so a site found in a second search costs nothing.
         */
        async existsPrivate(privateUri) {
            const target = assertPrivateUri(privateUri)
            try {
                await filesystem.stat({ path: target, directory: Directory.Data })
                return true
            } catch {
                return false
            }
        },
        deletePrivate,
    }
}
