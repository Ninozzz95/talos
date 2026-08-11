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

interface PonteRuolo {
    assistantRole(): Promise<TalosStatoRuoloAssistente>
    requestAssistantRole(): Promise<{ opened: boolean }>
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
 * Apre la finestra di sistema che chiede il ruolo.
 *
 * ⛔ Torna `false` invece di lanciare: chi chiama sta rispondendo a un tocco, e
 * un'eccezione lì diventa una schermata bianca. Il caso «non si è aperto» è un
 * esito da mostrare, non un incidente da propagare.
 */
export async function talosChiediRuoloAssistente(): Promise<boolean> {
    try {
        const esito = await Ponte.requestAssistantRole()
        return esito.opened === true
    } catch {
        return false
    }
}
