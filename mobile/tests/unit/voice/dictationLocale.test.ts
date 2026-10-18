// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { TALOS_MODELLO_PARAKEET } from '@/lib/voice/modelloParakeet'
import { creaMotoreLocale, motorePerQuestaDettatura, type TalosAsrLocalePonte } from '@/services/dictationLocale'
import type { TalosDictationEngine, TalosDictationEvents } from '@/services/dictation'

/**
 * N12 (mobile, 13/10/2026) — il motore `locale` della dettatura: parole vive dal riconoscitore di sistema (dentro il plugin,
 * stesso microfono), testo finale da Parakeet. Decisioni dell'owner del 12/10: ibrido, e il riconoscitore di oggi resta
 * come riserva. Il ponte nativo qui è finto; ciò che si prova è la regola.
 */
const TUTTI = Object.fromEntries(TALOS_MODELLO_PARAKEET.file.map((f) => [f.nome, f.byte]))
/** Il sigillo del motore dei download: l'impronta verificata allo scaricamento, per ogni file. */
const SIGILLI = Object.fromEntries(TALOS_MODELLO_PARAKEET.file.map((f) => [f.nome, f.sha256]))

function ponte({ file = TUTTI as Record<string, number>, sigilli = SIGILLI as Record<string, string>, finale = { testo: 'Testo di Parakeet.' } as { testo?: string, err?: string, mai?: boolean }, avvio = null as string | null } = {}) {
    const ascoltatori = new Map<string, (d: { text?: string, code?: string }) => void>()
    const p = {
        stato: vi.fn(async () => ({ file, sigilli, caricato: false })),
        ascolta: vi.fn(async () => { if (avvio) throw new Error(avvio); return { campionamento: 16000, vive: true } }),
        trascrivi: vi.fn(() => {
            if (finale.mai) return new Promise<never>(() => {})
            if (finale.err) return Promise.reject(new Error(finale.err))
            return Promise.resolve({ testo: finale.testo ?? '', audioMs: 5000, decodificaMs: 250, picco: 0.3, tagliato: false })
        }),
        annulla: vi.fn(async () => {}),
        anticipa: vi.fn(async () => {}),
        scarica: vi.fn(async () => {}),
        addListener: vi.fn(async (evento: string, f: (d: { text?: string, code?: string }) => void) => { ascoltatori.set(evento, f); return { remove: async () => {} } }),
        removeAllListeners: vi.fn(async () => { ascoltatori.clear() }),
    }
    return { p: p as unknown as TalosAsrLocalePonte & typeof p, manda: (evento: string, d: { text?: string, code?: string }) => ascoltatori.get(evento)?.(d) }
}
function eventi() {
    const visti: string[] = []
    const e = { onStart: vi.fn(), onPartial: vi.fn((t: string) => { visti.push(t) }), onEnd: vi.fn(), onError: vi.fn(), onFallback: vi.fn() }
    return { e: e as TalosDictationEvents & typeof e, visti }
}
function sistema() {
    return { supported: vi.fn(async () => true), requestPermission: vi.fn(async () => true), start: vi.fn(async () => {}), stop: vi.fn(async () => {}) } satisfies TalosDictationEngine
}

describe('N12 — il motore locale della dettatura', () => {
    it('N12-SCELTA-01: col modello sul telefono E verificato il motore è il locale; senza un file, col peso sbagliato o non verificato è il sistema', async () => {
        const s = sistema()
        const con = creaMotoreLocale({ ponte: ponte().p })
        expect(await con.disponibile()).toBe(true)
        expect(await motorePerQuestaDettatura(s, con)).not.toBe(s)

        const { 'tokens.txt': _via, ...tre } = TUTTI
        for (const file of [tre, { ...TUTTI, 'encoder.int8.onnx': 1 }, { ...TUTTI, 'joiner.int8.onnx': -1 }]) {
            const senza = creaMotoreLocale({ ponte: ponte({ file }).p })
            expect(await senza.disponibile()).toBe(false)
            expect(await motorePerQuestaDettatura(s, senza)).toBe(s)
        }
        // i file ci sono e pesano giusto, ma NON portano il sigillo del download (copiati a mano, o cambiati dopo): non si usano
        const { 'encoder.int8.onnx': _senzaSigillo, ...treSigilli } = SIGILLI
        for (const sigilli of [{}, treSigilli, { ...SIGILLI, 'tokens.txt': 'a'.repeat(64) }, { ...SIGILLI, 'joiner.int8.onnx': '' }]) {
            expect(await creaMotoreLocale({ ponte: ponte({ sigilli }).p }).disponibile()).toBe(false)
        }
        // e lo si chiede dove il motore dei download mette QUEL deposito a QUELLA revisione
        const dove = ponte()
        await creaMotoreLocale({ ponte: dove.p }).disponibile()
        expect(dove.p.stato).toHaveBeenCalledWith({ deposito: TALOS_MODELLO_PARAKEET.deposito, revisione: TALOS_MODELLO_PARAKEET.revisione })
        // un ponte che non risponde non è «disponibile»
        const rotto = ponte(); rotto.p.stato.mockRejectedValue(new Error('no'))
        expect(await creaMotoreLocale({ ponte: rotto.p }).disponibile()).toBe(false)
    })

    it('N12-IBRIDO-01: mentre parli il testo vivo è del sistema, tratto dopo tratto senza perdere né doppiare; alla fine lo SOSTITUISCE quello di Parakeet', async () => {
        const b = ponte({ finale: { testo: 'Ciao a tutti. Come state oggi?' } })
        const motore = creaMotoreLocale({ ponte: b.p })
        const { e, visti } = eventi()
        await motore.start(e, { language: 'it-IT' })
        expect(b.p.ascolta).toHaveBeenCalledWith(expect.objectContaining({ vive: true, lingua: 'it-IT' }))
        expect(e.onStart).toHaveBeenCalledTimes(1)
        b.manda('talosAsrViva', { text: 'ciao' })
        b.manda('talosAsrViva', { text: 'ciao a tutti' })
        b.manda('talosAsrTratto', { text: 'Ciao a tutti' })
        // il tratto dopo riparte da zero: si ACCODA a ciò che è già stato detto
        b.manda('talosAsrViva', { text: 'come' })
        b.manda('talosAsrViva', { text: 'come state oggi' })
        expect(visti).toEqual(['ciao', 'ciao a tutti', 'Ciao a tutti', 'Ciao a tutti come', 'Ciao a tutti come state oggi'])
        expect(e.onEnd).not.toHaveBeenCalled()
        await motore.stop()
        expect(visti.at(-1)).toBe('Ciao a tutti. Come state oggi?')
        expect(e.onEnd).toHaveBeenCalledTimes(1)
        expect(e.onFallback).not.toHaveBeenCalled()
        // dopo la fine gli eventi in ritardo non riscrivono niente
        b.manda('talosAsrViva', { text: 'coda' })
        expect(visti.at(-1)).toBe('Ciao a tutti. Come state oggi?')
    })

    /*
     * ⛔ N12-ANTEPRIMA-01 — owner 18/10/2026 notte, dal telefono: l'anteprima «si blocca a metà», poi alla conferma «si vede tutto
     * formattato bene». Le vive del sistema arrivano in ritardo; owner: «Parakeet aggiorna l'anteprima alle pause».
     */
    it('N12-ANTEPRIMA-01: la rilettura di Parakeet alla pausa aggiorna l anteprima, e le vive in ritardo non la riportano indietro né la doppiano', async () => {
        const b = ponte({ finale: { testo: 'Ok, grazie dell\'informazione, valuterò da me. E poi ti dico.' } })
        const motore = creaMotoreLocale({ ponte: b.p })
        const { e, visti } = eventi()
        await motore.start(e, { language: 'it-IT' })
        b.manda('talosAsrViva', { text: 'ok grazie dell\'informazione' })
        b.manda('talosAsrRiletto', { text: 'Ok, grazie dell\'informazione, valuterò da me.' })
        expect(visti.at(-1)).toBe('Ok, grazie dell\'informazione, valuterò da me.')
        // il sistema arriva dopo con la stessa coda: niente di nuovo, niente doppione
        b.manda('talosAsrViva', { text: 'ok grazie dell\'informazione valuterò da me' })
        expect(visti.at(-1)).toBe('Ok, grazie dell\'informazione, valuterò da me.')
        // parole davvero nuove, dopo la pausa: si accodano
        b.manda('talosAsrTratto', { text: 'ok grazie dell\'informazione valuterò da me' })
        b.manda('talosAsrViva', { text: 'e poi ti dico' })
        expect(visti.at(-1)).toBe('Ok, grazie dell\'informazione, valuterò da me. e poi ti dico')
        await motore.stop()
        expect(visti.at(-1)).toBe('Ok, grazie dell\'informazione, valuterò da me. E poi ti dico.')
        // dopo la fine una rilettura in ritardo non riscrive niente
        b.manda('talosAsrRiletto', { text: 'vecchia' })
        expect(visti.at(-1)).toBe('Ok, grazie dell\'informazione, valuterò da me. E poi ti dico.')
    })

    it('N12-LINGUA-01: le scelte di lingua sono quelle della dettatura di oggi, e la lingua SENTITA torna a chi compone', async () => {
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p })
        const { e } = eventi()
        const onLanguage = vi.fn()
        await motore.start({ ...e, onLanguage }, { autoLanguage: true, allowedLanguages: ['it-IT', 'en-US'] })
        expect(b.p.ascolta).toHaveBeenCalledWith(expect.objectContaining({ automatica: true, lingueAmmesse: ['it-IT', 'en-US'] }))
        expect(b.p.ascolta.mock.calls[0]![0]).not.toHaveProperty('lingua')
        b.manda('talosAsrLingua', { language: 'en-US' } as never)
        expect(onLanguage).toHaveBeenCalledWith('en-US')
        await motore.stop()

        // una lingua scelta a mano: quella, senza rilevamento
        const fissa = ponte()
        await creaMotoreLocale({ ponte: fissa.p }).start(eventi().e, { language: 'it-IT', autoLanguage: false })
        expect(fissa.p.ascolta).toHaveBeenCalledWith(expect.objectContaining({ lingua: 'it-IT', automatica: false }))
    })

    it('N12-IBRIDO-02: se Parakeet non risponde in tempo, sbaglia o torna vuoto, RESTA il testo del sistema, e lo si dice', async () => {
        for (const finale of [{ mai: true }, { err: 'TALOS_ASR_FAILED' }, { testo: '   ' }]) {
            const b = ponte({ finale })
            const motore = creaMotoreLocale({ ponte: b.p, tettoFinaleMs: 30 })
            const { e, visti } = eventi()
            await motore.start(e)
            b.manda('talosAsrTratto', { text: 'Testo del sistema' })
            await motore.stop()
            expect(visti.at(-1)).toBe('Testo del sistema')
            expect(e.onEnd).toHaveBeenCalledTimes(1)
            expect(e.onFallback).toHaveBeenCalledTimes(1)
            expect(e.onError).not.toHaveBeenCalled()
        }
    })

    it('N12-SCELTA-02 AL CONTRARIO: se il locale non parte, la dettatura passa al sistema nella stessa pressione, e lo dice; mai una dettatura muta', async () => {
        const s = sistema()
        const b = ponte({ avvio: 'TALOS_ASR_MIC_BUSY' })
        const scelto = await motorePerQuestaDettatura(s, creaMotoreLocale({ ponte: b.p }))
        const { e } = eventi()
        await scelto.start(e, { language: 'it-IT' })
        expect(s.start).toHaveBeenCalledWith(e, { language: 'it-IT' })
        expect(e.onFallback).toHaveBeenCalledWith('TALOS_ASR_MIC_BUSY')
        expect(e.onError).not.toHaveBeenCalled()
        // e la fine è quella del motore che sta davvero ascoltando
        await scelto.stop()
        expect(s.stop).toHaveBeenCalledTimes(1)
        expect(b.p.trascrivi).not.toHaveBeenCalled()
    })

    it('N12-MEMORIA-01: il modello (1 GB a caricarlo) si rilascia poco dopo la fine, non se nel frattempo si è ricominciato a dettare', async () => {
        vi.useFakeTimers()
        try {
            const b = ponte()
            const motore = creaMotoreLocale({ ponte: b.p, rilascioDopoMs: 1000 })
            const { e } = eventi()
            await motore.start(e); await motore.stop()
            await vi.advanceTimersByTimeAsync(500)
            await motore.start(e)                       // ha ricominciato: niente rilascio
            await vi.advanceTimersByTimeAsync(2000)
            expect(b.p.scarica).not.toHaveBeenCalled()
            await motore.stop()
            await vi.advanceTimersByTimeAsync(1100)
            expect(b.p.scarica).toHaveBeenCalledTimes(1)
        } finally { vi.useRealTimers() }
    })
    /**
     * N12 — la barra dell'assistente (owner 13/10/2026: «anche nella barra»). Lì il turno lo chiude il SILENZIO, non la
     * persona: con `endOnSilence` il motore locale finisce da sé quando il riconoscitore delle parole vive chiude la sua
     * sessione dopo aver sentito qualcosa, e chi sta sopra vede ciò che vede oggi — testo, poi fine — col testo di Parakeet.
     */
    it('N12-BARRA-01: a turno, la fine della sessione viva DOPO parole sentite chiude da sé — Parakeet, poi onEnd, una volta sola', async () => {
        const b = ponte({ finale: { testo: 'Che tempo fa domani a Messina?' } })
        const motore = creaMotoreLocale({ ponte: b.p })
        const { e, visti } = eventi()
        await motore.start(e, { endOnSilence: true })
        b.manda('talosAsrViveRiaperte', { code: 'NO_MATCH' })   // silenzio prima di parlare: non chiude
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        b.manda('talosAsrViva', { text: 'che tempo fa domani a messina' })
        b.manda('talosAsrTratto', { text: 'che tempo fa domani a Messina' })
        b.manda('talosAsrViveRiaperte', { code: 'END' })
        await vi.waitFor(() => expect(e.onEnd).toHaveBeenCalledTimes(1))
        expect(b.p.trascrivi).toHaveBeenCalledTimes(1)
        expect(visti.at(-1)).toBe('Che tempo fa domani a Messina?')
        // una coda di eventi dopo la fine non richiude e non riscrive
        b.manda('talosAsrViveRiaperte', { code: 'END' })
        await motore.stop()
        expect(b.p.trascrivi).toHaveBeenCalledTimes(1)
        expect(e.onEnd).toHaveBeenCalledTimes(1)
    })

    it('N12-BARRA-02: a turno, il silenzio senza parole diventa «noSpeech» solo passato il tempo d attesa, come col riconoscitore di sistema', async () => {
        let ora = 1_000
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e } = eventi()
        await motore.start(e, { endOnSilence: true, minimumMillis: 8_000 })
        ora += 2_000
        b.manda('talosAsrViveRiaperte', { code: 'NO_MATCH' })
        ora += 4_000
        b.manda('talosAsrViveRiaperte', { code: 'END' })
        expect(e.onError).not.toHaveBeenCalled()
        expect(b.p.annulla).not.toHaveBeenCalled()
        ora += 2_500
        b.manda('talosAsrViveRiaperte', { code: 'NO_MATCH' })
        await vi.waitFor(() => expect(e.onError).toHaveBeenCalledWith('noSpeech'))
        expect(b.p.annulla).toHaveBeenCalledTimes(1)
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        expect(e.onEnd).not.toHaveBeenCalled()
        // dopo, il motore è libero: una nuova pressione riparte
        await motore.start(eventi().e, { endOnSilence: true })
        expect(b.p.ascolta).toHaveBeenCalledTimes(2)
    })

    it('N12-BARRA-03 AL CONTRARIO: senza «endOnSilence» (chat e Codice) né la fine di una sessione viva né il silenzio chiudono la dettatura', async () => {
        let ora = 0
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e } = eventi()
        await motore.start(e)
        b.manda('talosAsrTratto', { text: 'prima frase' })
        b.manda('talosAsrViveRiaperte', { code: 'END' })
        ora += 60_000
        b.manda('talosAsrViveRiaperte', { code: 'NO_MATCH' })
        await new Promise((r) => setTimeout(r, 20))
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        expect(b.p.annulla).not.toHaveBeenCalled()
        expect(e.onEnd).not.toHaveBeenCalled()
        expect(e.onError).not.toHaveBeenCalled()
        await motore.stop()
    })
    /**
     * N12-TURNO — owner 13/10/2026: «Fine del turno decisa da noi». MISURATO sul Pad: aspettare che il riconoscitore di
     * sistema chiuda la sua sessione costa ~1,8 s; LiveKit ne aspetta 0,5, Pipecat 0,2-0,6. La cattura è nostra: il plugin
     * manda il livello di ogni blocco (`talosAsrLivello`), e a turno si chiude dopo 1,2 s senza voce, se si è sentito qualcosa
     * (800 ms alla prima prova: «troppo stretto» per l'owner, che ha scelto 1,2 s).
     */
    const livelli = (b: ReturnType<typeof ponte>, avanti: (ms: number) => void, rms: number, blocchi: number) => {
        for (let i = 0; i < blocchi; i += 1) { avanti(100); b.manda('talosAsrLivello', { rms }) }
    }

    it('N12-TURNO-01: a turno, parole sentite e poi 1,2 s senza voce chiudono da sé — senza aspettare la fine della sessione viva', async () => {
        let ora = 0
        const b = ponte({ finale: { testo: 'Che ore sono?' } })
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e, visti } = eventi()
        await motore.start(e, { endOnSilence: true })
        const avanti = (ms: number) => { ora += ms }
        livelli(b, avanti, 0.002, 5)      // rumore della stanza
        livelli(b, avanti, 0.09, 12)      // parla
        b.manda('talosAsrViva', { text: 'che ore sono' })
        livelli(b, avanti, 0.002, 11)     // 1,1 s di silenzio: non ancora
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        livelli(b, avanti, 0.002, 2)      // 1,3 s
        await vi.waitFor(() => expect(e.onEnd).toHaveBeenCalledTimes(1))
        expect(b.p.trascrivi).toHaveBeenCalledTimes(1)
        expect(visti.at(-1)).toBe('Che ore sono?')
        // la fine della sessione viva, che arriva dopo, non richiude
        b.manda('talosAsrViveRiaperte', { code: 'END' })
        livelli(b, avanti, 0.002, 10)
        expect(b.p.trascrivi).toHaveBeenCalledTimes(1)
    })

    it('N12-TURNO-02: una pausa breve non chiude, una parola viva in ritardo NON rimanda, e il silenzio senza parole non chiude', async () => {
        let ora = 0
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e } = eventi()
        await motore.start(e, { endOnSilence: true })
        const avanti = (ms: number) => { ora += ms }
        livelli(b, avanti, 0.002, 30)     // tre secondi di silenzio, nessuna parola: non è un turno
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        livelli(b, avanti, 0.08, 8)
        b.manda('talosAsrViva', { text: 'accendi' })
        livelli(b, avanti, 0.002, 10)     // pausa di un secondo a metà frase, per pensare
        livelli(b, avanti, 0.08, 6)       // riprende a parlare
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        livelli(b, avanti, 0.002, 6)      // 600 ms di silenzio…
        // …e arriva una parola viva in ritardo (MISURATO sul Pad: il riconoscitore le consegna a frase finita). Non è voce:
        // non rimanda la chiusura e non butta la rilettura anticipata.
        b.manda('talosAsrViva', { text: 'accendi la luce' })
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        livelli(b, avanti, 0.002, 7)      // 1,3 s dall'ultima voce VERA
        await vi.waitFor(() => expect(b.p.trascrivi).toHaveBeenCalledTimes(1))
        expect((b.p.trascrivi.mock.calls[0] as unknown[])[0]).toMatchObject({ anticipo: true })
    })

    it('N12-TURNO-03 AL CONTRARIO: senza «a turno» (chat e Codice) i livelli non chiudono niente', async () => {
        let ora = 0
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e } = eventi()
        await motore.start(e)
        const avanti = (ms: number) => { ora += ms }
        livelli(b, avanti, 0.09, 10)
        b.manda('talosAsrTratto', { text: 'una frase detta in chat' })
        livelli(b, avanti, 0.002, 40)
        await new Promise((r) => setTimeout(r, 20))
        expect(b.p.trascrivi).not.toHaveBeenCalled()
        expect(e.onEnd).not.toHaveBeenCalled()
        await motore.stop()
    })
    /**
     * N12-ANTICIPO — owner 13/10/2026: «Parakeet rilegge mentre parli». MISURATO sul Pad: a turno chiuso Parakeet ci mette
     * ~1 s a rileggere. Se comincia alla prima pausa (300 ms di silenzio dopo le parole), quando il turno si chiude il testo
     * è già pronto o quasi. Vale solo se dopo NON si è più parlato; e solo per catture corte, perché ogni rilettura rifà
     * tutto l'audio da capo (venti secondi: oltre, costerebbe batteria a ogni pausa).
     */
    const suoni = (b: ReturnType<typeof ponte>, avanti: (ms: number) => void, rms: number, blocchi: number) => {
        for (let i = 0; i < blocchi; i += 1) { avanti(100); (b.manda as (e: string, d: unknown) => void)('talosAsrLivello', { rms }) }
    }
    const ultimaTrascrizione = (b: ReturnType<typeof ponte>) => (b.p.trascrivi.mock.calls.at(-1) as unknown[] | undefined)?.[0] as { anticipo?: boolean } | undefined

    it('N12-ANTICIPO-01: alla prima pausa dopo le parole Parakeet comincia a rileggere, e alla chiusura si usa quel lavoro', async () => {
        let ora = 0
        const b = ponte({ finale: { testo: 'Che ore sono?' } })
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e } = eventi()
        await motore.start(e, { endOnSilence: true })
        const avanti = (ms: number) => { ora += ms }
        suoni(b, avanti, 0.002, 4)
        suoni(b, avanti, 0.09, 10)
        b.manda('talosAsrViva', { text: 'che ore sono' })
        suoni(b, avanti, 0.002, 2)
        expect(b.p.anticipa).not.toHaveBeenCalled()       // 200 ms: non è ancora una pausa
        suoni(b, avanti, 0.002, 2)
        expect(b.p.anticipa).toHaveBeenCalledTimes(1)     // 400 ms
        suoni(b, avanti, 0.002, 9)                        // 1,3 s: il turno si chiude
        await vi.waitFor(() => expect(e.onEnd).toHaveBeenCalledTimes(1))
        expect(b.p.anticipa).toHaveBeenCalledTimes(1)     // una pausa, una rilettura
        expect(ultimaTrascrizione(b)?.anticipo).toBe(true)
    })

    it('N12-ANTICIPO-02: se dopo la pausa si riparla, quel lavoro non vale più — e la pausa dopo ne comincia uno nuovo', async () => {
        let ora = 0
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        const { e } = eventi()
        await motore.start(e)                             // chat: la chiude la persona
        const avanti = (ms: number) => { ora += ms }
        suoni(b, avanti, 0.09, 10)
        b.manda('talosAsrTratto', { text: 'prima parte' })
        suoni(b, avanti, 0.002, 4)
        expect(b.p.anticipa).toHaveBeenCalledTimes(1)
        suoni(b, avanti, 0.09, 6)                         // riprende a parlare
        await motore.stop()                               // e ferma mentre parla: niente anticipo valido
        expect(ultimaTrascrizione(b)?.anticipo).not.toBe(true)

        const c = ponte()
        const m2 = creaMotoreLocale({ ponte: c.p, clock: () => ora })
        await m2.start(eventi().e)
        suoni(c, avanti, 0.09, 10)
        c.manda('talosAsrTratto', { text: 'prima parte' })
        suoni(c, avanti, 0.002, 4)
        suoni(c, avanti, 0.09, 6)
        suoni(c, avanti, 0.002, 4)                        // seconda pausa: rilettura nuova
        expect(c.p.anticipa).toHaveBeenCalledTimes(2)
        await m2.stop()                                   // ferma in silenzio: il lavoro vale
        expect(ultimaTrascrizione(c)?.anticipo).toBe(true)
    })

    it('N12-ANTICIPO-03: senza parole sentite non si rilegge niente, e oltre venti secondi di cattura nemmeno', async () => {
        let ora = 0
        const b = ponte()
        const motore = creaMotoreLocale({ ponte: b.p, clock: () => ora })
        await motore.start(eventi().e)
        const avanti = (ms: number) => { ora += ms }
        suoni(b, avanti, 0.09, 5)
        suoni(b, avanti, 0.002, 10)                       // rumore e silenzio, nessuna parola
        expect(b.p.anticipa).not.toHaveBeenCalled()
        b.manda('talosAsrTratto', { text: 'una dettatura lunga' })
        suoni(b, avanti, 0.09, 200)                       // venti secondi di parlato
        suoni(b, avanti, 0.002, 6)
        expect(b.p.anticipa).not.toHaveBeenCalled()
        await motore.stop()
        expect(ultimaTrascrizione(b)?.anticipo).not.toBe(true)
    })
})
