/*
 * ⭐⭐⭐ C5 — GLI ATTREZZI DIFFERITI (owner 17/10/2026, tre consigliate: «Ponte fisso come Hermes», «Quelli che scattano su
 * richiesta», A/B 20×3 prima di accenderlo).
 *
 * Il modello vede di serie ~70 attrezzi, ~20.100 token a OGNI chiamata (misurato su r4 701c6c0d2, `peso-differiti.mjs`).
 * Quelli che scattano solo su richiesta (CRUD delle sezioni, automazioni, obiettivo, fornitori, run del Workflow…) escono
 * dalla lista e restano raggiungibili da TRE attrezzi fissi: `tool_search` (cerca, e porta l'elenco intero dei nomi),
 * `tool_describe` (lo schema completo), `tool_call` (esegue). ~−12.000 token, −54%.
 *
 * Fonti (lette nel codice, clone `TALOS-RICERCHE/concorrenti/hermes-agent-2026-10-07`):
 *   - `tools/tool_search.py:1-7` — «core tools never defer… the catalog is stateless — rebuilt from the live tool-defs every
 *     assembly (a session-keyed one drifts and silently drops tools)». Qui: il catalogo si ricava ogni volta dalla lista viva
 *     del giro (`attrezziOpenAI`), mai da uno stato a parte.
 *   - `tools/tool_search.py:273-335` — i tre schemi del ponte, «kept short — every byte is paid every turn», e l'elenco dei
 *     nomi DENTRO la descrizione di `tool_search` («if a tool name appears here, do NOT claim it is unavailable»).
 *   - `tools/tool_search_catalog.py:79-196` — BM25 su nome a parole + descrizione + nomi dei parametri, ammesso solo chi
 *     porta la parola più rara della richiesta, e copertura ≥ metà dei termini da quattro termini in su.
 *   - `agent/tool_executor.py:395-445` — `_unwrap_tool_search_call`: `tool_call` si spacchetta PRIMA di permessi, ganci e
 *     attività, che vedono l'attrezzo vero; il trascritto tiene la chiamata al ponte. Prima di spacchettare si valida
 *     contro lo schema, perché il ponte nasconde lo schema vero alla validazione del fornitore.
 *   - `evals/core_tool_deferral/results/SUMMARY.md` — glm-5.3-flash: accuratezza 0,915 → 0,963, token −11%, giri 6,0 → 8,8;
 *     l'unica regressione è `clarify` (la domanda alla persona) ⇒ `ask_user_question` qui non si differisce MAI.
 * Codex fa la stessa cosa in un'altra forma (`core/src/tools/handlers/tool_search_spec.rs`: BM25, e lo schema entra fra gli
 * attrezzi della chiamata dopo): scartata dall'owner perché su chat completions cambia la testa della richiesta e perde la
 * cache; qui la lista resta byte per byte la stessa a ogni giro.
 *
 * ⛔ Adattato, non copiato:
 *   - `tool_call` porta UNA chiamata (`{name, arguments}`), non un elenco: il nostro ciclo dà a ogni chiamata il suo id, la
 *     sua scheda e il suo esito; più attrezzi insieme sono più `tool_call` nella stessa risposta (chiamate parallele native).
 *   - Lo stemmer è un taglio dei suffissi inglesi più comuni, non Snowball: i documenti sono ~45 attrezzi nostri, scritti in
 *     inglese, e un pacchetto in più nel kernel (condiviso con CLI e mobile) non vale la differenza.
 *   - `tool_call` su un attrezzo che il modello ha già davanti si esegue lo stesso (Hermes lo rifiuta): è nella sessione, e un
 *     rifiuto costerebbe solo un giro.
 *
 * ⛔ Il kernel lo accende solo con `attrezziDifferiti: true`: spento di serie, CLI e mobile non cambiano.
 */

export const NOME_RICERCA_ATTREZZI = 'tool_search'
export const NOME_DESCRIZIONE_ATTREZZI = 'tool_describe'
export const NOME_CHIAMATA_ATTREZZO = 'tool_call'
export const NOMI_DEL_PONTE = Object.freeze([NOME_RICERCA_ATTREZZI, NOME_DESCRIZIONE_ATTREZZI, NOME_CHIAMATA_ATTREZZO])

/*
 * L'insieme approvato dall'owner il 17/10 («quelli che scattano su richiesta»). Restano davanti: i sette di base, web_search,
 * time_now, file_edit, document_create e artifact_create, deleghe e figlie, Piano, memory_write e memory_find, e
 * `ask_user_question` (vedi la regressione di Hermes sopra). Gli attrezzi MCP, dei plugin e delle skill restano davanti:
 * l'owner non li ha messi nell'insieme.
 */
export const ATTREZZI_DIFFERIBILI = Object.freeze(new Set([
    'library_find', 'library_read', 'library_file_origin', 'library_rename', 'library_delete', 'library_export', 'library_context_policy_update',
    'notes_find', 'notes_read', 'notes_create', 'notes_update', 'notes_delete',
    'tasks_find', 'tasks_create', 'tasks_complete', 'tasks_update', 'tasks_delete',
    'memory_update', 'memory_delete',
    'research_find', 'research_start', 'research_read', 'research_rename', 'research_control', 'research_delete', 'research_deposit',
    'automation_list', 'automation_runs', 'automation_create', 'automation_update', 'automation_control',
    'goal_status', 'goal_create', 'goal_update',
    'provider_exclusions_list', 'provider_exclude', 'provider_allow', 'chatgpt_account',
    'workflow_status', 'workflow_output', 'workflow_control',
    'tool_create', 'generate_image', 'process_output', 'conversation_search',
    /* owner 24/10/2026 (domanda aperta dal 23/10): gli attrezzi nati DOPO l'insieme del 17/10 vanno dietro il ponte — annullare le
       modifiche ai file e i dispositivi del controllo remoto con le loro cartelle (~600 token a giro quando sono cablati). Restano
       davanti `artifact_create` e, quando arriverà, `artifact_update`: dietro il ponte il modello rifarebbe un artefatto invece di
       aggiornarlo. */
    'file_changes_undo',
    'remote_phones', 'remote_phone_pair', 'remote_phone_revoke', 'remote_phone_folders', 'remote_phone_folder_allow', 'remote_phone_folder_revoke', 'remote_phone_folder_unblock',
    'remote_control', // R5.14 (24/10/2026): nato dopo il 17/10, come gli altri del remoto
    'remote_device_send_file', // R5.13 (24/10/2026): mandare un file a un dispositivo, come gli altri del remoto
    'view_image', // owner 27/10/2026: nato dopo il 17/10, come gli altri (regola del 24/10)
    'report_problem', // «Segnala un problema» (29/10/2026): nato dopo il 17/10, dietro il ponte come gli altri (regola del 24/10)
    'local_page', // owner 27/10/2026 (server locali), scritto il 29/10: nato dopo il 17/10, come gli altri (regola del 24/10)
]))

/*
 * ⭐ 19/10/2026 — IL MODELLO LOCALE DEL TELEFONO (owner: «Essenziali + ponte per il resto», solo per la fonte `locale-ospite`).
 *   Misurato dal Mobile sul Pad: 18.331 token di prompt al primo passo, quasi tutti schemi d'attrezzi, ~105 s al primo token su
 *   LFM2.5-2.6B. In questo modo restano davanti SOLO gli undici qui sotto (~3.700 token) e TUTTO il resto passa dal ponte, anche gli
 *   attrezzi MCP e delle skill. Più tre attrezzi di dialogo e di Piano che il kernel offre solo a chi ne ha bisogno (una figlia,
 *   il modo Piano): nascosti, una figlia non saprebbe più rispondere alla madre né il Piano chiudersi — e altrove non costano niente.
 */
export const ATTREZZI_ESSENZIALI_LOCALI = Object.freeze(['elenca', 'cerca', 'leggi', 'scrivi', 'file_edit', 'shell', 'prova', 'naviga', 'web_search', 'ask_user_question', 'time_now'])
const SEMPRE_DAVANTI_SE_OFFERTI = Object.freeze(['ask_parent', 'answer_parent_question', 'present_plan'])

/* Hermes `tool_search.py`: «Defaults to 5 and is clamped to the configured maximum (25 by default)». */
const RISULTATI_PREDEFINITI = 5
const RISULTATI_MASSIMI = 25
/* Hermes `_MAX_QUERIES_PER_CALL = 7`, `_MAX_DESCRIBE_NAMES_PER_CALL = 10` */
const RICERCHE_MASSIME = 7
const DESCRIZIONI_MASSIME = 10
/* Hermes `_short_desc(max_chars=60)` per l'elenco, `_clip_description(cap=500)` per i risultati */
const DESCRIZIONE_IN_ELENCO = 60
const DESCRIZIONE_IN_RISULTATO = 500

const nomeDi = (a) => a?.function?.name
const descrizioneDi = (a) => String(a?.function?.description ?? '')

function primaFrase(testo, massimo) {
    const pulito = String(testo ?? '').split(/\s+/u).filter(Boolean).join(' ')
    const fine = pulito.search(/(?<!\be\.g)(?<!\bi\.e)(?<!\betc)[.!?](?=\s|$)/u)
    const frase = fine === -1 ? pulito : pulito.slice(0, fine + 1)
    if (frase.length <= massimo) return frase
    const tagliata = frase.slice(0, massimo)
    const aParola = tagliata.includes(' ') ? tagliata.slice(0, tagliata.lastIndexOf(' ')) : tagliata
    return `${aParola.replace(/[,;: ]+$/u, '')}…`
}

const taglia = (testo, massimo) => (testo.length <= massimo ? testo : `${testo.slice(0, massimo)}…`)

/* Il taglio dei suffissi inglesi più comuni: «notes» trova `notes_create`, «scheduled» trova «schedule». */
function radice(parola) {
    if (parola.length > 4 && parola.endsWith('ies')) return `${parola.slice(0, -3)}y`
    if (parola.length > 5 && parola.endsWith('ing')) return parola.slice(0, -3)
    if (parola.length > 4 && parola.endsWith('ed')) return parola.slice(0, -2)
    if (parola.length > 4 && /(?:ss|x|ch|sh)es$/u.test(parola)) return parola.slice(0, -2)
    if (parola.length > 3 && parola.endsWith('s') && !parola.endsWith('ss')) return parola.slice(0, -1)
    return parola
}

const parole = (testo) => (String(testo ?? '').match(/[A-Za-z0-9]+/gu) ?? []).map((p) => radice(p.toLowerCase()))

/* Hermes `_entry_search_text`: nome a parole + descrizione + nomi dei parametri di primo livello (i corpi degli schemi sono rumore).
   ⛔ Qui il nome a parole entra DUE volte: le nostre descrizioni sono lunghe (fino a ~3.000 caratteri) e citano altri oggetti,
   e col nome una volta sola «notes create» metteva `tool_create` davanti a `notes_create` (misurato con `peso-ponte.mjs`). */
function testoDaCercare(a) {
    const parametri = Object.keys(a?.function?.parameters?.properties ?? {}).join(' ')
    const nomeAParole = String(nomeDi(a)).replace(/[_.:-]/gu, ' ')
    return `${nomeAParole} ${nomeAParole} ${descrizioneDi(a)} ${parametri}`
}

/*
 * Lista del giro → { attrezzi, differiti }. `attrezzi` è ciò che parte verso il modello (davanti + i tre del ponte),
 * `differiti` i nomi dietro il ponte con il loro schema. Stessa lista ⇒ stesso risultato, identità compresa: la richiesta
 * resta byte per byte uguale fra un giro e l'altro (cache del fornitore). Senza nessun differibile nella lista, la lista
 * torna com'è e il ponte non c'è.
 */
/* `sempreDavanti`: gli attrezzi CENTRALI del compito, che non si nascondono mai (owner 17/10, dopo la revisione H: nella Ricerca
   approfondita `research_deposit` resta davanti; Hermes non differisce mai gli attrezzi del nucleo, `tool_search.py:1-7`). */
const divisioniFatte = new WeakMap()
/*
 * L1 motore locale (owner 20/10/2026: «11 essenziali + ponte anche sul PC quando gli attrezzi non entrano») — il PESO e l'ELENCO.
 *   Hermes stima i token degli schemi a 4 caratteri l'uno (`agent/model_metadata.py:2374`, `CHARS_PER_TOKEN = 4`;
 *   `tools/tool_search.py:193`) e dà all'elenco del ponte min(4000, 5% della finestra) (`tool_search.py:208-212`,
 *   `listing_token_budget`, `threshold_pct` 5): oltre, l'elenco degrada da pieno a soli nomi a niente
 *   (`tool_search_catalog.py:261-268`). Qui lo stesso, solo quando chi chiama dà la finestra (il modello locale del PC).
 */
export const CARATTERI_PER_TOKEN_ATTREZZI = 4
export const ELENCO_PONTE_MASSIMO = 4_000
export const QUOTA_ELENCO_PONTE = 0.05
export const pesoInToken = (testo) => Math.ceil(String(testo ?? '').length / CARATTERI_PER_TOKEN_ATTREZZI)
/** Il budget dell'elenco per una finestra; `null` = nessun limite (la finestra non si sa: come prima). */
export function budgetElencoDelPonte(finestra) {
    return Number.isSafeInteger(finestra) && finestra > 0 ? Math.min(ELENCO_PONTE_MASSIMO, Math.floor(finestra * QUOTA_ELENCO_PONTE)) : null
}
/** L'elenco dei differiti entro il budget: pieno, o soli nomi, o niente (`{ forma, testo }`). */
export function elencoDelPonteEntro(differiti, budget) {
    const pieno = elencoDeiDifferiti(differiti)
    if (budget === null || budget === undefined || pesoInToken(pieno) <= budget) return { forma: 'pieno', testo: pieno }
    const nomi = [...differiti.keys()].join(', ')
    if (pesoInToken(nomi) <= budget) return { forma: 'nomi', testo: nomi }
    return { forma: 'nessuno', testo: null }
}

/* `modo`: 'su-richiesta' (di serie: l'insieme approvato il 17/10) o 'essenziali' (il modello locale del telefono, 19/10, e quello
   del PC quando gli attrezzi non entrano, 20/10). `budgetElenco`: vedi `budgetElencoDelPonte`; assente ⇒ l'elenco pieno di sempre. */
export function dividiPerIlPonte(lista, sempreDavanti = [], modo = 'su-richiesta', { budgetElenco = null } = {}) {
    if (!Array.isArray(lista)) return { attrezzi: lista, differiti: new Map() }
    const essenziali = modo === 'essenziali'
    const chiave = `${essenziali ? 'E' : 'R'}\u0000${budgetElenco ?? ''}\u0000${[...sempreDavanti].sort().join('\u0000')}`
    let perLista = divisioniFatte.get(lista)
    if (!perLista) { perLista = new Map(); divisioniFatte.set(lista, perLista) }
    const giaFatta = perLista.get(chiave)
    if (giaFatta) return giaFatta
    const davanti = []
    const differiti = new Map()
    for (const a of lista) {
        const nome = nomeDi(a)
        if (NOMI_DEL_PONTE.includes(nome)) continue
        const dietro = essenziali
            ? !ATTREZZI_ESSENZIALI_LOCALI.includes(nome) && !SEMPRE_DAVANTI_SE_OFFERTI.includes(nome)
            : ATTREZZI_DIFFERIBILI.has(nome)
        if (dietro && !sempreDavanti.includes(nome)) differiti.set(nome, a)
        else davanti.push(a)
    }
    const divisione = differiti.size === 0
        ? { attrezzi: lista, differiti }
        : { attrezzi: [...davanti, ...schemiDelPonte(differiti, elencoDelPonteEntro(differiti, budgetElenco))], differiti }
    perLista.set(chiave, divisione)
    return divisione
}

function elencoDeiDifferiti(differiti) {
    return [...differiti.values()]
        .map((a) => `- ${nomeDi(a)}: ${primaFrase(descrizioneDi(a), DESCRIZIONE_IN_ELENCO)}`)
        .join('\n')
}

function schemaDelPonte(nome, descrizione, proprieta, richiesti) {
    return { type: 'function', function: { name: nome, description: descrizione, parameters: { type: 'object', properties: proprieta, required: richiesti } } }
}

function schemiDelPonte(differiti, elenco = elencoDelPonteEntro(differiti, null)) {
    /* la frase d'apertura e il fondo dipendono da quanto dell'elenco entra: pieno (la forma di sempre, byte per byte), soli nomi, niente */
    const apertura = elenco.forma === 'nessuno'
        ? `Search ${differiti.size} more tools that are loaded on demand. They are not listed here: search before deciding that a tool is missing, and `
        : `Search ${differiti.size} more tools that are loaded on demand. Every one of them is listed below${elenco.forma === 'nomi' ? ' by name' : ''}: when you see the `
            + `exact name you need, skip the search and load it with \`${NOME_DESCRIZIONE_ATTREZZI}\`. If a tool name appears here, `
    return [
        schemaDelPonte(
            NOME_RICERCA_ATTREZZI,
            apertura
            + 'do NOT claim it is unavailable. Queries are keywords, not questions: an object and an action, no filler words '
            + '(`notes create`, `automation schedule`, `library delete file`). Returns the matching names with their description. '
            + `Then \`${NOME_DESCRIZIONE_ATTREZZI}\` loads their parameters and \`${NOME_CHIAMATA_ATTREZZO}\` runs one. `
            + `Tools listed at the top level are already available and do not need to be searched.${elenco.testo ? `\n\n${elenco.testo}` : ''}`,
            {
                queries: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Keyword queries, one per capability you need (e.g. ["notes create", "goal status"]). Every word must appear in tool text, or the query returns nothing. A single string is accepted as one query.',
                },
                limit: { type: 'integer', description: `Maximum matches per query. Defaults to ${RISULTATI_PREDEFINITI}, at most ${RISULTATI_MASSIMI}.` },
            },
            ['queries'],
        ),
        schemaDelPonte(
            NOME_DESCRIZIONE_ATTREZZI,
            `Load the full parameter schemas of tools listed in \`${NOME_RICERCA_ATTREZZI}\`. Required before \`${NOME_CHIAMATA_ATTREZZO}\` `
            + 'when you do not know a tool\'s parameters. Put every name you need in one call.',
            { names: { type: 'array', items: { type: 'string' }, description: 'Exact tool names. A single string is accepted as one name.' } },
            ['names'],
        ),
        schemaDelPonte(
            NOME_CHIAMATA_ATTREZZO,
            `Run one tool listed in \`${NOME_RICERCA_ATTREZZI}\`. \`arguments\` follow that tool's schema (see \`${NOME_DESCRIZIONE_ATTREZZI}\`). `
            + 'Permissions, plan mode and approvals apply exactly as for any other tool. For several independent tools, make '
            + `several \`${NOME_CHIAMATA_ATTREZZO}\` calls in the same response.`,
            {
                name: { type: 'string', description: 'Exact tool name.' },
                arguments: { type: 'object', description: 'Arguments matching the tool schema.' },
            },
            ['name', 'arguments'],
        ),
    ]
}

/* Una stringa sola vale come elenco di uno (Hermes: «A single string is accepted»). */
function comeElenco(valore) {
    if (typeof valore === 'string') return [valore]
    return Array.isArray(valore) ? valore.filter((v) => typeof v === 'string') : []
}

/* Hermes `search_catalog`: BM25 (k1 1,5, b 0,75), ammessi solo i documenti con la parola più rara della richiesta e, da
   quattro termini rispondibili in su, con almeno metà di quei termini; il nome esatto passa sempre e va in cima. */
function cercaNelCatalogo(documenti, statistiche, richiesta, limite) {
    const termini = parole(richiesta)
    if (termini.length === 0) return []
    const { lunghezzaMedia, frequenze, quanti } = statistiche
    const idf = (t) => Math.log(1 + (quanti - (frequenze.get(t) ?? 0) + 0.5) / ((frequenze.get(t) ?? 0) + 0.5))
    const cancello = termini.reduce((migliore, t) => (idf(t) > idf(migliore) ? t : migliore), termini[0])
    const rispondibili = new Set(termini.filter((t) => (frequenze.get(t) ?? 0) > 0))
    const richiesti = rispondibili.size < 4 ? 1 : Math.ceil(rispondibili.size * 0.5)
    const esatto = richiesta.trim().toLowerCase()
    const punteggi = []
    for (const d of documenti) {
        const nomeEsatto = d.nome.toLowerCase() === esatto
        if (!nomeEsatto) {
            if (!d.insieme.has(cancello)) continue
            let coperti = 0
            for (const t of rispondibili) if (d.insieme.has(t)) coperti += 1
            if (coperti < richiesti) continue
        }
        let punteggio = 0
        for (const t of termini) {
            const tf = d.conteggi.get(t) ?? 0
            if (!tf) continue
            punteggio += idf(t) * tf * 2.5 / (tf + 1.5 * (1 - 0.75 + 0.75 * d.lunghezza / Math.max(lunghezzaMedia, 1)))
        }
        punteggi.push({ d, punteggio: nomeEsatto ? Infinity : punteggio })
    }
    return punteggi.sort((x, y) => y.punteggio - x.punteggio).slice(0, limite).map((p) => p.d)
}

function catalogo(differiti) {
    const documenti = [...differiti.values()].map((a) => {
        const termini = parole(testoDaCercare(a))
        const conteggi = new Map()
        for (const t of termini) conteggi.set(t, (conteggi.get(t) ?? 0) + 1)
        return { nome: nomeDi(a), attrezzo: a, lunghezza: termini.length, conteggi, insieme: new Set(termini) }
    })
    const frequenze = new Map()
    for (const d of documenti) for (const t of d.insieme) frequenze.set(t, (frequenze.get(t) ?? 0) + 1)
    const lunghezzaMedia = documenti.reduce((s, d) => s + d.lunghezza, 0) / Math.max(documenti.length, 1)
    return { documenti, statistiche: { lunghezzaMedia, frequenze, quanti: documenti.length } }
}

/* L'esito di `tool_search`, in testo a righe (contratto C5 §9, owner 10/10). */
export function cercaAttrezzi(differiti, argomenti) {
    const richieste = comeElenco(argomenti?.queries).map((q) => q.trim()).filter(Boolean)
    if (richieste.length === 0) return `${NOME_RICERCA_ATTREZZI} needs \`queries\`: one or more keyword queries, e.g. ["notes create"].`
    const limiteChiesto = Number.isInteger(argomenti?.limit) ? argomenti.limit : RISULTATI_PREDEFINITI
    const limite = Math.min(Math.max(limiteChiesto, 1), RISULTATI_MASSIMI)
    const { documenti, statistiche } = catalogo(differiti)
    const righe = []
    const prese = richieste.slice(0, RICERCHE_MASSIME)
    for (const richiesta of prese) {
        const trovati = cercaNelCatalogo(documenti, statistiche, richiesta, limite)
        if (trovati.length === 0) {
            righe.push(`Query "${richiesta}": no tool matches. Retry with fewer or different keywords, or pick a name from the list in ${NOME_RICERCA_ATTREZZI}.`)
            continue
        }
        righe.push(`Query "${richiesta}": ${trovati.length} ${trovati.length === 1 ? 'tool' : 'tools'}.`)
        for (const d of trovati) righe.push(`- ${d.nome}: ${taglia(descrizioneDi(d.attrezzo).split(/\s+/u).join(' '), DESCRIZIONE_IN_RISULTATO)}`)
    }
    if (richieste.length > prese.length) righe.push(`Only the first ${RICERCHE_MASSIME} queries were searched; send the rest in another call.`)
    righe.push(`Next: ${NOME_DESCRIZIONE_ATTREZZI} with the names you need, then ${NOME_CHIAMATA_ATTREZZO}.`)
    return righe.join('\n')
}

/* L'esito di `tool_describe`: lo schema completo, come il modello lo avrebbe visto fra i suoi attrezzi. */
export function descriviAttrezzi(differiti, argomenti) {
    const nomi = [...new Set(comeElenco(argomenti?.names).map((n) => n.trim()).filter(Boolean))]
    if (nomi.length === 0) return `${NOME_DESCRIZIONE_ATTREZZI} needs \`names\`: the exact names listed in ${NOME_RICERCA_ATTREZZI}.`
    const presi = nomi.slice(0, DESCRIZIONI_MASSIME)
    const trovati = []
    const sconosciuti = []
    for (const nome of presi) {
        const a = differiti.get(nome)
        if (a) trovati.push({ name: nome, description: descrizioneDi(a), parameters: a.function.parameters ?? { type: 'object', properties: {} } })
        else sconosciuti.push(nome)
    }
    const righe = []
    if (trovati.length > 0) righe.push(JSON.stringify(trovati, null, 1))
    if (sconosciuti.length > 0) righe.push(`Not loaded on demand: ${sconosciuti.join(', ')}. Use a name listed in ${NOME_RICERCA_ATTREZZI}; tools at the top level are called directly.`)
    if (nomi.length > presi.length) righe.push(`Only the first ${DESCRIZIONI_MASSIME} names were loaded; ask for the rest in another call.`)
    return righe.join('\n')
}

/*
 * `tool_call` → l'attrezzo vero, prima di qualunque cancello. `offerti` è la lista viva del giro: un nome che non c'è (un ruolo
 * che non lo ha, il Piano, il livello di permesso, una delega in sola lettura) si rifiuta qui, come Hermes («is not available
 * in this session»). Gli argomenti si controllano contro lo schema: il ponte nasconde lo schema vero al fornitore.
 * → `{ nome, argomenti }` oppure `{ rifiuto }` (testo per il modello, già col «Nothing was done»).
 */
export function risolviChiamataDelPonte(argomenti, offerti) {
    const nome = typeof argomenti?.name === 'string' ? argomenti.name.trim() : ''
    if (!nome) return { rifiuto: `REFUSED. ${NOME_CHIAMATA_ATTREZZO} needs \`name\`: an exact tool name listed in ${NOME_RICERCA_ATTREZZI}. Nothing was done.` }
    if (NOMI_DEL_PONTE.includes(nome)) return { rifiuto: `REFUSED. ${nome} is called directly, not through ${NOME_CHIAMATA_ATTREZZO}. Nothing was done.` }
    const attrezzo = (Array.isArray(offerti) ? offerti : []).find((a) => nomeDi(a) === nome)
    if (!attrezzo) return { rifiuto: `REFUSED. '${nome}' is not available in this session. Use ${NOME_RICERCA_ATTREZZI} to find tools you can call. Nothing was done.` }
    const dati = argomenti?.arguments ?? {}
    const parametri = attrezzo.function?.parameters ?? { type: 'object', properties: {} }
    const schema = `Parameters schema: ${JSON.stringify(parametri)}.`
    if (!dati || typeof dati !== 'object' || Array.isArray(dati)) {
        return { rifiuto: `REFUSED. ${NOME_CHIAMATA_ATTREZZO}: \`arguments\` for ${nome} must be an object. ${schema} Nothing was done.` }
    }
    const mancanti = (Array.isArray(parametri.required) ? parametri.required : []).filter((p) => dati[p] === undefined)
    if (mancanti.length > 0) {
        return { rifiuto: `REFUSED. ${nome} needs ${mancanti.map((p) => `\`${p}\``).join(', ')}. ${schema} Nothing was done.` }
    }
    return { nome, argomenti: dati }
}

/*
 * Per CHI GUARDA (eventi dell'interfaccia, schede): una chiamata al ponte si mostra come l'attrezzo vero, come il feed delle
 * attività di Hermes (`_unwrap_tool_search_call`: «downstream hooks… activity feed see the underlying tool»). Argomenti
 * illeggibili ⇒ la chiamata resta com'è. Non tocca mai ciò che va verso il modello.
 */
export function chiamataPerChiGuarda(nome, argomentiGrezzi) {
    if (nome !== NOME_CHIAMATA_ATTREZZO) return { nome, argomenti: argomentiGrezzi }
    let dati
    try { dati = JSON.parse(argomentiGrezzi || '{}') } catch { return { nome, argomenti: argomentiGrezzi } }
    const vero = typeof dati?.name === 'string' ? dati.name.trim() : ''
    if (!vero || NOMI_DEL_PONTE.includes(vero)) return { nome, argomenti: argomentiGrezzi }
    const interni = dati.arguments && typeof dati.arguments === 'object' && !Array.isArray(dati.arguments) ? dati.arguments : {}
    return { nome: vero, argomenti: JSON.stringify(interni) }
}
