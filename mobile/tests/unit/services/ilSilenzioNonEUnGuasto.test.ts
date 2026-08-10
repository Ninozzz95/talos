import { describe, expect, it } from 'vitest'
import { talosEsitoDettatura } from '@/services/dictation'

/**
 * ⛔⛔ «Il riconoscimento vocale non è riuscito. Riprova.» — e non era vero.
 *
 * Owner 2026-08-10, dal Pad: microfono in una chat nuova, e in rosso quella
 * frase. MISURATO in logcat, non dedotto:
 *
 *     W RecognitionClient: #onError space agsa_transcription_NO_SPEECH_DETECTED
 *
 * Il motore aveva ascoltato 4,6 s e funzionato: non aveva sentito parlare.
 * Android lo consegna come `ERROR_NO_MATCH` / `ERROR_SPEECH_TIMEOUT`; il fork
 * capgo lo gira come `NO_MATCH` / `SPEECH_TIMEOUT` (letto nel suo
 * `getErrorCode`), il Web Speech API dice `no-speech`.
 *
 * ⛔ Questo test morde perché controlla la SEPARAZIONE, non la presenza: un
 * classificatore che rispondesse sempre «recognitionFailed» passerebbe metà
 * delle righe qui sotto e fallirebbe l'altra metà.
 */
describe('⛔ il silenzio non è un guasto', () => {
    it('il caso sentito sul Pad: NO_MATCH è «non hai parlato»', () => {
        expect(talosEsitoDettatura('NO_MATCH No speech detected')).toBe('noSpeech')
    })

    it('⛔ ONLINE_NO_PROGRESS: il caso del microfono premuto MENTRE TALOS parla', () => {
        // Owner 2026-08-10, misurato: premendo il microfono durante la lettura
        // il motore risponde `agsa_transcription_ONLINE_NO_PROGRESS`. Per chi ha
        // premuto e non ha ancora detto niente e' silenzio, non un guasto.
        expect(talosEsitoDettatura('ONLINE_NO_PROGRESS ')).toBe('noSpeech')
        expect(talosEsitoDettatura('agsa_transcription_ONLINE_NO_PROGRESS')).toBe('noSpeech')
    })

    it('e le altre tre forme dello stesso fatto', () => {
        expect(talosEsitoDettatura('SPEECH_TIMEOUT ')).toBe('noSpeech')
        expect(talosEsitoDettatura('no-speech')).toBe('noSpeech')
        expect(talosEsitoDettatura(' NO_SPEECH_DETECTED')).toBe('noSpeech')
    })

    it('⛔ un guasto VERO resta un guasto: non si è ammorbidito tutto', () => {
        expect(talosEsitoDettatura('SERVER Server error')).toBe('recognitionFailed')
        expect(talosEsitoDettatura('AUDIO ')).toBe('recognitionFailed')
        expect(talosEsitoDettatura('RECOGNIZER_BUSY ')).toBe('recognitionFailed')
        expect(talosEsitoDettatura('NETWORK_TIMEOUT ')).toBe('recognitionFailed')
        expect(talosEsitoDettatura('')).toBe('recognitionFailed')
    })

    it('⛔ e il permesso VINCE sul silenzio: prima si chiede, poi si ascolta', () => {
        expect(talosEsitoDettatura('INSUFFICIENT_PERMISSIONS ')).toBe('permissionDenied')
        expect(talosEsitoDettatura('not-allowed')).toBe('permissionDenied')
        // La riga che deciderebbe male se l'ordine dei controlli si invertisse.
        expect(talosEsitoDettatura('NO_MATCH insufficient permissions'))
            .toBe('permissionDenied')
    })
})
