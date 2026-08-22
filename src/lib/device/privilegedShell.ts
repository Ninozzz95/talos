import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'

/**
 * La strada privilegiata: si **agisce** con l'identità della shell, non ci si
 * fa **concedere** niente.
 *
 * ## La misura che decide tutto quello che c'è qui dentro
 *
 * Sul Pad dell'owner il 2026-08-08, OxygenOS 16.0.9.400. Il monitoraggio
 * permessi di Oppo blocca **una cosa sola** — che la shell conceda permessi ad
 * altre app — e non blocca che la shell faccia le cose:
 *
 * | comando | esito |
 * |---|---|
 * | `pm grant` · `appops set` | ⛔ SecurityException, uid 2000 |
 * | `cmd wifi set-wifi-enabled` | ✅ spento e riacceso davvero |
 * | `cmd bluetooth_manager disable`/`enable` | ✅ Success |
 * | `cmd notification set_dnd` | ✅ eseguito |
 * | `cmd notification allow_listener` | ✅ senza il viaggio nelle impostazioni |
 * | `settings put system`/`secure` | ✅ scritto e riletto |
 * | `dumpsys usagestats` · `cmd package list` | ✅ leggibili |
 *
 * ⇒ Quasi tutte le app che usano Shizuku se lo fanno **concedere** una volta e
 * poi lavorano da sole; su questi telefoni quella è l'unica strada chiusa. Noi
 * passiamo di qui **ogni volta**.
 *
 * ## ⛔ Il ripiego non è un dettaglio: è metà del contratto
 *
 * Shizuku non c'è sempre, e non sopravvive al riavvio. Ogni capacità qui dentro
 * ha una **seconda strada** senza privilegi — quasi sempre il pannello di
 * sistema che galleggia sopra l'app — e ogni risposta dice **quale delle due**
 * ha usato. «L'ho fatto io» e «te l'ho aperto» non sono la stessa cosa per chi
 * legge, e confonderle è il modo più rapido di far credere che una cosa sia
 * successa quando non è successa.
 */

interface PontePrivilegiato {
    exec(options: { command: string[], probe?: boolean }): Promise<{
        ok: boolean
        reason?: string
        program?: string
        exitCode?: number
        output?: string
        error?: string
    }>
}

export const TalosPrivilegeBridge = registerPlugin<PontePrivilegiato>('TalosPrivilege')

/** Com'è andata, e soprattutto **per quale strada**. */
export interface TalosPrivilegedOutcome {
    done: boolean
    /** `shell` = l'abbiamo fatto noi. `panel` = abbiamo aperto la porta giusta. */
    via: 'shell' | 'panel' | 'none'
    output?: string
    reason?: string
}

/**
 * I motivi, scritti come **istruzioni** per il modello e non come diagnosi.
 *
 * Un modello che riceve «Shizuku non è in esecuzione» riprova; uno che riceve
 * «dillo alla persona e offri la pagina» fa la cosa utile. È la stessa lezione
 * dei tool del telefono, dove «no-vibrator» da solo faceva riprovare.
 */
const MOTIVO: Record<string, string> = {
    // ⛔ Le chiavi tengono il vecchio nome di proposito: le installazioni gia'
    // in giro rispondono ancora cosi', e una chiave che non trova casa diventa
    // un motivo vuoto — cioe' un modello che riprova all'infinito.
    'shizuku-not-running': 'The privileged bridge is not connected on this phone right now. Tell the user, and offer to open the bridge page in TALOS so they can pair it with the six-digit code. Do not retry.',
    'shizuku-not-authorised': 'The bridge is packaged but has never been paired. Offer to open the bridge page so the user can pair it once with the six-digit code shown on their own screen. Do not retry.',
    'denied-by-system': 'The phone manufacturer refused this even through the privileged bridge. Tell the user plainly; there is nothing to retry.',
    'program-not-allowed': 'That program is not on the allowed list. This is a bug in TALOS, not something the user can fix.',
    'exec-unavailable': 'The privileged bridge cannot run commands on this build of Shizuku. Tell the user; do not retry.',
    'not-on-this-platform': 'There is no phone to act on here.',
    // ⛔ Non puo' piu' capitare — nessuno chiede piu' niente a Shizuku — ma la
    // chiave resta: un'app vecchia sul telefono di qualcuno la risponde ancora,
    // e un motivo senza testo e' un modello che riprova.
    'shizuku-refused': 'The privileged bridge could not run this. Tell the user plainly and offer the system panel instead. Do not retry.',
    'solo-ponte': 'This phone routes every privileged command through the in-house bridge. It needs to be paired once with a six-digit code. Offer to open the bridge page. Do not retry.',
}

/**
 * ⛔ E quando il motivo NON è in elenco, si dice comunque QUAL È.
 *
 * Misurato il 2026-08-08: il ponte rispondeva `shizuku-refused` — un motivo
 * nuovo, aggiunto dal lato nativo e mai arrivato qui — e la frase generica lo
 * ingoiava. TALOS riferiva «il percorso privilegiato non è disponibile», che è
 * l'unica cosa che la persona già vedeva da sé.
 *
 * Un elenco di motivi è per forza incompleto: ne nascono di nuovi ogni volta che
 * il lato nativo impara a distinguere un caso. Il ripiego non deve nascondere
 * quelli che non conosce — deve passarli, così chi legge (la persona, o io
 * mentre indago) ha almeno il nome della cosa da cercare.
 */
export function talosPrivilegedReason(reason: string | undefined): string {
    const noto = MOTIVO[reason ?? '']
    if (noto) return noto
    const quale = reason ? ` The bridge said: "${reason}".` : ''
    return `The privileged bridge did not manage it.${quale} Tell the user rather than retrying.`
}

/**
 * Esegue un comando con l'identità della shell.
 *
 * ⛔ Un **elenco di parole**, mai una riga da interpretare: gli argomenti li
 * sceglie il modello, e un testo di risposta con dentro uno spazio o un punto e
 * virgola diventerebbe un secondo comando.
 */
export async function talosRunAsShell(
    command: readonly string[],
    /**
     * ⛔⭐ UNA DOMANDA NON DEVE AVERE EFFETTI.
     *
     * Con `probe: true` il ponte risponde con quello che sa e basta: se la
     * connessione e' caduta NON prova a riagganciarla.
     *
     * Misurato sul Pad il 2026-08-09 col campionatore di pile, a ogni avvio:
     * il riaggancio costa una scoperta mDNS da SEI secondi, e il guardiano
     * delle capacita' la pagava a ogni apertura dell'app solo per sapere se il
     * ponte c'era. Dieci secondi di lavoro per una domanda.
     *
     * Chi AGISCE lo lascia falso: li' il riaggancio e' giusto, perche' senza
     * non potrebbe fare la cosa che gli e' stata chiesta.
     */
    opzioni: { readonly probe?: boolean } = {},
): Promise<{
    ok: boolean
    output: string
    reason?: string
}> {
    if (!Capacitor.isNativePlatform()) {
        return { ok: false, output: '', reason: 'not-on-this-platform' }
    }
    try {
        const esito = await TalosPrivilegeBridge.exec({
            command: [...command],
            probe: opzioni.probe === true,
        })
        return { ok: esito.ok, output: esito.output ?? '', reason: esito.reason }
    }
    catch {
        return { ok: false, output: '', reason: 'exec-unavailable' }
    }
}

/** Se la strada privilegiata è aperta adesso — non se lo era prima. */
export async function talosPrivilegedReady(): Promise<boolean> {
    // Si chiede al ponte una cosa innocua e si guarda se risponde. ⛔ Non si
    // tiene un flag: Shizuku muore al riavvio e un flag ricorderebbe un mondo
    // che non c'è più.
    // ⛔ `probe`: e' una DOMANDA. Senza, il guardiano pagava sei secondi di
    // scoperta mDNS a ogni avvio per riagganciare un ponte che voleva solo
    // guardare. Vedi `talosRunAsShell`.
    const esito = await talosRunAsShell(
        ['settings', 'get', 'system', 'screen_brightness'],
        { probe: true },
    )
    return esito.ok
}
