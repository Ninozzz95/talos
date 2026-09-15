import type { TalosSpeechEngine } from '@/lib/voice/personalVoiceContracts'

export type TalosVoiceDiagnosticSource = 'chat' | 'assistant' | 'manual' | 'preview' | 'instrumentation'

export interface TalosVoiceDiagnosticRoute {
    traceId: string
    readingId: string
    source: TalosVoiceDiagnosticSource
    requestedLocale: string
    requestedEngine: TalosSpeechEngine
    /** Crosses the local bridge only; the native artifact stores its SHA-256, never this value. */
    requestedProfileId: string | null
}

export interface TalosVoiceDiagnosticBeginRequest extends TalosVoiceDiagnosticRoute {
    /** Full Git object id supplied by the USB campaign that built the APK. */
    appCommit: string
    /** Host-computed APK SHA-256; native beginDiagnostics recomputes and compares it. */
    expectedApkSha256: string
    /** Positive host PnP evidence, for example USB\\VID_xxxx&PID_xxxx\\<serial>. */
    usbTransportProof: string
}

export interface TalosVoiceDiagnosticBeginResult {
    armed: boolean
}

export interface TalosVoiceDiagnosticEndResult {
    traceId: string
    artifactPath: string
    eventCount: number
}

export interface TalosVoiceDiagnosticExportResult {
    traceId: string
    artifactPath: string
}
