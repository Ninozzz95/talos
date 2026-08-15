import type { TalosTuningKey, TalosTuningProfile } from '@/lib/models/tuningProfile'

/**
 * ⭐ 8B-2: la misura dei thread, presa una volta e RICORDATA.
 *
 * ## Cosa mancava, e perché era peggio di non averlo fatto
 *
 * L'8B aveva misurato la cosa giusta e l'aveva scritta nel commit: sul Pad il
 * prefill passa da **126 a 260 token/s** fra 2 e 8 thread, mentre la generazione
 * resta **piatta** (25,9 → 23,9). Due carichi opposti, quindi due numeri.
 *
 * L'8B-2 doveva rendere quella misura una proprietà del **dispositivo più
 * questo modello**, invece di una derivazione dal numero di core. Il magazzino
 * dei profili è stato scritto, provato e collegato al lettore — e **nessuno
 * scriveva mai un profilo**. `talosStoredTuning` rispondeva `null` per sempre e
 * la chat tornava alla derivazione: codice morto che assomiglia a una funzione.
 *
 * Owner 2026-08-07: «metti il comando che misura 8b-2».
 *
 * ## Perché è un comando e non un avvio automatico
 *
 * Perché misurare **azzera la conversazione in memoria** — `nativeTuneThreads`
 * prova ogni candidato con un prefill vero — e costa qualche secondo per
 * candidato. Farlo da soli all'apertura vorrebbe dire far pagare quel prezzo a
 * chi voleva solo scrivere un messaggio, e per giunta senza dirglielo.
 *
 * Chiedendolo, invece, chi lo chiede sa cosa sta comprando. È la stessa ragione
 * per cui scaricare un modello chiede sempre, per quanto piccolo sia.
 */

/** Il modello aperto e il dispositivo, come li dichiarano loro. */
export interface TalosThreadTuningContext {
    modelPath: string
    modelBytes: number
    modelModifiedAt: number
    deviceModel: string
    cpuCores: number
    appBuild: string
}

export interface TalosThreadTuningOutcome {
    ok: boolean
    /** La riga da mostrare: cosa è stato misurato, o perché non si è potuto. */
    summary: string
    profile: TalosTuningProfile | null
    /** La griglia grezza, per chi vuole vedere i numeri e non la conclusione. */
    grid: ReadonlyArray<{ threads: number, prefill: number, decode: number }>
}

/**
 * I candidati da provare, derivati dai core e non scritti a mano.
 *
 * ⛔ Non `[2, 4, 6, 8]`: su un telefono da 4 core proverebbe due configurazioni
 * impossibili e ne salterebbe una utile. Il passo è due perché la differenza fra
 * 5 e 6 thread è sotto il rumore della misura — MISURATO nell'8B: 238,1 contro
 * 238,5 token/s — mentre fra 4 e 8 è quasi il doppio.
 */
export function talosThreadCandidates(cpuCores: number): number[] {
    if (!Number.isFinite(cpuCores) || cpuCores < 2) return []
    const candidati: number[] = []
    for (let threads = 2; threads <= cpuCores; threads += 2) candidati.push(threads)
    // L'ultimo core conta: con 7 core il ciclo si ferma a 6 e non proverebbe mai
    // la configurazione che il dispositivo può davvero dare.
    if (candidati[candidati.length - 1] !== cpuCores) candidati.push(cpuCores)
    return candidati
}

/**
 * Misura, sceglie e ricorda. È «il comando».
 *
 * ⛔ La scelta NON si rifà qui: `talosPreferFewerThreads` è la regola del 3% già
 * scritta e già provata, e riusarla è il punto — due funzioni che scelgono i
 * thread finirebbero per scegliere numeri diversi dalla stessa griglia, e non ci
 * sarebbe modo di sapere quale delle due ha ragione.
 *
 * Gli import sono a richiesta: il Doctor è una schermata rara e il motore locale
 * è un grafo pesante — vedi la nota estesa in `localEngineDoctor`.
 */
export async function talosRunThreadTuning(
    context: TalosThreadTuningContext,
): Promise<TalosThreadTuningOutcome> {
    const [{ talosMeasureThreadTuning }, { talosRememberTuning, talosNoteTuningFailure },
        { talosPreferFewerThreads }] = await Promise.all([
        import('@/services/localEngine'),
        import('@/services/tuningProfileStore'),
        import('@/lib/models/engineTuning'),
    ])

    const key: TalosTuningKey = {
        deviceModel: context.deviceModel,
        cpuCores: context.cpuCores,
        appBuild: context.appBuild,
        modelPath: context.modelPath,
        modelBytes: context.modelBytes,
        modelModifiedAt: context.modelModifiedAt,
    }

    const candidati = talosThreadCandidates(context.cpuCores)
    if (candidati.length === 0) {
        return { ok: false, summary: 'Non ci sono abbastanza core per misurare.', profile: null, grid: [] }
    }

    const misura = await talosMeasureThreadTuning(candidati)
    if (!misura || misura.grid.length === 0) {
        /*
         * Il fallimento si ANNOTA, e non è pedanteria: senza, il comando
         * riproverebbe la stessa misura impossibile ogni volta che qualcuno lo
         * tocca — su un modello che non regge la sonda sono secondi buttati a
         * ogni giro. Due tentativi e poi si smette, come dice il magazzino.
         */
        await talosNoteTuningFailure(key)
        return {
            ok: false,
            summary: 'La misura non è riuscita su questo modello. Restano i numeri derivati dai core.',
            profile: null,
            grid: [],
        }
    }

    /*
     * Il prefill prende il massimo perché SCALA; la generazione prende il numero
     * più basso entro il 3% del massimo perché NON scala, e ogni thread in meno
     * è un core che resta alla UI. Sono i due criteri opposti dell'8B, applicati
     * dalla funzione che li possiede.
     */
    const threadsBatch = talosPreferFewerThreads(misura.grid, 'prefill') === null
        ? misura.threadsBatch
        : Math.max(...misura.grid.filter((r) => r.prefill > 0).map((r) => r.threads))
    const threads = talosPreferFewerThreads(misura.grid, 'decode') ?? misura.threads

    const prefill = misura.grid.find((riga) => riga.threads === threadsBatch)
    const decode = misura.grid.find((riga) => riga.threads === threads)

    const profile: TalosTuningProfile = {
        key,
        threads,
        threadsBatch,
        prefillPerSecond: prefill?.prefill ?? misura.prefillPerSecond,
        decodePerSecond: decode?.decode ?? misura.decodePerSecond,
        measuredAt: Date.now(),
        failures: 0,
    }
    await talosRememberTuning(profile)

    return {
        ok: true,
        summary: `${threads} thread per generare, ${threadsBatch} per il prefill`
            + ` — prefill ${Math.round(profile.prefillPerSecond)} tok/s`
            + `, generazione ${Math.round(profile.decodePerSecond)} tok/s`,
        profile,
        grid: misura.grid,
    }
}
