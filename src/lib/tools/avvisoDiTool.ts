import { TALOS_TOOL_LABEL_KEYS, TALOS_TOOL_LABELS } from '@/lib/tools/toolLabels'
import type { TalosToolAuditRow } from '@/lib/tools/executor'

/**
 * ⛔⛔ LE RIGHE SCRITTE PER IL MODELLO NON VANNO SULLO SCHERMO DELLA PERSONA.
 *
 * ## Il difetto, visto dall'owner e non dedotto
 *
 * 2026-08-10, screenshot dal telefono: sopra il compositore, un riquadro con
 * dentro, in inglese:
 *
 * > «The user has not turned on notification access for TALOS yet. Say so and
 * > offer to open the system page. Do not retry.»
 *
 * Quella frase è un'ISTRUZIONE PER UNA MACCHINA — vive in
 * `notificationsBridge.ts`, esiste per impedire a un modello di riprovare
 * all'infinito, ed è giusta lì. Sullo schermo di chi possiede il telefono è
 * un difetto in tre modi insieme: è in un'altra lingua, dà ordini a qualcuno
 * che non è il destinatario, e non dice cosa fare.
 *
 * La strada: `toolset.audit()` pubblicava `body: row.error` — il testo del
 * modello — e `title: row.tool` — il nome INTERNO (`device_notifications_list`).
 * Il centro notifiche lo consegna al toast (`App.vue`: `evento.body ??
 * evento.title`) e alla notifica di Android. Due superfici umane, due perdite.
 *
 * ## La regola, e perché sta qui e non nel chiamante
 *
 * Un tool che fallisce si annuncia con **l'etichetta che la persona vede
 * ovunque** e una riga sola nella sua lingua; il PERCHÉ resta nella chat, dove
 * il modello lo dice per esteso — è la stessa divisione già scritta per le
 * notifiche di risposta: «la notifica ANTICIPA, la chat contiene».
 *
 * ⛔ È una funzione PURA con il traduttore iniettato, e non una riga dentro
 * `audit()`, per una ragione precisa: così la regola si può PROVARE. Un test
 * che monta mezzo toolset per controllare una stringa non lo scrive nessuno, e
 * una regola che nessuno prova torna indietro alla prima modifica.
 */
export interface TalosAvvisoDiTool {
    title: string
    body?: string
}

/**
 * Il traduttore, iniettato: questa funzione non deve sapere di i18n.
 *
 * I parametri sono `string | number` e non `unknown` per combaciare con la
 * firma vera di `talosT` — un tipo più largo qui costringerebbe il chiamante a
 * un cast, e un cast su un confine è il posto dove gli errori entrano.
 */
export type TalosTraduttore = (
    chiave: string,
    parametri?: Record<string, string | number>,
) => string

/**
 * Come si annuncia l'esecuzione di un tool a una PERSONA.
 *
 * `row.error` non compare nel risultato, in nessun ramo: è il testo del
 * modello, e questa funzione esiste per tenerlo fuori.
 */
export function talosAvvisoDiTool(
    row: Pick<TalosToolAuditRow, 'tool' | 'status' | 'error'>,
    t: TalosTraduttore,
): TalosAvvisoDiTool {
    const title = talosEtichettaUmana(row.tool, t)
    if (row.status !== 'failed') return { title }
    return { title, body: t('toolActivity.failedNotice', { tool: title }) }
}

/**
 * Il nome che la persona conosce.
 *
 * ⛔ Il ripiego è il nome del tool, non una frase generica: una riga che dice
 * «uno strumento non è riuscito» è meno utile di una che dice
 * `device_notifications_list`. Un tool nuovo senza etichetta è una nostra
 * mancanza, e deve restare riconoscibile finché non la colmiamo — la stessa
 * scelta già presa in `talosToolActivityLabel`.
 */
export function talosEtichettaUmana(tool: string, t: TalosTraduttore): string {
    const chiave = TALOS_TOOL_LABEL_KEYS[tool]
    if (chiave) {
        const tradotta = t(chiave)
        // `talosT` restituisce la CHIAVE quando la traduzione manca: una chiave
        // a schermo è peggio del nome interno, quindi si scarta.
        if (tradotta && tradotta !== chiave) return tradotta
    }
    return TALOS_TOOL_LABELS[tool] ?? tool
}
