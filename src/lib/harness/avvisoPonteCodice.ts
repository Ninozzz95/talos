import { Capacitor } from '@capacitor/core'

/**
 * ⭐⭐⭐ 12/9 — L'AVVISO DEL PONTE, nella sezione Codice.
 *
 * Owner, 12/09/2026: «avvisa nel toast nella sezione Codice se il ponte adb in
 * Impostazioni › Controllo telefono non è attivo, con passaggi chiari e
 * concisi per come attivarlo».
 *
 * ## Perché è QUESTA la cosa da dire, e non un'altra
 *
 * Il terminale di una sessione Codice non è una metafora: `TalosTerminalPlugin`
 * (`android/.../terminal/TalosTerminalPlugin.kt:3,363,470`) esegue ogni comando
 * attraverso `TalosPonteAdb.shell(...)` — **lo stesso** ponte che la schermata
 * Impostazioni → Controllo del telefono accende e sorveglia
 * (`TalosPrivilegePlugin.kt:843-848` → `TalosPonteAdb.disponibile/collegato`).
 * ⇒ Ponte giù = in Codice non parte né il terminale né un comando. Dirlo
 * all'ingresso è l'unico momento in cui la persona può ancora rimediare prima
 * di scrivere un messaggio e vederlo fallire.
 *
 * ## ⛔ Lo stato si CHIEDE al ponte, non si deduce
 *
 * Stessa regola già scritta in `PrivilegeScreen.vue:574` («Lo stato VERO del
 * ponte, chiesto al ponte. Nessuna deduzione.») e nel nativo: il Debug wireless
 * muore a ogni riavvio del telefono, e un valore ricordato racconterebbe un
 * telefono che non c'è più. Qui si chiama `bridgeStatus()` e basta.
 *
 * ⛔ E `sconosciuto` NON è `staccato`. Sulla build web, o se il plugin non
 * risponde, non lo sappiamo — e un avviso inventato è peggio del silenzio.
 *
 * ## La forma dell'avviso: una snackbar, UNA azione
 *
 * Material, letto il 12/09/2026:
 * - https://m1.material.io/components/snackbars-toasts.html — «Include maximum
 *   one text action (never "Dismiss" or "Cancel")», una snackbar alla volta,
 *   testo breve legato a ciò che è appena successo;
 * - https://m2.material.io/design/components/snackbars.html — stessa regola
 *   sull'azione singola;
 * - MDN, ruolo ARIA `status` e live region (12/09/2026): `aria-live="polite"`,
 *   messaggio breve, nessuno spostamento del fuoco — la regione di
 *   `TalosMobileToastRegion.vue` è già esattamente così.
 *
 * ⇒ DIVISIONE SCELTA. Nella snackbar stanno: che cosa è spento, che cosa non
 * funziona per questo, e i **due passi decisivi** — accendere «Debug wireless»
 * (l'unico che si fa FUORI da TALOS, e senza il quale nessun altro passo
 * conta) e tornare in Controllo del telefono. I passaggi per esteso — il
 * riaggancio automatico per chi si è già accoppiato, e l'accoppiamento con le
 * sei cifre per chi non l'ha mai fatto — restano dove già vivono e dove sono
 * SEMPRE aggiornati: `ponte.reconnectBody` / `ponte.pairBody` nella schermata
 * Controllo del telefono, a un tocco dall'azione della snackbar. Ripeterli qui
 * sarebbe una seconda copia da tenere allineata, e una snackbar di sei righe.
 *
 * ## Una volta per INGRESSO, non a ogni render
 *
 * Il latch `visitaAperta` si chiude quando la rotta esce dalla stazione Codice
 * (`harness` / `harness-session`, stesso `desktop_station_id: 'harness'` in
 * `lib/mobileRoutes.ts:175-176`). Così: lista → sessione → indietro = UN avviso;
 * e su tablet la lista incorporata nella sidebar e la schermata instradata,
 * che montano insieme, non ne fanno due.
 */

/** Cosa sappiamo del ponte ADESSO. ⛔ Quattro stati, non due. */
export type TalosStatoPonteCodice = 'collegato' | 'staccato' | 'assente' | 'sconosciuto'

interface PontePrivilegio {
    bridgeStatus(): Promise<{ packaged: boolean, connected: boolean }>
}

/**
 * Lo stato del ponte, chiesto al ponte.
 *
 * `assente` = i binari non sono in questa copia (build web, o un APK senza
 * `libadb.so`): non c'è nessun passo da suggerire, e prometterne uno sarebbe
 * una bugia. `sconosciuto` = il plugin non ha risposto: non si accusa nessuno.
 */
export async function leggiStatoPonteCodice(): Promise<TalosStatoPonteCodice> {
    if (!Capacitor.isPluginAvailable('TalosPrivilege')) return 'sconosciuto'
    try {
        const plugin = Capacitor.registerPlugin<PontePrivilegio>('TalosPrivilege')
        const stato = await plugin.bridgeStatus()
        if (stato?.packaged !== true) return 'assente'
        return stato.connected === true ? 'collegato' : 'staccato'
    } catch {
        return 'sconosciuto'
    }
}

/** Le rotte che SONO la sezione Codice. Stessa stazione, due schermate. */
const ROTTE_CODICE = new Set(['harness', 'harness-session'])

/**
 * Quanto resta a schermo. Più lungo dei 5-6 s degli altri avvisi di questa
 * schermata: qui non si legge un esito, si leggono due istruzioni — e la
 * regione ha comunque la X per chiuderlo prima.
 */
export const TALOS_AVVISO_PONTE_DURATA_MS = 12_000

/** Ogni quanto si riguarda se il ponte è tornato su, finché l'avviso è a schermo. */
export const TALOS_AVVISO_PONTE_RIGUARDA_MS = 3_000
/** ⛔ Un tetto, non un battito perpetuo: la sentinella vera vive in Impostazioni. */
export const TALOS_AVVISO_PONTE_RIGUARDI_MAX = 4

export interface TalosAvvisoPonteToasts {
    push(toast: { message: string, action?: { label: string, run: () => void }, durationMs?: number }): number
    dismiss(id: number): void
}

export interface TalosAvvisoPonteRouter {
    push(to: { name: string }): unknown
    afterEach?(guardia: (to: { name?: unknown }) => void): unknown
}

export interface TalosAvvisoPonteOpzioni {
    router: TalosAvvisoPonteRouter
    toasts: TalosAvvisoPonteToasts
    t: (chiave: string) => string
    /** `talosHarnessUiAvailable()`: se Codice non c'è, non c'è niente da avvisare. */
    sezioneDisponibile: boolean
    /** Solo per le prove: di serie è `leggiStatoPonteCodice`. */
    leggiStato?: () => Promise<TalosStatoPonteCodice>
}

export interface TalosEsitoAvvisoPonte {
    mostrato: boolean
    stato: TalosStatoPonteCodice | null
    /** Perché non è stato mostrato — leggibile in un test e in una diagnosi. */
    motivo?: 'sezione-non-disponibile' | 'gia-avvisato' | 'ponte-collegato' | 'stato-sconosciuto'
}

let visitaAperta = false
let sentinellaRotta = false
let riguardo: ReturnType<typeof setInterval> | null = null

function fermaRiguardo(): void {
    if (riguardo === null) return
    clearInterval(riguardo)
    riguardo = null
}

/**
 * Chiude la visita appena la rotta esce da Codice, una volta sola per app.
 * ⛔ `afterEach` opzionale di proposito: i test delle schermate montano con un
 * router finto, e un avviso non deve poter rompere una schermata.
 */
function assicuraSentinellaRotta(router: TalosAvvisoPonteRouter): void {
    if (sentinellaRotta || typeof router.afterEach !== 'function') return
    sentinellaRotta = true
    router.afterEach((to) => {
        if (!ROTTE_CODICE.has(String(to?.name ?? ''))) {
            visitaAperta = false
            fermaRiguardo()
        }
    })
}

/**
 * ⭐ IL VERSO CONTRARIO, scritto nel codice e non solo nel test: se il ponte
 * torna su MENTRE l'avviso è a schermo, l'avviso se ne va da solo. Un'istruzione
 * che resta lì dopo che è stata eseguita insegna a non fidarsi degli avvisi.
 */
function sorvegliaIlRitorno(
    toasts: TalosAvvisoPonteToasts,
    idAvviso: number,
    leggiStato: () => Promise<TalosStatoPonteCodice>,
): void {
    fermaRiguardo()
    let giri = 0
    riguardo = setInterval(() => {
        giri += 1
        void leggiStato().then((stato) => {
            if (stato === 'collegato') {
                toasts.dismiss(idAvviso)
                fermaRiguardo()
                return
            }
            if (giri >= TALOS_AVVISO_PONTE_RIGUARDI_MAX) fermaRiguardo()
        })
    }, TALOS_AVVISO_PONTE_RIGUARDA_MS)
}

/**
 * Avvisa, se c'è da avvisare. Da chiamare al montaggio delle due schermate
 * della sezione Codice: il latch fa il resto.
 */
export async function avvisaSePonteStaccato(
    opzioni: TalosAvvisoPonteOpzioni,
): Promise<TalosEsitoAvvisoPonte> {
    const { router, toasts, t, sezioneDisponibile } = opzioni
    if (!sezioneDisponibile) return { mostrato: false, stato: null, motivo: 'sezione-non-disponibile' }
    assicuraSentinellaRotta(router)
    if (visitaAperta) return { mostrato: false, stato: null, motivo: 'gia-avvisato' }
    // ⛔ Prima dell'await: la lista incorporata e la schermata instradata montano
    // nello stesso tick, e due letture in volo farebbero due avvisi.
    visitaAperta = true

    const leggiStato = opzioni.leggiStato ?? leggiStatoPonteCodice
    const stato = await leggiStato()
    if (stato === 'collegato') return { mostrato: false, stato, motivo: 'ponte-collegato' }
    if (stato === 'sconosciuto') return { mostrato: false, stato, motivo: 'stato-sconosciuto' }

    if (stato === 'assente') {
        // Niente azione: non c'è nessuna pagina che possa rimediare a un binario
        // che non è nell'APK. Una snackbar con un pulsante che non risolve
        // niente è peggio di una senza.
        toasts.push({ message: t('harness.bridgeMissing'), durationMs: TALOS_AVVISO_PONTE_DURATA_MS })
        return { mostrato: true, stato }
    }

    const idAvviso = toasts.push({
        message: t('harness.bridgeOffline'),
        action: {
            label: t('harness.bridgeOfflineAction'),
            run: () => { router.push({ name: 'settings-privilege' }) },
        },
        durationMs: TALOS_AVVISO_PONTE_DURATA_MS,
    })
    sorvegliaIlRitorno(toasts, idAvviso, leggiStato)
    return { mostrato: true, stato }
}

/** Per le prove: azzera latch, sentinella e riguardo. */
export function __resetAvvisoPonteCodicePerTest(): void {
    visitaAperta = false
    sentinellaRotta = false
    fermaRiguardo()
}
