import { Capacitor } from '@capacitor/core'

/**
 * F4-#16 — local-first delivery of an export artifact. Native: write the file
 * privately (Cache) and hand it to the system share sheet — the OS is the
 * router (Drive, mail, files, AirDrop-alikes). Web/dev: plain download.
 */
export interface TalosSessionExportArtifact {
    fileName: string
    content: string
    contentType: string
}

export async function deliverTalosSessionExport(
    artifact: TalosSessionExportArtifact,
): Promise<'shared' | 'downloaded'> {
    if (Capacitor.isNativePlatform()) {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
            import('@capacitor/filesystem'),
            import('@capacitor/share'),
        ])
        const written = await Filesystem.writeFile({
            path: artifact.fileName,
            data: artifact.content,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
        })
        try {
            await Share.share({ title: artifact.fileName, url: written.uri })
        } finally {
            // SF-11: the chat DB is encrypted — do not leave a plaintext
            // transcript in Cache once the share target has its own copy.
            void Filesystem.deleteFile({ path: artifact.fileName, directory: Directory.Cache })
                .catch(() => undefined)
        }
        return 'shared'
    }

    const blob = new Blob([artifact.content], { type: artifact.contentType })
    const url = URL.createObjectURL(blob)
    try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = artifact.fileName
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
    } finally {
        // Give the click a tick before revoking so the download starts.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return 'downloaded'
}
