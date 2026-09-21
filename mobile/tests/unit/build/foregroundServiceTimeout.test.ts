import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Android 15 gives a `dataSync` foreground service SIX HOURS a day and calls
 * `onTimeout` when the budget is gone. An app that does not stop itself within
 * a few seconds is killed with `ForegroundServiceDidNotStopInTimeException` —
 * a crash, not a warning.
 *
 * TALOS declares that type, targets SDK 36, and had no override at all. Found
 * 2026-07-31 by a review that was looking at Hugging Face downloads and noticed
 * the budget is SHARED across the app: a download running on the same service
 * as long answers would spend it and take both down.
 *
 * Written against ONE service and immediately outgrown — the model transfer
 * added a second, and the guard failed with `['dataSync','dataSync']` rather
 * than checking it. So it now enumerates every service the manifest declares a
 * type for and holds each to the same rule, which is what it always claimed to
 * do.
 *
 * A source guard rather than an instrumented test, because the repo's gate
 * cannot run Android code — stated plainly, since the alternative was no guard.
 */
const MANIFEST = 'android/app/src/main/AndroidManifest.xml'

function read(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
}

/**
 * ⛔ SOLO QUESTI DUE hanno un budget a tempo, e la differenza non e' un dettaglio.
 *
 * Android 15 chiama `onTimeout` — e uccide l'app — solo per `dataSync` e
 * `mediaProcessing`. VERIFICATO sulla pagina dei cambi di comportamento di
 * Android 15 l'11 agosto 2026, mentre si aggiungeva un servizio `microphone`
 * per la parola di attivazione: quel tipo **non ha il timeout di sei ore**.
 *
 * ⇒ Pretendere `onTimeout` da un servizio `microphone` sarebbe una regola
 * FALSA: chiederebbe di gestire una richiamata che il sistema non manda mai, e
 * un presidio che chiede cose finte insegna a disattivare i presidi.
 */
const A_TEMPO = ['dataSync', 'mediaProcessing']

/**
 * Ogni `<service>` che dichiara un tipo, con la classe dietro.
 *
 * ⛔ Kotlin ANCHE: il primo giro cercava solo `.java`, e il servizio della
 * parola di attivazione — scritto in Kotlin — faceva fallire il file di prova
 * con `ENOENT` invece che con un giudizio. Un presidio che esplode e' un
 * presidio che qualcuno cancellera'.
 */
function declaredServices(): Array<{ name: string; types: string[]; source: string }> {
    const manifest = read(MANIFEST)
    return [...manifest.matchAll(/<service\b[^>]*?\/>/gs)]
        .map(([block]) => block)
        .filter((block) => block.includes('android:foregroundServiceType'))
        .map((block) => {
            const name = /android:name="([^"]+)"/.exec(block)?.[1] ?? ''
            const types = (/android:foregroundServiceType="([^"]+)"/.exec(block)?.[1] ?? '').split('|')
            const radice = `android/app/src/main/java/${name.replace(/^\./, 'ai.talos.').replace(/\./g, '/')}`
            const source = existsSync(resolve(process.cwd(), `${radice}.java`))
                ? read(`${radice}.java`)
                : read(`${radice}.kt`)
            return { name, types, source }
        })
}

/** Quelli a cui Android manda davvero il conto. */
function timedServices(): Array<{ name: string; types: string[]; source: string }> {
    return declaredServices().filter((service) => service.types.some((t) => A_TEMPO.includes(t)))
}

describe('every timed foreground service answers for its budget', () => {
    it('finds the services at all, so a rename cannot empty this gate', () => {
        const services = timedServices()

        expect(services.length).toBeGreaterThan(0)
        expect(services.map((service) => service.name)).toContain('ai.talos.TalosRunService')
        expect(services.map((service) => service.name)).toContain('ai.talos.TalosModelTransferService')
    })

    /**
     * The whole point is stopping. A handler that merely logs still crashes, so
     * each service must actually leave the foreground and end itself.
     */
    it.each(timedServices().map((service) => [service.name, service] as const))(
        '%s handles the timeout Android 15 sends and actually stops',
        (name, service) => {
            expect(`${name}: both overrides`).toBeTruthy()
            expect(service.source).toContain('public void onTimeout(int startId, int fgsType)')
            expect(service.source).toContain('public void onTimeout(int startId)')
            expect(service.source).toContain('stopForeground(STOP_FOREGROUND_REMOVE)')
            expect(service.source).toContain('stopSelf()')
        },
    )

    /**
     * Only types we have thought about. A new one arrives with its own budget,
     * its own timeout and its own way of killing the app, and it should stop
     * here rather than on someone's phone.
     */
    it('declares no foreground service type nobody has answered for', () => {
        const declared = new Set(declaredServices().flatMap((service) => service.types))

        /*
         * ⛔ `microphone` e' entrato l'11 agosto 2026 con «hey TALOS»: un
         * servizio che tiene il microfono aperto per aspettare la parola di
         * attivazione. NON e' a tempo (vedi `A_TEMPO`), ma resta elencato qui
         * perche' un tipo nuovo deve fermarsi su questa riga e non sul telefono
         * di qualcuno.
         *
         * ⛔ E la stessa riga NON e' concessa alla bolla, che tiene un pulsante
         * a schermo e non registra niente: la' `microphone` sarebbe una
         * dichiarazione falsa al sistema operativo. La differenza fra le due non
         * e' burocratica — e' se il servizio registra o no.
         */
        expect([...declared].sort()).toEqual(['dataSync', 'microphone'])
    })

    /**
     * ⛔ Un servizio che tiene il microfono deve DIRLO mentre lo tiene.
     *
     * Non e' una regola di Android: e' una regola nostra, e vale piu' delle
     * altre. Un microfono sempre aperto senza una notifica che lo dica e senza
     * un modo per spegnerlo e' esattamente cio' che un assistente non deve fare.
     */
    it('a microphone service says so with a notification you can turn off', () => {
        const microfoni = declaredServices().filter((service) => service.types.includes('microphone'))

        expect(microfoni.length).toBeGreaterThan(0)
        for (const servizio of microfoni) {
            expect(servizio.source).toContain('startForeground')
            expect(servizio.source).toContain('setOngoing(true)')
            expect(servizio.source).toContain('fun spegni')
        }
    })

    /**
     * The download must never share the run service's budget. Six hours is a
     * budget a 4 GB transfer on a slow link genuinely reaches, and spending it
     * would take down the thing that keeps long answers alive.
     */
    it('gives the download its own service rather than borrowing the run one', () => {
        const names = timedServices().map((service) => service.name)

        expect(new Set(names).size).toBe(names.length)
        expect(names).toContain('ai.talos.TalosModelTransferService')
    })
})
