import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Hand a Library file to whatever app on the phone can open it.
 *
 * Owner 2026-07-26: tapping an xlsx in the Library did nothing. It could not do
 * anything — the in-app viewer renders TEXT, and a spreadsheet is not text.
 * TALOS is not going to grow a Word renderer, and pretending otherwise would be
 * the worst of both worlds: a preview that is subtly wrong about a document the
 * user is about to send to someone.
 *
 * So the file is written to the app's cache and handed to the system chooser.
 * Excel, a PDF reader, Drive — whatever the user actually has. The copy lives in
 * the cache directory, which Android reclaims on its own, so a document does not
 * end up duplicated in storage forever.
 */
export interface TalosOpenableFile {
    displayName: string
    mediaType: string
    bytes: Uint8Array
}

function base64Of(bytes: Uint8Array): string {
    let binary = ''
    const chunk = 32_768
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
    }
    return btoa(binary)
}

/** Keeps a title from becoming a path. */
function safeName(name: string): string {
    return name.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'document'
}

export async function openTalosVaultFileExternally(file: TalosOpenableFile): Promise<void> {
    const path = `talos-open/${safeName(file.displayName)}`
    await Filesystem.writeFile({
        path,
        data: base64Of(file.bytes),
        directory: Directory.Cache,
        recursive: true,
    })
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })

    // The system sheet, not a download: on Android this is what offers "open
    // with", and it is the only path that reaches the app the user already
    // trusts with that format.
    await Share.share({
        title: file.displayName,
        files: [uri],
    })
}
