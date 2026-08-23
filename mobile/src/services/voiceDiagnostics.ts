import { registerPlugin } from '@capacitor/core'
import type {
    TalosVoiceDiagnosticBeginResult,
    TalosVoiceDiagnosticBeginRequest,
    TalosVoiceDiagnosticEndResult,
    TalosVoiceDiagnosticExportResult,
    TalosVoiceDiagnosticRoute,
} from '@/lib/voice/voiceDiagnosticsContracts'

interface TalosNeuralVoiceDiagnosticsPlugin {
    beginDiagnostics(options: TalosVoiceDiagnosticBeginRequest): Promise<TalosVoiceDiagnosticBeginResult>
    endDiagnostics(options: { traceId: string }): Promise<TalosVoiceDiagnosticEndResult>
    exportDiagnostics(options: { traceId: string }): Promise<TalosVoiceDiagnosticExportResult>
}

const plugin = registerPlugin<TalosNeuralVoiceDiagnosticsPlugin>('TalosNeuralVoice')
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_LOCALE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/

function requireSafeId(name: 'traceId' | 'readingId', value: string): string {
    if (!SAFE_ID.test(value)) throw new Error(`${name} is not a safe diagnostic identifier`)
    return value
}

function validateRoute(route: TalosVoiceDiagnosticRoute): TalosVoiceDiagnosticRoute {
    requireSafeId('traceId', route.traceId)
    requireSafeId('readingId', route.readingId)
    if (!SAFE_LOCALE.test(route.requestedLocale)) throw new Error('requestedLocale is not a valid language tag')
    if (!['chat', 'assistant', 'manual', 'preview', 'instrumentation'].includes(route.source)) {
        throw new Error('source is not a supported voice diagnostic route')
    }
    if (route.requestedEngine !== 'system' && route.requestedEngine !== 'personal') {
        throw new Error('requestedEngine is not supported')
    }
    return route
}

export async function talosBeginVoiceDiagnostics(
    route: TalosVoiceDiagnosticBeginRequest,
): Promise<TalosVoiceDiagnosticBeginResult> {
    validateRoute(route)
    if (!/^[0-9a-f]{40,64}$/.test(route.appCommit)) throw new Error('appCommit must be a full lowercase Git object id')
    if (!/^[0-9a-f]{64}$/.test(route.expectedApkSha256)) throw new Error('expectedApkSha256 must be lowercase SHA-256')
    if (!/^USB\\[^\r\n]+\\2ea6573c$/i.test(route.usbTransportProof)) {
        throw new Error('usbTransportProof does not identify the authorized Pad USB instance')
    }
    return plugin.beginDiagnostics(route)
}

export async function talosEndVoiceDiagnostics(traceId: string): Promise<TalosVoiceDiagnosticEndResult> {
    return plugin.endDiagnostics({ traceId: requireSafeId('traceId', traceId) })
}

export async function talosExportVoiceDiagnostics(traceId: string): Promise<TalosVoiceDiagnosticExportResult> {
    return plugin.exportDiagnostics({ traceId: requireSafeId('traceId', traceId) })
}
