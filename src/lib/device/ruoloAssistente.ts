import { registerPlugin } from '@capacitor/core'

/**
 * ⭐⭐ IL RUOLO DI ASSISTENTE, dall'app — non dalle Impostazioni a mano.
 *
 * Owner 2026-08-11, mentre provava la barra sul suo telefono: «la funzione
 * assistenza è collegata all'app? Tutte le impostazioni sono predisposte per
 * settarla dall'app?».
 *
 * La risposta era NO, e questo file è la cura. Prima:
 * - il ruolo si metteva SOLO da Impostazioni → App predefinite → Assistente
 *   (o da `adb`, che una persona normale non ha);
 * - l'app non sapeva nemmeno di averlo, quindi non poteva dire «manca questo».
 *
 * ## ⛔ E il difetto che rendeva urgente saperlo
 *
 * MISURATO: **il ruolo si azzera a ogni reinstallazione dell'APK**. Nel giro di
 * sviluppo la barra smetteva di funzionare da sola, e sembrava un difetto
 * nostro. Con questa lettura TALOS può dirlo — «non sono più il tuo assistente,
 * rimettimi con un tocco» — invece di tacere e sembrare rotto.
 *
 * ## ⛔ Perché DUE risposte e non un booleano
 *
 * `held` e `canRequest` rispondono a due domande diverse, e confonderle
 * produrrebbe un pulsante morto: su certe ROM il ruolo esiste ma la finestra di
 * sistema per chiederlo non è disponibile, e lì l'unica strada resta la pagina
 * delle impostazioni. Una schermata che non può distinguere i due casi offre un
 * comando che non fa niente — il difetto che inseguiamo da settimane.
 */
export interface TalosStatoRuoloAssistente {
    /** TALOS è l'assistente ADESSO. */
    readonly held: boolean
    /** Il sistema ha una finestra da mostrare per chiederlo. */
    readonly canRequest: boolean
    /** Perché no, quando `canRequest` è falso. */
    readonly reason?: string
}

/**
 * Cosa risponde la finestra di sistema quando si richiude.
 *
 * ⛔ Tre risposte, non una, perché la schermata deve distinguere tre casi che
 * portano a comportamenti opposti:
 * - `opened` — l'abbiamo lanciata;
 * - `shown` — è rimasta abbastanza da poter essere LETTA (il nativo lo misura:
 *   una finestra che si autochiude muore in decine di ms);
 * - `granted` — il ruolo c'è, riletto dal sistema.
 *
 * `shown && !granted` è **un rifiuto**, e si rispetta. `!shown` è un problema
 * nostro, e si aggira col ponte. Confonderli significa o prendersi con la forza
 * ciò che è appena stato negato, o lasciare la persona davanti a un pulsante
 * morto: sono i due errori peggiori che questa schermata possa fare.
 */
export interface TalosEsitoRichiestaRuolo {
    readonly opened: boolean
    readonly shown: boolean
    readonly granted: boolean
    readonly reason?: string
}

interface PonteRuolo {
    assistantRole(): Promise<TalosStatoRuoloAssistente>
    requestAssistantRole(): Promise<TalosEsitoRichiestaRuolo>
    open(options: { target: string }): Promise<{ opened: boolean }>
}

const Ponte = registerPlugin<PonteRuolo>('TalosPrivilege')

/**
 * Com'è messo il ruolo adesso.
 *
 * ⛔ Fallisce CHIUSO: su web, o se il plugin non risponde, torna «non ce l'ho e
 * non posso chiederlo». Una schermata che per un errore di lettura dicesse
 * «sei l'assistente» manderebbe la persona a cercare una barra che non si apre.
 */
export async function talosLeggiRuoloAssistente(): Promise<TalosStatoRuoloAssistente> {
    try {
        return await Ponte.assistantRole()
    } catch {
        return { held: false, canRequest: false, reason: 'no-bridge' }
    }
}

/**
 * Apre la finestra di sistema che chiede il ruolo, e ASPETTA che si richiuda.
 *
 * ## ⛔ Perché adesso si aspetta invece di contare i secondi
 *
 * Fino all'11 agosto questa chiamata tornava appena la finestra partiva, e chi
 * la usava tirava a indovinare con un timer da 2,5 s: se la persona ci metteva
 * di più a leggere, l'app la dava per fallita mentre la finestra era ancora
 * sotto le sue dita. Ora il nativo usa `startActivityForResult` — che era anche
 * la CURA del difetto per cui la finestra non compariva affatto — e la promessa
 * si chiude quando si chiude la finestra. Niente più tetto arbitrario.
 *
 * ⛔ Torna un esito invece di lanciare: chi chiama sta rispondendo a un tocco, e
 * un'eccezione lì diventa una schermata bianca. «Non si è aperto» è un caso da
 * mostrare, non un incidente da propagare.
 */
export async function talosChiediRuoloAssistente(): Promise<TalosEsitoRichiestaRuolo> {
    try {
        const esito = await Ponte.requestAssistantRole()
        return {
            opened: esito.opened === true,
            shown: esito.shown === true,
            granted: esito.granted === true,
            reason: esito.reason,
        }
    } catch {
        // ⛔ `shown: false` anche qui: senza ponte non è comparso niente, e chi
        // legge deve poter tentare l'altra strada invece di credere a un no.
        return { opened: false, shown: false, granted: false, reason: 'no-bridge' }
    }
}

/**
 * ⭐⭐⭐ LA STRADA SENZA PONTE: la pagina di sistema dell'assistente.
 *
 * Quando la finestra del ruolo non compare — e su AOSP non compare MAI, perché
 * `roles.xml` dichiara il ruolo assistente `requestable="false"` — l'unica cosa
 * che restava era il ponte ADB. Questa è l'altra: si porta la persona sulla
 * pagina «App assistente digitale», dove TALOS è nell'elenco e serve un tocco.
 *
 * MISURATO sul Pad il 2026-08-16, togliendo il ruolo a TALOS per la prova:
 *
 *     richiesta in-app  →  53 ms, RESULT_CANCELED, nessuna finestra
 *     pagina di sistema →  «App assistente digitale», TALOS nell'elenco
 *
 * ⛔ Non torna nessun esito, e non può: la pagina è di Android e si chiude
 * quando vuole la persona. Chi chiama deve rileggere il ruolo AL RIENTRO — che
 * è già ciò che fa `appStateChange` — invece di credere a un sì che nessuno ha
 * detto. `opened` dice solo che la pagina si è aperta.
 */
export async function talosApriPaginaAssistente(): Promise<boolean> {
    try {
        const esito = await Ponte.open({ target: 'assistant' })
        return esito?.opened === true
    } catch {
        // Su web, o su una ROM senza quella pagina: chi chiama passerà oltre.
        return false
    }
}

/**
 * ⭐⭐ LA SECONDA STRADA: TALOS si nomina assistente COL PROPRIO PONTE.
 *
 * ## ⛔ Perché serve — misurato sul telefono dell'owner l'11 agosto
 *
 * OnePlus 13 (PJZ110), **ColorOS V16.1.0 cinese**, Android 16. Il pulsante
 * «Rendi TALOS l'assistente» non faceva niente. Il log dice perché:
 *
 *     RequestRoleActivity → checkFinished=true → removeAppToken
 *
 * cioè la finestra di sistema parte e **si chiude da sola**. E la schermata
 * «App assistente digitale» elenca **solo «Nessuno»**: né TALOS, né Claude, né
 * Google — pur avendo tutti un `VoiceInteractionService` valido (`pm
 * query-services` li elenca eccome). ⇒ Non siamo noi a non qualificarci: è la
 * ROM cinese che non offre nessun assistente da scegliere.
 *
 * ⭐ Ma il ruolo È assegnabile, provato:
 *
 *     cmd role add-role-holder android.app.role.ASSISTANT ai.talos.dev
 *     → get-role-holders: ai.talos.dev
 *
 * E lo stesso ponte scrive le due impostazioni che il sistema legge davvero.
 *
 * ## ⛔ Perché è la SECONDA e non la prima
 *
 * La finestra di sistema è la strada onesta: chiede, e la persona decide. Il
 * ponte fa lo stesso mestiere senza chiedere, e va offerto solo quando la prima
 * non ha funzionato — con un pulsante che dica cosa sta per succedere. È la
 * stessa regola del resto del progetto: «l'ho fatto io» e «te l'ho aperto» non
 * sono la stessa cosa per chi legge.
 */
export async function talosNominaAssistenteColPonte(pacchetto: string): Promise<boolean> {
    const { TalosPrivilegeBridge } = await import('@/lib/device/privilegedShell')
    const servizio = `${pacchetto}/ai.talos.agent.TalosAssistente`
    try {
        const ruolo = await TalosPrivilegeBridge.exec({
            command: ['cmd', 'role', 'add-role-holder', 'android.app.role.ASSISTANT', pacchetto],
        })
        if (!ruolo.ok) return false
        /*
         * ⛔ Le due impostazioni vanno scritte ANCHE dopo il ruolo: sul Pad il
         * ruolo da solo non bastava a far partire il gesto, e sono i due valori
         * che il sistema legge per sapere CHI chiamare.
         */
        await TalosPrivilegeBridge.exec({
            command: ['settings', 'put', 'secure', 'voice_interaction_service', servizio],
        })
        await TalosPrivilegeBridge.exec({
            command: ['settings', 'put', 'secure', 'assistant', servizio],
        })
        // ⛔ Non si dichiara vittoria sull'esito dei comandi: si RILEGGE dal
        // sistema. Un `cmd` che torna 0 e non ha fatto niente è esattamente il
        // difetto che ci è costato «Fatto ✅» su una notifica mai rimossa.
        const dopo = await talosLeggiRuoloAssistente()
        return dopo.held
    } catch {
        return false
    }
}
