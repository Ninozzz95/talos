/**
 * FASE E — MCP client. Prima fetta: connessione stdio a UN server MCP
 * reale, elenco dei suoi tool, chiamata di un tool. Il server (FASE
 * successiva) resta fuori da questo file.
 *
 * ⛔ `@modelcontextprotocol/client` (v2), NON `@modelcontextprotocol/sdk`
 * (v1) — verificato con ctx7 il 29/8 PRIMA di scrivere una riga: l'SDK
 * si è diviso in pacchetti scoped a metà 2026, e il pacchetto v1 resta
 * pubblicato ma è esplicitamente "legacy support... should not be
 * included in new projects" (doc ufficiale). Il primo ledger di questa
 * fase (piano, sezione FASE E) nominava `@modelcontextprotocol/sdk` —
 * scritto A MEMORIA prima che questa fase si aprisse per davvero, mai
 * verificato alla fonte. Corretto qui, non lì: il piano resta la
 * cronaca di quando è stato scritto, questo file è quello che conta.
 *
 * Filtro di sicurezza per-server, come Hermes (già ricercato,
 * `elegant-spinning-dongarra.md` §2.2): un server MCP collegato non
 * espone MAI i suoi tool al modello senza una allowlist esplicita —
 * vedi `filtraToolMcp`.
 */
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

/**
 * Apre una connessione stdio verso un server MCP e ne fa l'handshake.
 *
 * `config`: `{ comando, argomenti?, nome?, versione? }` — `comando` è
 * l'eseguibile del server (es. `npx`), `argomenti` i suoi parametri
 * (es. `['-y', '@modelcontextprotocol/server-filesystem', cartella]`).
 *
 * `deps.ClientCls`/`deps.TransportCls` — stesso pattern DI già in uso
 * per `spawnPtyFn` in `pty-terminal.mjs`: default alle classi vere
 * dell'SDK, iniettabili nei test per non spawnare mai un processo reale
 * a unità (la verifica CON un processo reale vive in uno script a parte,
 * non nella suite `node --test`).
 *
 * Torna `{ client, chiudi }` — `chiudi()` chiude il transport e il
 * processo figlio che lo serviva. Non cattura errori di connect: un
 * server che non parte deve fallire in modo visibile a chi chiama, non
 * sparire in un `null`.
 */
export async function connettiServerMcp(config, deps = {}) {
    const ClientCls = deps.ClientCls ?? Client
    const TransportCls = deps.TransportCls ?? StdioClientTransport
    const client = new ClientCls({
        name: config.nome ?? 'talos-harness-desktop',
        version: config.versione ?? '1.0.0',
    })
    const transport = new TransportCls({
        command: config.comando,
        args: config.argomenti ?? [],
    })
    await client.connect(transport)
    return {
        client,
        chiudi: () => client.close(),
    }
}

/**
 * L'elenco dei tool che il server offre, con paginazione automatica
 * (il client la fa da solo — vedi doc ufficiale `listTools()`).
 * Torna l'array grezzo `{name, description, inputSchema}[]`: la
 * traduzione verso lo schema attrezzi di `talosHarness.mjs` è compito
 * di chi chiama, non di questo modulo (stesso confine già usato per
 * `document-generator.mjs`: qui solo il protocollo, mai la policy).
 */
export async function elencaToolMcp({ client }) {
    const { tools } = await client.listTools()
    return tools
}

/**
 * ⛔⛔⛔ IL FILTRO DI SICUREZZA — mai un tool MCP remoto esposto al
 * modello senza revisione esplicita. Hermes lo fa per-server prima di
 * esporre i tool remoti (ricerca già fatta); stesso principio qui, più
 * semplice: un'allowlist di nomi. Un nome non nell'allowlist non
 * compare mai nell'elenco filtrato — non un "nascosto ma chiamabile",
 * proprio assente.
 */
export function filtraToolMcp(tool, allowlist) {
    return tool.filter((t) => allowlist.includes(t.name))
}

/**
 * Chiama un tool del server. `argomenti` è l'oggetto già validato
 * contro `inputSchema` da chi chiama (questo modulo non valida: non
 * conosce lo schema di un tool arbitrario meglio del server stesso).
 *
 * Torna il risultato grezzo del protocollo — `content` (blocchi
 * testo/immagine) e `isError` se il tool stesso ha fallito (un
 * `isError:true` NON lancia: è un esito del tool, non un guasto del
 * trasporto — stessa distinzione già in uso in `corsaDiCoding.mjs` fra
 * "fallito" e "erroreDellHarness").
 */
export async function chiamaToolMcp({ client }, nome, argomenti) {
    return client.callTool({ name: nome, arguments: argomenti })
}
