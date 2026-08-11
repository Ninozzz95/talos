import type { TalosToolAuditRow } from '@/lib/tools/executor'

/**
 * ⭐⭐ COSA HA FATTO TALOS, scritto da TALOS — non dal modello.
 *
 * ## ⛔ Il difetto, misurato sul Pad il 2026-08-10
 *
 * Con Qwen3-1.7B, chat nuova, torcia accesa, «Spegni la torcia»:
 *
 * ```
 *   dumpsys   07:26:12 : Torch … turned off for client PID 1246   ✅ SPENTA
 *   in chat   «The tool_results do not contain what the user asked for.»
 * ```
 *
 * L'azione riesce e il racconto la nega. Con la chiave lo stesso turno dice
 * «Fatto, torcia spenta! 🔦». ⇒ Finché l'unico narratore è il modello, ciò che
 * la persona legge dipende da quanto è bravo il modello — e il motore locale è
 * piccolo per scelta, quindi il difetto non è un incidente: è strutturale.
 *
 * ## Cosa NON risolve, e perché va detto
 *
 * Questa riga non corregge il modello. Lo affianca: la frase resta quella che
 * il modello ha scritto, e sotto compare **cosa è successo davvero**. È la
 * stessa forma delle fonti e delle memorie usate — una dichiarazione della
 * macchina accanto a una frase del modello.
 *
 * ## ⛔ Solo ciò che AGISCE, e solo se è RIUSCITO
 *
 * Un `read` non si annuncia: una conversazione ne esegue anche dieci, e dieci
 * righe sarebbero il muro che rende invisibile l'unica che conta. Un fallito
 * nemmeno: quello ha già la sua strada — l'errore lo dice il modello, e la
 * notifica lo registra col peso giusto.
 *
 * ⇒ Restano le azioni riuscite, che sono esattamente quelle che una persona ha
 * il diritto di vedere elencate anche quando il modello le racconta male.
 */

/** Una riga di traccia: il tool che ha agito, con la sua etichetta. */
export interface TalosAzioneEseguita {
    /** Il nome interno, per ritrovare l'etichetta tradotta. */
    tool: string
}

/**
 * Le azioni riuscite di un turno, senza doppioni e nell'ordine in cui sono
 * successe.
 *
 * ⛔ Senza doppioni perché un modello che chiama due volte lo stesso strumento
 * — e i piccoli lo fanno — riempirebbe la traccia di ripetizioni che non
 * aggiungono niente a chi legge.
 */
export function talosAzioniEseguite(
    righe: readonly TalosToolAuditRow[],
): TalosAzioneEseguita[] {
    const visti = new Set<string>()
    const fuori: TalosAzioneEseguita[] = []
    for (const riga of righe) {
        if (riga.action !== 'write') continue
        if (riga.status !== 'succeeded') continue
        if (visti.has(riga.tool)) continue
        visti.add(riga.tool)
        fuori.push({ tool: riga.tool })
    }
    return fuori
}

/**
 * ⛔ La traccia si scrive nei metadati del messaggio, come le fonti e le
 * memorie: è una dichiarazione verificabile, non testo generato.
 *
 * Chiave `actions_done`, e non `tools`: quello che conta per chi legge non è
 * che uno strumento sia stato *chiamato*, ma che una cosa sia stata *fatta*.
 */
export const TALOS_METADATA_AZIONI = 'actions_done'

/** Vero quando c'è qualcosa da mostrare — usato dalla vista per non disegnare il vuoto. */
export function talosHaAzioniDaMostrare(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object') return false
    const valore = (metadata as Record<string, unknown>)[TALOS_METADATA_AZIONI]
    return Array.isArray(valore) && valore.length > 0
}

/**
 * ⭐⭐ IL MICROFONO SIGNIFICA UNA COSA SOLA: «qui c'è di mezzo la tua voce».
 *
 * Owner 2026-08-11: «quando premo il pulsante sound spunta l'icona microfono
 * accanto al testo. Questo non deve succedere. L'icona microfono deve spuntare
 * solo quando uso il microfono per parlare io con la voce».
 *
 * La riga era `message.role === 'assistant' && parla.lette.has(message.id)`:
 * il microfono marcava «TALOS ha LETTO questo» — il momento esatto in cui TALOS
 * **parla** e nessuno sta ascoltando al microfono. Il marcatore non si sposta,
 * **cambia proprietario**: va sul messaggio che la persona ha DETTATO.
 *
 * ⛔ Quello vecchio era un `Set` di id in memoria, vivo finché la schermata era
 * aperta. Per «l'ho appena letta» poteva bastare; per «questo l'hai dettato tu»
 * no — è un fatto sul messaggio, e un segno che sparisce quando riapri mente.
 * Quindi metadati, come la traccia delle azioni qui sopra: `metadata_json`
 * esiste già sulla riga, e `send()` accetta già un sacchetto.
 *
 * ⛔ E la provenienza NON si indovina: la decide `talosProvenienzaVoce`, che
 * tiene il PEZZO dettato e lo cerca nella bozza — regge «detta e corregge»,
 * «detta e riscrive a mano», «detta e annulla» senza nessuna euristica.
 *
 * ⛔ STA QUI e non in un file suo perché questo modulo è già la casa delle
 * chiavi dei metadati di un messaggio, ed è già importato dai due lati che
 * servono. Un modulo nuovo costava 58 byte del grafo d'avvio, che è a meno di
 * cento dal tetto: un file in più per due righe non vale un tetto sforato.
 */
export const TALOS_METADATA_DETTATO = 'dictated'
