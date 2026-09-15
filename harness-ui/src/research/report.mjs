import { talosResearchVerifiedStanding } from './verification.mjs'

/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchReport.ts (175 righe, 11/09/2026).
 *
 * ⛔ `verification.mjs` (porto di `researchVerification.ts`) lo cura un'altra
 * sessione, in parallelo: qui se ne importa solo il nome concordato, senza
 * duplicarne una riga.
 *
 * ⛔⛔ Questo è il pezzo che il cancello di consegna userà (disegno §6.5): il
 * record recintato ` ```talos-research-report ` deve scriversi e rileggersi
 * IDENTICO al mobile. Ogni carattere del recinto, l'ordine dei campi del
 * record e il `null` invece di un recupero parziale sono parte del contratto,
 * non stile.
 *
 * Il rapporto, scritto una volta per due lettori — e che porta il proprio verdetto.
 *
 * Stessa decisione del dossier, per la stessa ragione: prosa per una persona,
 * un record recintato per il processo, scritti entrambi da un oggetto solo così
 * che non possano divergere. Quello che cambia è CHE COSA tiene il record. Ogni
 * affermazione porta il suo passaggio, dove quel passaggio sta nel testo tenuto
 * della fonte, il verdetto, e il nome del giudice che l'ha dato.
 *
 * È la scommessa strutturale di questa fase. Verificare mentre si scrive lo
 * sanno fare tutti; poi la verifica evapora, e un mese dopo il lettore ha un
 * rapporto e nessun modo di chiedere come sia stato controllato. Siccome noi
 * teniamo il passaggio E il verdetto E il giudice, il controllo è un artefatto:
 * si può rileggere, rifare con un giudice diverso, e confrontare con quello che
 * diceva la prima volta. Un prodotto che conserva gli URL non può farlo a
 * nessun prezzo, perché la prova che ha controllato non c'è più.
 *
 * La prosa è stratificata dall'alto — risposta, poi affermazioni, poi fonti —
 * perché 5.000 parole in una colonna su un telefono sono un muro, e perché la
 * stratificazione deve sopravvivere alla lettura come semplice file Markdown
 * fuori dall'app.
 */

/**
 * @import { TalosResearchSource } from './collector.mjs'
 * @import { TalosResearchChecks, TalosResearchVerifiedClaim } from './verification.mjs'
 */

/**
 * @typedef {object} TalosResearchReportSourceRecord
 * @property {string} url
 * @property {string} title
 * @property {string | null} publishedAt
 * @property {'page' | 'snippet'} obtained
 */

/**
 * @typedef {object} TalosResearchReportClaimRecord
 * @property {string} text
 * @property {number} sourceIndex
 * @property {string} passage Il passaggio com'è nella fonte. Vuoto quando non ci è mai stato trovato.
 * @property {TalosResearchChecks} checks
 */

/**
 * @typedef {object} TalosResearchReportRecord
 * @property {1} version
 * @property {string} question
 * @property {string} summary
 * @property {string | null} judge Chi era disponibile a giudicare questa corsa,
 *   o `null` se nessuno lo era. Registrato qui invece che dedotto dalle
 *   affermazioni, perché sono due fatti diversi e dedurre l'uno dall'altro dice
 *   una bugia in un caso vero: una corsa con un giudice perfettamente buono le
 *   cui citazioni abbiano tutte fallito il controllo meccanico non ha nemmeno
 *   un giudice per affermazione, e si leggerebbe come «nessun giudice
 *   indipendente era disponibile». Mai verificato e mai avuto bisogno di
 *   verifica non devono sembrare la stessa cosa.
 * @property {readonly TalosResearchReportClaimRecord[]} claims
 * @property {readonly TalosResearchReportSourceRecord[]} sources
 */

const FENCE_OPEN = '```talos-research-report'
const FENCE_CLOSE = '```'

/**
 * Come si legge un verdetto per una persona. Parole, non simboli: questo file
 * viene letto anche fuori dall'app.
 *
 * @param {TalosResearchChecks} checks
 * @returns {string}
 */
export function talosResearchSupportLabel(checks) {
    switch (checks.claimSupported) {
        case 'yes': return 'sostenuta dalla fonte'
        case 'partial': return 'sostenuta solo in parte'
        case 'no': return 'NON sostenuta dalla fonte'
        // ⛔ CONTESA-01: la parola dice anche PERCHÉ, se no «contesa» da sola
        // si legge come una sfumatura di «parziale», che è ciò che non è.
        case 'contested': return 'contesa — le fonti non concordano'
        default: return 'non verificata'
    }
}

/**
 * @param {{
 *   question: string,
 *   summary: string,
 *   judge: string | null,
 *   claims: readonly TalosResearchVerifiedClaim[],
 *   sources: readonly TalosResearchSource[],
 * }} input
 * @returns {string}
 */
export function talosResearchReportDocument(input) {
    const standing = talosResearchVerifiedStanding(input.claims)

    /** @type {TalosResearchReportRecord} */
    const record = {
        version: 1,
        question: input.question,
        summary: input.summary,
        judge: input.judge,
        claims: input.claims.map((entry) => ({
            text: entry.claim.text,
            sourceIndex: entry.claim.sourceIndex,
            passage: entry.passage,
            checks: entry.checks,
        })),
        sources: input.sources.map((source) => ({
            url: source.url,
            title: source.title,
            publishedAt: source.publishedAt,
            obtained: source.obtained,
        })),
    }

    const verdictLine = [
        `Affermazioni: ${standing.total}`,
        `sostenute: ${standing.supported}`,
        `in parte: ${standing.partial}`,
        `non sostenute: ${standing.unsupported}`,
        `non verificate: ${standing.unchecked}`,
    ].join(' · ')

    const prose = [
        `# ${input.question}`,
        '',
        input.summary,
        '',
        verdictLine,
        input.judge
            ? `Verifica eseguita da: ${input.judge} — mai dal modello che ha scritto il rapporto.`
            : 'Verifica non eseguita: nessun giudice indipendente era disponibile.',
        '',
        '## Le affermazioni',
        ...input.claims.map((entry, index) => {
            const source = input.sources[entry.claim.sourceIndex - 1]
            return [
                '',
                `### ${index + 1}. ${entry.claim.text}`,
                `Esito: ${talosResearchSupportLabel(entry.checks)}${entry.checks.supportReason ? ` — ${entry.checks.supportReason}` : ''}`,
                entry.passage
                    ? `\n> ${entry.passage}`
                    : `\n> (il passaggio citato non è nel testo della fonte: "${entry.claim.quote}")`,
                '',
                source
                    ? `Fonte: ${source.title} — ${source.url}${source.obtained === 'snippet' ? ' (solo estratto dal motore di ricerca)' : ''}`
                    : 'Fonte: citata ma mai raccolta.',
            ].join('\n')
        }),
        '',
        `## Fonti (${input.sources.length})`,
        ...input.sources.map((source, index) => [
            `${index + 1}. ${source.title} — ${source.url}`,
            `   ${source.publishedAt ? `data dichiarata: ${source.publishedAt}` : 'data non dichiarata'}`,
            `   ${source.obtained === 'page' ? 'pagina letta' : 'solo estratto dal motore di ricerca'}`,
        ].join('\n')),
    ].join('\n')

    return `${prose}\n\n${FENCE_OPEN}\n${JSON.stringify(record)}\n${FENCE_CLOSE}\n`
}

/**
 * Rilegge un rapporto, o ammette di non poterlo fare.
 *
 * `null` invece di un recupero parziale, per la ragione che attraversa tutta
 * questa fase: un rapporto letto a metà mostrerebbe verdetti accanto ad
 * affermazioni a cui non appartengono, e un segno di verifica sbagliato è
 * peggio di nessuno.
 *
 * @param {string} document
 * @returns {TalosResearchReportRecord | null}
 */
export function talosResearchParseReport(document) {
    const start = document.indexOf(FENCE_OPEN)
    if (start < 0) return null
    const from = start + FENCE_OPEN.length
    const end = document.indexOf(FENCE_CLOSE, from)
    if (end < 0) return null

    try {
        /** @type {TalosResearchReportRecord} */
        const parsed = JSON.parse(document.slice(from, end))
        if (parsed?.version !== 1 || !Array.isArray(parsed.claims) || !Array.isArray(parsed.sources)) return null
        return { ...parsed, judge: parsed.judge ?? null }
    } catch {
        return null
    }
}
