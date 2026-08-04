import { describe, expect, it } from 'vitest'
import { talosEstimateSizeFromName, talosEstimatedBand } from '@/lib/models/sizeFromName'

const GB = 1024 * 1024 * 1024

/**
 * Owner 2026-08-04: la capienza è «un'etichetta che vedo sempre» — quindi anche
 * sulle righe che arrivano dalla ricerca sul Hub, che NON portano la dimensione
 * dei file. Chiederla sarebbe una richiesta per repository: venti righe, venti
 * richieste, e il limitatore che gli anonimi condividono per operatore.
 *
 * Il nome però la dice quasi sempre.
 */
describe('stimare il peso dal nome', () => {
    it('legge parametri e quantizzazione da un nome vero', () => {
        const stima = talosEstimateSizeFromName('unsloth/Qwen3-Coder-30B-A3B-Instruct-Q4_K_M')
        expect(stima).not.toBeNull()
        // 30 miliardi a 4,8 bit ≈ 18 GB: l'ordine è quello giusto.
        expect(stima!.fileBytes / 1e9).toBeGreaterThan(15)
        expect(stima!.fileBytes / 1e9).toBeLessThan(21)
    })

    it('quanto serve per USARLO è più del file', () => {
        // Un file che entra sul disco ma non in memoria non si apre, e dirlo
        // dopo il download è tardi.
        const stima = talosEstimateSizeFromName('Llama-3.2-3B-Instruct-Q4_K_S.gguf')!
        expect(stima.workingBytes).toBeGreaterThan(stima.fileBytes)
    })

    it('la stima si DICHIARA tale', () => {
        // Una stima che si spaccia per misura è peggio di nessun numero: chi la
        // legge smette di verificare.
        expect(talosEstimateSizeFromName('Llama-3-8B-Q5_K_M')!.estimated).toBe(true)
    })

    it('se il nome non basta NON si inventa', () => {
        // Meglio una riga senza etichetta che una capienza immaginata.
        expect(talosEstimateSizeFromName('mistral-instruct')).toBeNull()          // niente parametri
        expect(talosEstimateSizeFromName('modello-9000B-Q4_K_M')).toBeNull()      // numero assurdo
        // `Phi-4-mini` NON dichiara i parametri: il «4» è la versione, non i
        // miliardi. È il caso che insegna perché servono entrambi i pezzi.
        expect(talosEstimateSizeFromName('Phi-4-mini-instruct-Q4_K_S.gguf')).toBeNull()
    })

    it('le soglie sono le STESSE della lista curata', () => {
        /**
         * Due liste sulla stessa schermata che chiamano «al limite» due cose
         * diverse insegnano a non fidarsi di nessuna delle due.
         */
        expect(talosEstimatedBand(2 * GB, 4.4 * GB)).toBe('comfortable')
        expect(talosEstimatedBand(4.2 * GB, 4.4 * GB)).toBe('tight')
        expect(talosEstimatedBand(18 * GB, 4.4 * GB)).toBe('wont-run')
    })
})

describe('quando il nome dice i parametri ma non la quantizzazione', () => {
    it('si assume Q4 e lo si DICHIARA, invece di tacere', () => {
        /**
         * MISURATO sul dispositivo 2026-08-04: su venti righe sfogliate dal
         * Hub, UNA sola portava entrambi i pezzi. È strutturale — il nome del
         * REPOSITORY dice i parametri, la quantizzazione è dei file dentro.
         * Pretendere entrambi lasciava diciannove righe senza l'etichetta che
         * l'owner ha approvato.
         */
        const stima = talosEstimateSizeFromName('unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF')
        expect(stima).not.toBeNull()
        expect(stima!.assumedQuantisation).toBe('Q4_K_M')
        expect(stima!.fileBytes / 1e9).toBeGreaterThan(15)
    })

    it('quando la quantizzazione C’È, non si assume niente', () => {
        // La stima riguarda solo il peso, e va detta in modo diverso.
        expect(talosEstimateSizeFromName('Llama-3-8B-Q6_K')!.assumedQuantisation).toBeNull()
    })
})
