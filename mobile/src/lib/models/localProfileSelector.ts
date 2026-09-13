/**
 * P1-5 — quale profilo backend userebbe MENO tempo per QUESTA risposta,
 * non «quale ha vinto un benchmark una volta».
 *
 * ## Cosa chiude
 *
 * Oggi `TalosBackendChoice.choose()` risponde a UNA domanda, netta e
 * spiegabile: «l'acceleratore è almeno 2× più veloce della CPU al primo
 * token?». Design.md §21 ne propone una seconda, più fine, per quando
 * ESISTONO già più profili qualificati per lo stesso modello: «per QUESTA
 * dimensione di output, quale minimizza la latenza totale attesa?». Le due
 * convivono — questa non sostituisce `TalosBackendChoice`, lo qualifica
 * ulteriormente quando c'è più di un candidato valido.
 *
 * ## La formula, e cosa NON misura ancora
 *
 * design.md §21.1:
 *
 * ```text
 * T(p, prompt, output) = Open(p) + Prefill(p, prompt) + output / DecodeRate(p)
 * ```
 *
 * ⛔ Oggi `TalosLocalProfile` porta SOLO `ttftMs` (un numero aggregato: apri
 * + prefill di un prompt breve FISSO, quello del probe di qualificazione) e
 * `decodeTokPerSec` — non le quindici misure che il documento sorgente
 * disegna (pp512, pp2048, tg64, ...). Questo selettore tratta `ttftMs` come
 * un costo FISSO di transizione (vedi CR-12 sotto), non come una funzione
 * che scala col prompt reale: è un'approssimazione dichiarata, non la
 * formula intera. Allargare `Prefill(p, promptSize)` a una misura vera
 * resta il passo successivo esplicito — lo stesso principio già scritto in
 * `TalosLocalProfile.java` per il payload.
 *
 * ## CR-12 — il costo di cambiare non è un dettaglio
 *
 * plan.md, CR-12: «un profilo può essere 5% più rapido a regime e molto
 * più lento se richiede un reload del modello». `Open(p)` è ZERO solo se
 * `p` è il profilo già attivo ORA — altrimenti si paga `ttftMs` per
 * intero, perché riaprire con un backend diverso è esattamente il costo
 * che quel numero misura. Un selettore che confrontasse solo i throughput
 * a regime sceglierebbe il backend sbagliato per una risposta breve.
 *
 * ## La regola del rumore (§21.2)
 *
 * «Store distributions, not only medians. When profiles overlap
 * materially, choose the lower-risk profile.» Senza distribuzioni complete
 * (un punto solo per profilo, oggi), l'interpretazione onesta è: se il
 * profilo GIÀ ATTIVO è entro la stessa banda di rumore già in uso altrove
 * in TALOS per le soglie di thread (`talosPreferFewerThreads`,
 * `engineTuning.ts`: <3% = rumore, non un vincitore), non vale la pena
 * cambiare per un vantaggio che il costo di transizione (CR-12)
 * annullerebbe comunque.
 */

export interface TalosProfileForSelection {
    backendRegistry: string
    backendDevice: string | null
    outcome: 'CORRECT' | 'FAILED'
    ttftMs: number
    /** `null` = non misurato. MAI 0: un profilo a velocità zero non è un dato, è un buco. */
    decodeTokPerSec: number | null
    /**
     * D-53 — token letti al secondo nel prefill. `null` = non misurato (profili
     * scritti prima dell'11/09/2026): allora `ttftMs` torna a fare da costo
     * fisso, com'era.
     */
    prefillTokPerSec?: number | null
    /** D-53 — quanto è costato aprire su questo motore. `null` = non misurato. */
    openMs?: number | null
}

/**
 * ⭐⭐⭐ D-53 — LA FORMA DEL LAVORO, cioè il pezzo senza cui la formula del §21
 * era giusta a metà.
 *
 * Banco sul Pad dell'owner, 11/09/2026, otto modelli da 1 a 4 miliardi: chi
 * vince la LETTURA del prompt perde la SCRITTURA su sette modelli su otto.
 *
 * ```
 *   LFM2.5 2.6B   lettura  CPU 181  GPU 445  NPU 1621   ← NPU, 3,6×
 *                 scrittura CPU 24,2 GPU 25,9 NPU 15,4  ← GPU
 * ```
 *
 * ⇒ Non esiste «il motore più veloce»: esiste il motore più veloce PER QUESTA
 * domanda. Un contesto da tremila token con una risposta di dieci parole vuole
 * chi legge in fretta; una domanda di dieci parole con una storia di dieci
 * frasi vuole chi scrive in fretta. Con `ttftMs` solo — misurato su UN prompt
 * fisso — le due domande erano indistinguibili.
 *
 * `promptTokens` è ciò che il motore dovrà leggere davvero (già noto prima di
 * aprire: `anticipo.promptTokens`), `expectedOutputTokens` è quanto ci si
 * aspetta che scriva. Nessun nome di modello entra qui: è la stessa formula per
 * qualunque GGUF, con i numeri di QUEL file su QUESTO telefono.
 */
export interface TalosWorkShape {
    promptTokens: number
    expectedOutputTokens: number
}

/** Stessa soglia di `talosPreferFewerThreads` — un solo criterio epistemico in tutto TALOS, non due. */
const TALOS_PROFILE_NOISE_BAND = 0.03

/**
 * Il tempo atteso per rispondere con QUESTO profilo, o `null` se non c'è
 * abbastanza per stimarlo (nessuna misura di decodifica, o un esito FAILED
 * — un profilo che non ha prodotto la risposta giusta non è un candidato,
 * indipendentemente da quanto è stato veloce a sbagliare).
 */
export function talosEstimatedLatencyMs(
    profile: TalosProfileForSelection,
    outputTokens: number,
    isActiveNow: boolean,
    /**
     * D-53 — quanti token andranno LETTI. Se manca, o se il profilo non ha la
     * velocità di lettura, `ttftMs` fa da costo fisso come prima: la formula
     * vecchia resta valida sui profili vecchi, e nessuno viene bocciato per
     * un campo che non poteva avere.
     */
    promptTokens?: number,
): number | null {
    if (profile.outcome !== 'CORRECT') return null
    if (profile.decodeTokPerSec === null || profile.decodeTokPerSec <= 0) return null
    const decodeMs = (outputTokens / profile.decodeTokPerSec) * 1000
    const pp = profile.prefillTokPerSec ?? null
    if (promptTokens !== undefined && pp !== null && pp > 0) {
        /*
         * T = Open + Prefill(prompt) + Decode(output), design.md §21.1 per
         * intero. `Open` si paga solo se si cambia motore (CR-12); se non è
         * stato misurato, l'unico numero onesto che contiene un'apertura è
         * `ttftMs` del sondaggio — pessimista, perché contiene anche un
         * prefill da 2.637 token, ma mai ottimista.
         */
        const openMs = isActiveNow ? 0 : (profile.openMs ?? profile.ttftMs)
        return openMs + (promptTokens / pp) * 1000 + decodeMs
    }
    // CR-12: il costo di transizione è ZERO solo se non c'è transizione.
    const transitionCostMs = isActiveNow ? 0 : profile.ttftMs
    return transitionCostMs + decodeMs
}

/**
 * D-53 — quanti token ci si aspetta che il modello SCRIVA, guardando quanto ha
 * scritto finora in questa conversazione.
 *
 * ⛔ Perché non `MAX_TOKENS`: 1.024 come attesa fissa diceva al selettore che
 * OGNI risposta è lunga, e un'attesa lunga premia sempre chi scrive veloce —
 * cioè faceva perdere all'NPU anche la domanda da dieci parole con tremila
 * token di contesto, dove la lettura è tutto. La mediana delle ultime risposte
 * dell'assistente è la stima più onesta che si ha prima di generare: una chat
 * che ha ricevuto tre righe per volta continuerà probabilmente così.
 *
 * ⛔ Caratteri / 4 è la stessa approssimazione già in uso in TALOS per il testo
 * (nessun tokenizer qui: il modello non è ancora aperto). Il pavimento a 32
 * evita che una chat di «sì» e «no» stimi una risposta da zero token, il tetto
 * a `massimo` è il limite reale della generazione.
 */
export function talosStimaTokenDiRisposta(
    risposte: readonly string[],
    fallback: number,
    massimo: number,
): number {
    const stime = risposte
        .map((testo) => Math.ceil(testo.length / 4))
        .filter((n) => n > 0)
        .slice(-5)
        .sort((a, b) => a - b)
    if (stime.length === 0) return Math.min(Math.max(fallback, 32), massimo)
    const mediana = stime[Math.floor(stime.length / 2)]!
    return Math.min(Math.max(mediana, 32), massimo)
}

/**
 * Il profilo che minimizza la latenza attesa per un output di questa
 * lunghezza — o `null` se nessun profilo qualificato ha abbastanza dati.
 *
 * ⛔⛔ NON è chiamata da nessuna apertura di produzione oggi: i profili
 * reali raccolti finora sul dispositivo sono troppo pochi per fidarsi di
 * un cambio automatico silenzioso di backend, ed è esattamente la
 * disciplina già scritta per questo intero programma — "niente si
 * promuove da telemetria passiva di una chat reale", design.md §32. Questa
 * funzione è la RACCOMANDAZIONE, pronta per un chiamante che la mostri
 * (diagnostica) prima che uno la applichi (un blocco successivo,
 * esplicito, con il suo proprio sì).
 */
export function talosSelectBestProfile(
    profiles: readonly TalosProfileForSelection[],
    activeBackendRegistry: string | null,
    outputTokens: number,
    /** D-53 — i token da leggere. Assente = formula vecchia, costo fisso. */
    promptTokens?: number,
): TalosProfileForSelection | null {
    const stime = profiles
        .map((profile) => ({
            profile,
            estimatedMs: talosEstimatedLatencyMs(
                profile, outputTokens, profile.backendRegistry === activeBackendRegistry, promptTokens,
            ),
        }))
        .filter((s): s is { profile: TalosProfileForSelection, estimatedMs: number } => s.estimatedMs !== null)
    if (stime.length === 0) return null

    stime.sort((a, b) => a.estimatedMs - b.estimatedMs)
    const migliore = stime[0]!

    // Il profilo attivo, se è entro il rumore del migliore, vince: cambiare
    // pagherebbe un costo di transizione reale per un vantaggio che questa
    // stessa misura non riesce a distinguere da zero.
    const sogliaRumore = migliore.estimatedMs * (1 + TALOS_PROFILE_NOISE_BAND)
    const attivoEntroIlRumore = stime.find(
        (s) => s.profile.backendRegistry === activeBackendRegistry && s.estimatedMs <= sogliaRumore,
    )
    return (attivoEntroIlRumore ?? migliore).profile
}
