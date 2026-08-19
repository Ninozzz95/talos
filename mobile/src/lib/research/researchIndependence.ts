/**
 * ⛔⛔ INDIPENDENZA-03 — tre fonti che ripetono la stessa non fanno tre prove.
 *
 * ## Il difetto che questo modulo chiude
 *
 * Un rapporto che dice «sostenuta da 3 fonti» sta facendo una promessa
 * numerica. Se quelle tre sono tre siti che riprendono lo stesso comunicato, il
 * 3 è **falso**: la prova è una sola, ripetuta tre volte, e chi legge decide con
 * più fiducia di quanta ne meriti il fatto.
 *
 * È il modo più comune in cui una notizia sbagliata si consolida, e un agente
 * che cerca sul web ci cade più facilmente di una persona: i primi risultati di
 * una ricerca sono spesso proprio le riprese.
 *
 * ## ⛔ Si misura con quello che ABBIAMO, non con quello che servirebbe
 *
 * La cosa giusta in assoluto sarebbe risalire alla catena editoriale di ogni
 * pagina. Non ce l'abbiamo, e fingere di averla sarebbe peggio di non contare
 * affatto. Quello che abbiamo, senza chiedere un byte in più alla rete, è il
 * **dominio registrabile** e le origini che una fonte cita quando il
 * raccoglitore le ha viste. Con quei due si fanno tre regole difendibili:
 *
 * 1. due pagine dello stesso dominio non sono due fonti;
 * 2. una fonte che cita **una sola** altra origine è una ripresa di quella;
 * 3. ⛔ una fonte che cita **più** origini diverse resta indipendente — è un
 *    lavoro che ha messo insieme più cose, e punirlo sarebbe il verso
 *    sbagliato: toglierebbe valore proprio alle fonti migliori.
 *
 * Il numero che si mostra è quello dei GRUPPI, non quello degli URL.
 */

/**
 * ⛔ La lista pubblica dei suffissi è un file da megabyte che cambia ogni
 * settimana: non entra in un'app che ha un tetto misurato sul grafo d'avvio.
 *
 * Qui basta molto meno. Serve a non tagliare `bbc.co.uk` in `co.uk`, che
 * trasformerebbe due testate britanniche diverse in una fonte sola — cioè
 * l'errore opposto a quello che stiamo curando, e il più insidioso: fa
 * sembrare DIPENDENTI due prove che sono davvero indipendenti.
 *
 * ⇒ Si tengono i secondi livelli veri, quelli sotto cui chiunque registra.
 * Un dominio fuori da questa lista viene trattato come normale, che è il caso
 * di gran lunga più frequente e sbaglia nella direzione prudente.
 */
const SUFFISSI_DI_SECONDO_LIVELLO: ReadonlySet<string> = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
    'com.br', 'net.br', 'org.br', 'gov.br',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz',
    'co.in', 'net.in', 'org.in', 'gov.in',
    'com.cn', 'net.cn', 'org.cn', 'gov.cn',
    'co.za', 'org.za', 'gov.za',
    'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
    'gov.it', 'edu.it',
])

/**
 * Il dominio sotto cui la fonte è registrata, o `null` se non è un indirizzo.
 *
 * ⛔ `null` è un esito, non un guasto: un URL illeggibile non deve inventare un
 * gruppo, perché un gruppo in più vuol dire una prova in più che non esiste.
 */
export function talosResearchRegistrableHost(url: string): string | null {
    let host: string
    try {
        host = new URL(url).hostname.toLowerCase()
    } catch {
        return null
    }
    if (!host) return null

    const parti = host.split('.').filter(Boolean)
    if (parti.length <= 2) return parti.join('.') || null

    const ultimiDue = parti.slice(-2).join('.')
    // Con un suffisso a due livelli il dominio vero ha TRE etichette.
    const quante = SUFFISSI_DI_SECONDO_LIVELLO.has(ultimiDue) ? 3 : 2
    return parti.slice(-quante).join('.')
}

export interface TalosResearchSourceOrigin {
    readonly url: string
    /**
     * Le origini che questa fonte cita a sua volta, quando il raccoglitore le
     * ha viste. Assente non vuol dire «nessuna»: vuol dire «non guardato», e
     * allora la fonte resta per conto suo.
     */
    readonly cites?: readonly string[]
}

export interface TalosResearchIndependenceGroup {
    /** Il dominio che regge il gruppo: l'origine comune, o la fonte stessa. */
    readonly origin: string
    /** Gli URL che ci ricadono dentro, nell'ordine in cui sono arrivati. */
    readonly sources: readonly string[]
}

export interface TalosResearchIndependence {
    /** Quante fonti sono state passate, riprese comprese. */
    readonly total: number
    /** Quante prove distinte ci sono davvero. */
    readonly independent: number
    readonly groups: readonly TalosResearchIndependenceGroup[]
}

/**
 * L'origine di cui una fonte è una RIPRESA, se lo è.
 *
 * Una sola origine citata, e diversa da sé: è una ripresa. Zero, o più di una,
 * oppure solo sé stessa: no.
 */
function origineDiCuiEUnaRipresa(
    proprio: string,
    cites: readonly string[] | undefined,
): string | null {
    if (!cites?.length) return null
    const altre = new Set<string>()
    for (const citata of cites) {
        const host = talosResearchRegistrableHost(citata)
        if (host && host !== proprio) altre.add(host)
    }
    return altre.size === 1 ? [...altre][0]! : null
}

export function talosResearchIndependentSources(
    sources: readonly TalosResearchSourceOrigin[],
): TalosResearchIndependence {
    const gruppi = new Map<string, string[]>()

    for (const source of sources) {
        const proprio = talosResearchRegistrableHost(source.url)
        // Un indirizzo illeggibile non entra: contarlo vorrebbe dire mostrare
        // una prova in più di quante ne abbiamo.
        if (!proprio) continue
        const origine = origineDiCuiEUnaRipresa(proprio, source.cites) ?? proprio
        const dentro = gruppi.get(origine)
        if (dentro) dentro.push(source.url)
        else gruppi.set(origine, [source.url])
    }

    return {
        total: sources.length,
        independent: gruppi.size,
        groups: [...gruppi].map(([origin, urls]) => ({ origin, sources: urls })),
    }
}
