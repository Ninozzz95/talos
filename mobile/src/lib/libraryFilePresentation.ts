export type TalosLibraryFileIconKind =
    | 'image'
    | 'pdf'
    | 'word'
    | 'spreadsheet'
    | 'presentation'
    | 'code'
    | 'data'
    | 'archive'
    | 'text'
    | 'file'

export interface TalosLibraryFilePresentation {
    extension: string
    iconKind: TalosLibraryFileIconKind
}

const IMAGE_EXTENSIONS = new Set([
    'avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp',
])
const WORD_EXTENSIONS = new Set(['doc', 'docx', 'odt', 'rtf'])
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'ods', 'tsv', 'xls', 'xlsx'])
const PRESENTATION_EXTENSIONS = new Set(['odp', 'ppt', 'pptx'])
const CODE_EXTENSIONS = new Set([
    'bash', 'c', 'cpp', 'cs', 'css', 'go', 'h', 'hpp', 'htm', 'html', 'java',
    'js', 'jsx', 'kt', 'kts', 'php', 'ps1', 'py', 'rb', 'rs', 'scss', 'sh',
    'sql', 'swift', 'ts', 'tsx', 'vue', 'zsh',
])
const DATA_EXTENSIONS = new Set(['ini', 'json', 'toml', 'xml', 'yaml', 'yml'])
const ARCHIVE_EXTENSIONS = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'xz', 'zip'])
const TEXT_EXTENSIONS = new Set(['log', 'markdown', 'md', 'txt'])

const MEDIA_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
    'application/gzip': 'GZ',
    'application/json': 'JSON',
    'application/pdf': 'PDF',
    'application/rtf': 'RTF',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/x-7z-compressed': '7Z',
    'application/xml': 'XML',
    'application/zip': 'ZIP',
    'image/avif': 'AVIF',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/svg+xml': 'SVG',
    'image/webp': 'WEBP',
    'text/csv': 'CSV',
    'text/html': 'HTML',
    'text/markdown': 'MD',
    'text/plain': 'TXT',
}

function extensionFromName(displayName: string): string | null {
    const leaf = displayName.trim().split(/[\\/]/).at(-1) ?? ''
    const match = leaf.match(/\.([a-z0-9][a-z0-9+_-]{0,11})$/i)
    return match?.[1]?.toLowerCase() ?? null
}

function iconKindFromExtension(extension: string): TalosLibraryFileIconKind | null {
    if (IMAGE_EXTENSIONS.has(extension)) return 'image'
    if (extension === 'pdf') return 'pdf'
    if (WORD_EXTENSIONS.has(extension)) return 'word'
    if (SPREADSHEET_EXTENSIONS.has(extension)) return 'spreadsheet'
    if (PRESENTATION_EXTENSIONS.has(extension)) return 'presentation'
    if (CODE_EXTENSIONS.has(extension)) return 'code'
    if (DATA_EXTENSIONS.has(extension)) return 'data'
    if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive'
    if (TEXT_EXTENSIONS.has(extension)) return 'text'
    return null
}

function iconKindFromMediaType(mediaType: string): TalosLibraryFileIconKind {
    if (mediaType.startsWith('image/')) return 'image'
    if (mediaType === 'application/pdf') return 'pdf'
    if (mediaType.includes('wordprocessingml') || mediaType === 'application/msword') return 'word'
    if (mediaType.includes('spreadsheetml') || mediaType.includes('excel') || mediaType === 'text/csv') {
        return 'spreadsheet'
    }
    if (mediaType.includes('presentationml') || mediaType.includes('powerpoint')) return 'presentation'
    if (mediaType.includes('zip') || mediaType.includes('gzip') || mediaType.includes('compressed')) {
        return 'archive'
    }
    if (mediaType.includes('json') || mediaType.includes('xml') || mediaType.includes('yaml')) return 'data'
    if (
        mediaType.includes('javascript')
        || mediaType.includes('typescript')
        || mediaType === 'text/css'
        || mediaType === 'text/html'
    ) return 'code'
    if (mediaType.startsWith('text/')) return 'text'
    return 'file'
}

/**
 * A filename suffix is what the user sees and is therefore the primary format
 * cue. The registered media type is only a deterministic fallback for files
 * without a suffix; neither value is trusted as a security decision.
 */
export function talosLibraryFilePresentation(
    displayName: string,
    mediaType: string,
): TalosLibraryFilePresentation {
    const normalizedMediaType = mediaType.trim().toLowerCase().split(';', 1)[0] ?? ''
    const filenameExtension = extensionFromName(displayName)
    const iconKind = filenameExtension
        ? (iconKindFromExtension(filenameExtension) ?? iconKindFromMediaType(normalizedMediaType))
        : iconKindFromMediaType(normalizedMediaType)

    return {
        extension: filenameExtension?.toUpperCase()
            ?? MEDIA_TYPE_EXTENSIONS[normalizedMediaType]
            ?? (iconKind === 'file' ? 'FILE' : iconKind.toUpperCase()),
        iconKind,
    }
}
