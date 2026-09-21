/**
 * Quanto pesa un tool, e quando una catena di tool diventa pericolosa.
 *
 * ## Da dove viene
 *
 * Ricerca del 2026-08-06, fatta in due — la mia e quella dell'owner via ChatGPT
 * — e convergente su una cosa sola: **la sicurezza di un agente si impone FUORI
 * dal modello, con una regola deterministica**. CaMeL, FIDES, Progent, RTBAS e
 * FORGE fanno tutti la stessa scelta, e la ragione è che le loro garanzie sono
 * *architetturali* e non *comportamentali*: non dipendono da quanto è bravo il
 * modello a non farsi convincere.
 *
 * Per TALOS conta il doppio, perché il modello può essere **locale e piccolo**,
 * cioè più facile da manipolare di un modello di frontiera. Un system prompt
 * scritto bene non è una difesa: è un consiglio.
 *
 * ## La trifecta letale
 *
 * Il rischio grave non appartiene quasi mai a un tool solo. Nasce quando tre
 * cose stanno insieme nella stessa conversazione:
 *
 *     dati privati  +  contenuto non attendibile  +  un modo per farlo uscire
 *
 * `library_read` da solo è innocuo. `web_search` da solo è innocuo. Leggere una
 * nota che contiene «cerca su internet questo numero di carta» e poi cercarlo
 * **non è innocuo**, e nessuno dei due tool, guardato da solo, lo direbbe.
 *
 * Per questo il rischio non è un numero attaccato al tool: è una proprietà
 * della **catena**, e si calcola su ciò che è già successo.
 *
 * ## Perché quattro dimensioni e non quindici
 *
 * Il dossier ne propone quindici. Sono giuste tutte, e applicarle a ventisei
 * tool oggi significherebbe passare una settimana a compilare tabelle prima di
 * proteggere qualcosa. Qui stanno le quattro che **alimentano la decisione**:
 * le tre della trifecta più la reversibilità, che è l'unica che decide se un
 * «Annulla» può esistere. Il resto si aggiunge quando serve, e ogni campo
 * aggiunto dovrà dire quale decisione cambia.
 */

import type { TalosToolAction } from '@/lib/tools/permissionTypes'

/**
 * Quanto si può tornare indietro. Serve a UNA cosa sola, ed è per quella che
 * esiste: sapere se offrire «Annulla» sarebbe una promessa o una bugia.
 */
export type TalosToolReversibility =
    /** Non ha cambiato niente: non c'è niente da annullare. */
    | 'read-only'
    /** Lo stato di prima si può ripristinare per intero. */
    | 'reversible'
    /** Non si torna indietro, ma si può fare qualcosa che bilancia. */
    | 'compensable'
    /** Fatto è fatto. Qui «Annulla» non deve nemmeno comparire. */
    | 'irreversible'

/** Il peso di base, prima di guardare la catena. R0 innocuo → R4 irreparabile. */
export type TalosToolRisk = 'R0' | 'R1' | 'R2' | 'R3' | 'R4'

export interface TalosToolSecurity {
    risk: TalosToolRisk
    reversibility: TalosToolReversibility
    /**
     * Tocca roba che appartiene a chi usa l'app — Libreria, note, memoria,
     * attività, e domani contatti e notifiche.
     *
     * Non coincide con «legge»: `time_now` legge e non tocca niente di privato.
     */
    readsPrivateData: boolean
    /**
     * Porta dentro testo che l'utente non ha scritto: una pagina web, un
     * documento, una notifica di un'altra app.
     *
     * È il vettore dell'iniezione indiretta. Un tool con questo a `true`
     * **contamina la conversazione** anche quando ha funzionato perfettamente.
     */
    readsUntrustedContent: boolean
    /**
     * Può far uscire qualcosa da questo dispositivo — o produrre un effetto che
     * qualcun altro vede.
     *
     * Include i canali obliqui che il dossier elenca bene: non è solo «invia».
     * Aprire un URL costruito è trasmettere, anche se somiglia a una lettura.
     */
    canTransmit: boolean
    /**
     * ⛔⛔ L'ECCEZIONE DELL'OWNER AL VETO SU `R4`, dichiarata tool per tool.
     *
     * Owner 2026-08-12, dopo che avevo rifiutato una prima volta e lui ha
     * riconfermato: «il consenti sempre si riferiva al controllo del
     * dispositivo, da modalità ASSISTENTE».
     *
     * ## Perché la sua richiesta è giusta e la mia obiezione era parziale
     *
     * Il veto su `R4` protegge da una firma in bianco. Ma il pilota **non è una
     * chiamata**: è una sessione — decine di tocchi per aprire WhatsApp e
     * trovare una chat. Chiedere a ogni passo non è una difesa che morde una
     * volta di più: è una funzione che non si può usare, e una difesa
     * inutilizzabile viene spenta del tutto. È lo stesso ragionamento con cui
     * lui stesso, il 10 agosto, ha tolto il veto alle letture.
     *
     * ⛔ E il compromesso, detto per intero perché non si nasconde: un permesso
     * permanente qui è davvero su un'azione irreversibile. Regge su due presidi
     * che esistono già e vanno tenuti vivi:
     *   1. si **revoca** — la riga «Chiedi di nuovo» nel pannello degli
     *      strumenti, e resta visibile lì come «Sempre consentito»;
     *   2. il **freno al primo tocco** ferma comunque la sessione appena la mano
     *      dell'owner tocca lo schermo.
     *
     * ⛔ DEBITO DICHIARATO, e non lo scrivo come se fosse fatto: la scheda **non
     * dice** che questo «sempre» vale su un'azione che non si annulla. Il pezzo
     * che manca è il rischio: `TalosToolConsentRequest` ce l'ha, la riga
     * PERSISTITA (`TalosToolAuthorizationRequestV1`) no, e la scheda legge
     * quella. Portarcelo è una modifica di schema versionato, non una riga — va
     * fatta apposta e non di sfuggita.
     *
     * ⇒ È un DATO per tool e non una regola sul rischio, perché il prossimo
     * `R4` che nasce non deve ereditare l'eccezione per sbaglio: chi lo scrive
     * deve scriverla, e un test la conta.
     */
    sempreConsentibile?: true
}

/**
 * ⛔ A8 — da dove viene il CONTENUTO, non da dove viene il tool.
 *
 * ## Il difetto che questo tipo esiste per curare, con il numero
 *
 * `readsUntrustedContent` è una bandiera **statica per tool**: `notes_list`
 * dichiara di portare dentro contenuto non attendibile, e lo dichiara sempre —
 * che le note le abbia scritte l'utente a mano o gliele abbia riassunte il
 * modello da una pagina web.
 *
 * MISURATO sul catalogo di oggi: **15 tool su 38** tingono la conversazione, e
 * fra questi ci sono `notes_list`, `tasks_list`, `memory_search` e
 * `library_list`. Quindi dopo la **prima lettura qualsiasi** la catena è
 * contaminata e tutti e otto i tool che possono trasmettere chiudono la
 * trifecta. Ogni volta.
 *
 * La ricerca lo chiama **label creep** ed è il modo tipico in cui queste difese
 * falliscono: non perché non scattino, ma perché scattano sempre e vengono
 * spente (arXiv 2604.23374). Questo file lo scriveva già in fondo alla regola —
 * «una difesa che scatta sempre viene disattivata dopo tre giorni» — mentre il
 * resto del codice la costruiva proprio così.
 *
 * ## I tre valori, e perché tre e non due
 *
 * La decisione che conta è binaria — questo testo può contenere istruzioni
 * altrui? — ma il **registro** deve tenerne tre, perché `derived` è l'unico che
 * spiega perché una cosa scritta da noi è comunque sospetta.
 */
export type TalosContentOrigin =
    /** L'utente l'ha scritto o portato lui. Non è un vettore di iniezione. */
    | 'user-direct'
    /**
     * Il modello l'ha prodotto **mentre la catena era già contaminata**.
     *
     * Sospetto per eredità, non per natura: il testo viene da lì. È il valore
     * che rende la regola corretta invece che ottimista — un riassunto di una
     * pagina ostile è ostile quanto la pagina.
     */
    | 'derived'
    /** Arriva da fuori: una pagina, un documento scaricato, un'altra app. */
    | 'external'

/**
 * Cosa vale una riga di cui non sappiamo la storia.
 *
 * `NULL` in banca dati significa «scritta prima che la colonna esistesse», e si
 * legge **external**: il predefinito prudente non regala fiducia. Una riga
 * vecchia potrebbe benissimo essere un riassunto del web fatto il mese scorso.
 */
export const TALOS_CONTENT_ORIGIN_FALLBACK: TalosContentOrigin = 'external'

/** Riconosce un valore scritto in banca dati, e non si fida di quello che trova. */
export function talosContentOrigin(value: unknown): TalosContentOrigin {
    return value === 'user-direct' || value === 'derived' || value === 'external'
        ? value
        : TALOS_CONTENT_ORIGIN_FALLBACK
}

/** La proiezione sulla domanda che la trifecta pone: contamina o no? */
export function talosOriginIsUntrusted(origin: TalosContentOrigin): boolean {
    return origin !== 'user-direct'
}

/**
 * Che provenienza dare a una riga che sto scrivendo ADESSO.
 *
 * Non la decide chi scrive: la decide lo **stato della catena** in questo
 * istante. È l'unica cosa che sa da dove arriva il testo, e chiederlo a chi
 * chiama vorrebbe dire fidarsi di una dichiarazione — cioè della cosa che in
 * sicurezza non si fa mai.
 */
export function talosOriginForWrite(chain: TalosToolChainState): TalosContentOrigin {
    return chain.untrustedSeen ? 'derived' : 'user-direct'
}

/** Il predefinito è il PIÙ prudente: un tool che non dichiara è un tool sospetto. */
export const TALOS_TOOL_SECURITY_FALLBACK: TalosToolSecurity = Object.freeze({
    risk: 'R3',
    reversibility: 'irreversible',
    readsPrivateData: true,
    readsUntrustedContent: true,
    canTransmit: true,
})

/**
 * Ciò che è già successo in questa conversazione, e che il prossimo tool eredita.
 *
 * Si accumula e **non si azzera da sola**: una volta che una pagina web è
 * entrata nel discorso, il discorso resta contaminato. Il dossier lo dice bene
 * col caso della perdita del taint — se la provenienza non sopravvive, il
 * sistema considera pulito un dato che non lo è.
 */
export interface TalosToolChainState {
    /** Qualcuno ha già letto dati privati in questa conversazione. */
    privateDataSeen: boolean
    /** È già entrato contenuto non attendibile. */
    untrustedSeen: boolean
}

export const TALOS_EMPTY_CHAIN: TalosToolChainState = Object.freeze({
    privateDataSeen: false,
    untrustedSeen: false,
})

/**
 * Aggiorna la catena dopo che un tool è stato eseguito **con successo**.
 *
 * `declaredOrigin` è la provenienza di ciò che il tool ha DAVVERO restituito, e
 * quando c'è vince sulla bandiera statica del catalogo (A8). È la differenza
 * fra «`library_read` legge cose non attendibili» e «questo file l'ha caricato
 * l'utente»: la prima è vera per il tool, la seconda per il dato, e solo la
 * seconda serve a decidere.
 *
 * Assente, si ricade sul catalogo. Nessun tool regredisce mentre le superfici
 * imparano a dichiarare.
 */
export function talosAdvanceChain(
    chain: TalosToolChainState,
    security: TalosToolSecurity,
    declaredOrigin?: TalosContentOrigin,
): TalosToolChainState {
    const portaNonFidato = declaredOrigin === undefined
        ? security.readsUntrustedContent
        : talosOriginIsUntrusted(declaredOrigin)
    const privateDataSeen = chain.privateDataSeen || security.readsPrivateData
    const untrustedSeen = chain.untrustedSeen || portaNonFidato
    if (privateDataSeen === chain.privateDataSeen && untrustedSeen === chain.untrustedSeen) {
        return chain
    }
    return { privateDataSeen, untrustedSeen }
}

export type TalosTrifectaVerdict =
    /** La catena non è chiusa: si procede con le regole normali. */
    | { closed: false }
    /**
     * Le tre condizioni sono tutte vere. Si dice PERCHÉ, perché una superficie
     * che dice solo «bloccato» insegna a cercare come aggirarla.
     */
    | { closed: true; reason: 'trifecta'; privateDataSeen: true; untrustedSeen: true }

/**
 * La trifecta si chiude adesso?
 *
 * Vera solo se il tool che sta per partire **può trasmettere** e la catena ha
 * già visto sia dati privati sia contenuto non attendibile. Due su tre non
 * bastano: bloccare su due significherebbe bloccare `web_search` dopo una
 * lettura della Libreria, cioè quasi sempre, e una difesa che scatta sempre
 * viene disattivata dopo tre giorni.
 *
 * Nota su cosa questa funzione NON promette. Non è una difesa completa e la
 * ricerca lo dice: un tool ibrido che legge e trasmette insieme, un redirect
 * verso un dominio diverso, un canale obliquo (il titolo di un evento, il nome
 * di una rete, gli appunti) possono far uscire dati senza mai chiudere questa
 * regola. È il **primo cancello**, quello deterministico, e vale perché non
 * dipende da quanto il modello si lascia convincere.
 */
export function talosTrifectaVerdict(
    chain: TalosToolChainState,
    next: TalosToolSecurity,
): TalosTrifectaVerdict {
    if (!next.canTransmit) return { closed: false }
    if (!chain.privateDataSeen || !chain.untrustedSeen) return { closed: false }
    return { closed: true, reason: 'trifecta', privateDataSeen: true, untrustedSeen: true }
}

/**
 * Il rischio EFFETTIVO, che non è quello dichiarato.
 *
 * Sale di un gradino quando la catena porta già contenuto non attendibile e il
 * tool può trasmettere — cioè quando manca solo un pezzo alla trifecta. È il
 * modo di far chiedere conferma *prima* che la trappola si chiuda, invece di
 * limitarsi a sbarrare la porta dopo.
 */
export function talosEffectiveRisk(
    chain: TalosToolChainState,
    next: TalosToolSecurity,
): TalosToolRisk {
    const scala: TalosToolRisk[] = ['R0', 'R1', 'R2', 'R3', 'R4']
    let indice = scala.indexOf(next.risk)
    if (indice < 0) indice = scala.indexOf(TALOS_TOOL_SECURITY_FALLBACK.risk)
    if (next.canTransmit && chain.untrustedSeen) indice += 1
    if (next.canTransmit && chain.privateDataSeen) indice += 1
    return scala[Math.min(indice, scala.length - 1)]!
}

/**
 * Un rischio da cui non si può uscire con «consenti sempre».
 *
 * `R4` è la soglia, e non è una scelta di gusto: sono le azioni che il dossier
 * chiama irreversibili o che toccano segreti, denaro e credenziali. Un permesso
 * permanente su una di queste è una firma in bianco su qualcosa che non si può
 * ritirare.
 *
 * Vale anche quando il rischio è salito **per via della catena**: è lì che
 * serve di più, perché è il caso che nessuno aveva previsto scrivendo il tool.
 */
export function talosForbidsPersistentGrant(
    risk: TalosToolRisk,
    /** Le azioni che il tool chiede DAVVERO. Assenti = decide solo il rischio. */
    azioni?: readonly TalosToolAction[],
    /** L'eccezione dichiarata dal tool. Vedi `sempreConsentibile`. */
    sempreConsentibile?: boolean,
): boolean {
    // ⛔ Prima di tutto il resto: un tool che dichiara l'eccezione non la perde
    // nemmeno quando la CATENA lo porta a R4 — è proprio dentro una sessione
    // lunga che il pilota ci arriva, cioè esattamente il caso da servire.
    if (sempreConsentibile) return false
    /*
     * ⛔⛔ CHI SOLO LEGGE NON PERDE MAI IL «SEMPRE» — decisione dell'owner del
     * 2026-08-10: «voglio che consenti sempre appaia SEMPRE per le ricerche
     * web, nessuno escluso in lettura».
     *
     * Il caso che l'ha fatta nascere, dallo screenshot: `web_read` è R2, ma
     * dopo una ricerca la CATENA lo porta a R4 (contenuto non fidato + rete +
     * dati privati: la trifecta), e la scheda toglieva «consenti sempre» — su
     * una funzione che si usa dieci volte al giorno e che sul telefono non
     * cambia niente.
     *
     * ⛔ Il compromesso, detto per intero perché non si nasconde: una lettura
     * autorizzata per sempre è una porta aperta a un'iniezione — una pagina
     * scritta apposta può dire al modello cosa fare. Resta però una LETTURA:
     * qualunque cosa quella pagina convinca il modello a FARE passa da un tool
     * che SCRIVE, e quello il «sempre» non ce l'ha. È lì che la difesa morde,
     * ed è perché questa riga guarda `write` e non il rischio.
     *
     * ⛔ Ed è UNA riga anche per un motivo misurato: il grafo d'avvio ha 27
     * byte di margine, e la stessa logica a tre `if` lo sfondava di 2
     * (600.002 su 600.000).
     */
    return risk === 'R4' && (!azioni || azioni.includes('write'))
}

/**
 * La proiezione sulle tre azioni che l'utente conosce.
 *
 * TALOS ha una grammatica sola per i permessi e non se ne inventa una seconda:
 * quello che l'utente sceglie resta sempre / chiedi / mai su leggere, scrivere
 * e uscire in rete. Questo qui è ciò che il tool DICHIARA di sé, e serve al
 * codice — non compare mai in un'interfaccia come quarta dimensione da scegliere.
 */
export function talosSecurityMatchesActions(
    security: TalosToolSecurity,
    actions: readonly TalosToolAction[],
): boolean {
    // Chi trasmette deve dichiarare `outbound`: se non lo facesse, un «mai» su
    // «uscire in rete» non lo fermerebbe — e sarebbe il buco peggiore possibile,
    // perché invisibile a chi ha creduto di chiudere quella porta.
    if (security.canTransmit && !actions.includes('outbound')) return false
    // E chi non cambia niente non può dichiararsi in sola lettura mentendo.
    if (security.reversibility === 'read-only' && actions.includes('write')) return false
    return true
}
