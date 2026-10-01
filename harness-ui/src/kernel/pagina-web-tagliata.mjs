/*
 * ⛔⛔ LA PAGINA WEB TAGLIATA, COME HERMES — politica di taglio F006/F07/T04/B02 (audit 28-29/09/2026), decisione owner
 *   01/10/2026 «Come Hermes» e, per il posto, «per sessione, come Claude Code».
 *
 * Prima `naviga` mostrava 4.000 caratteri di una pagina (un quarto in testa, tre quarti in coda) con un marcatore nel
 * MEZZO: il modello non poteva sapere che c'era altro finché non lo trovava, e il mezzo era perso per sempre.
 *
 * ⇒ Come Hermes (`tools/web_tools_truncate.py:86-125`, `_truncate_with_footer`, commit 65ad529):
 *   - la pagina intera si salva su disco (`_store_full_text`), scrittura che rifiuta i collegamenti e sostituisce il file
 *     dello stesso indirizzo (`write_text_exclusive(..., overwrite=True)`);
 *   - il modello vede ~75% in testa e ~25% in coda, tagliati sui confini di riga (la testa arretra, la coda avanza, ma mai
 *     oltre metà della loro parte);
 *   - e gli si dice quanto vede, dove sta il resto e la chiamata ESATTA per leggere il mezzo (`read_file … offset=<righe
 *     della testa + 2>`); se il salvataggio fallisce, lo si dice invece di promettere una lettura che fallirebbe.
 * ⇒ Adattato a TALOS:
 *   - l'avviso sta IN TESTA, non in fondo: è la regola di B-02 (`conIntestazioneDiTaglio`), un agente che legge l'inizio
 *     deve sapere subito che non vede tutto;
 *   - la cartella è quella della SESSIONE (`session-store.mjs`, `cartellaPagineWebDi`), che si cancella con lei: Claude
 *     Code tiene i risultati salvati in `<progetto>/<sessione>/tool-results/` e li fa rileggere senza chiedere («Tool
 *     result files are allowed for reading», eseguibile 2.1.283);
 *   - una pagina minificata è spesso UNA riga sola: lì il taglio della testa non trova un a capo, e la chiamata esatta è
 *     `byteOffset` (la lettura dentro una riga lunga, decisione owner D1 «tutte e due» del 30/09).
 * ⛔ Il kernel è condiviso: senza cartella delle pagine (TALOS-BANCO, CLI, mobile) chi chiama resta su `uscitaUtile`, bit
 *   per bit come prima — vedi il ramo `naviga` in `talosHarness.mjs`.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** I caratteri della pagina che il modello vede, testa più coda (owner 01/10: «il limite resta 4000»). */
export const TETTO_PAGINA_WEB = 4_000
/** La parte della testa: tre quarti, come Hermes (`head_budget = int(char_limit * 0.75)`). */
export const QUOTA_TESTA_PAGINA_WEB = 0.75

/* Il nome del file: l'host leggibile più dieci cifre dell'impronta dell'indirizzo, come Hermes
   (`{_host_slug(url)}-{sha256(url)[:10]}`). Stesso indirizzo, stesso file: riaprire la pagina dà la STESSA uscita, byte per
   byte, e la cache del prompt del fornitore non si azzera. */
export function nomeDellaPaginaSalvata(url) {
    let host = ''
    try { host = new URL(String(url)).hostname.toLowerCase() } catch { /* un indirizzo illeggibile resta senza host */ }
    const leggibile = host.replace(/[^a-z0-9.-]+/gu, '-').replace(/^[-.]+|[-.]+$/gu, '').slice(0, 60) || 'pagina'
    return `${leggibile}-${createHash('sha256').update(String(url)).digest('hex').slice(0, 10)}.txt`
}

/* La copia intera nella cartella della sessione: percorso assoluto, o `null` se non si è potuta scrivere (il taglio si
   mostra lo stesso, e l'intestazione lo dice). Si scrive in un file temporaneo nuovo (`wx`) e lo si rinomina sopra quello
   dell'indirizzo: `rename` sostituisce anche un collegamento senza seguirlo, e chi legge non vede mai metà file. */
export async function salvaPaginaIntera(cartella, url, testo) {
    const finale = join(cartella, nomeDellaPaginaSalvata(url))
    const temporaneo = join(cartella, `.${randomUUID()}.tmp`)
    try {
        await mkdir(cartella, { recursive: true })
        await writeFile(temporaneo, testo, { encoding: 'utf8', flag: 'wx' })
        await rename(temporaneo, finale)
        return finale
    } catch {
        await rm(temporaneo, { force: true }).catch(() => {})
        return null
    }
}

/* Testa e coda sui confini di riga, come Hermes; e dove riprendere nel FILE: una riga (`offset`, base 1, come `leggi`) se
   la testa finisce a fine riga, altrimenti il byte esatto dopo la testa (`byteOffset`). */
export function testaECodaDellaPagina(testo, tetto = TETTO_PAGINA_WEB, quotaTesta = QUOTA_TESTA_PAGINA_WEB) {
    const parteTesta = Math.floor(tetto * quotaTesta)
    const parteCoda = tetto - parteTesta
    let testa = testo.slice(0, parteTesta)
    let coda = testo.slice(testo.length - parteCoda)
    const aCapoTesta = testa.lastIndexOf('\n')
    if (aCapoTesta > parteTesta * 0.5) testa = testa.slice(0, aCapoTesta)
    const aCapoCoda = coda.indexOf('\n')
    if (aCapoCoda >= 0 && aCapoCoda < parteCoda * 0.5) coda = coda.slice(aCapoCoda + 1)
    // ⛔ Un taglio non spezza mai una coppia di surrogati: mezzo carattere diventerebbe un «?» nella testa e un byteOffset
    //   che cade dentro un carattere, rifiutato da `leggi` (READ_INVALID_UTF8).
    if (/[\uD800-\uDBFF]$/u.test(testa)) testa = testa.slice(0, -1)
    if (/^[\uDC00-\uDFFF]/u.test(coda)) coda = coda.slice(1)
    const finisceARiga = testa.length === 0 || testo[testa.length] === '\n'
    return {
        testa, coda,
        riprendi: finisceARiga
            ? { offset: testa.length === 0 ? 1 : testa.split('\n').length + 1 }
            : { byteOffset: Buffer.byteLength(testa, 'utf8') },
    }
}

/* Ciò che il modello riceve: l'avviso in testa, poi la testa, un segno nel punto del taglio, la coda. */
export function paginaTagliataPerIlModello(testo, percorsoSalvato, { tetto = TETTO_PAGINA_WEB, quotaTesta = QUOTA_TESTA_PAGINA_WEB } = {}) {
    const { testa, coda, riprendi } = testaECodaDellaPagina(testo, tetto, quotaTesta)
    const misura = `[TALOS cut this page: ${testo.length} characters, showing ${testa.length} at the start and ${coda.length} at the end.`
    const come = typeof percorsoSalvato !== 'string'
        ? ' The full page could not be saved, so the omitted middle cannot be read: open a more specific address for it.]'
        : riprendi.offset !== undefined
            ? ` The full page is saved at "${percorsoSalvato}". Read the omitted middle with leggi percorso="${percorsoSalvato}" offset=${riprendi.offset}, and raise offset to page through it.]`
            : ` The full page is saved at "${percorsoSalvato}". Read the omitted middle with leggi percorso="${percorsoSalvato}" byteOffset=${riprendi.byteOffset}: the page is one very long line there, and leggi says where to continue.]`
    const tolti = testo.length - testa.length - coda.length
    return `${misura}${come}\n${testa}\n\n[… ${tolti} characters omitted here: see the note at the top …]\n\n${coda}`
}

/*
 * ⛔⛔ È UNA PAGINA CHE TALOS HA SALVATO PER QUESTA SESSIONE? — l'unico caso in cui `leggi` non chiede il permesso per
 *   un file in una cartella nascosta fuori dal progetto (la cartella delle sessioni lo è quasi sempre: `.sessions-store`).
 *   Claude Code fa lo stesso per `tool-results`, con un confronto sul prefisso del percorso. Qui è più stretto, perché
 *   un nome nella cartella non basta a dire CHE COSA c'è dietro:
 *   - il file è un file vero (`lstat`: un collegamento simbolico non lo è);
 *   - ha UN nome solo (`nlink === 1`): un collegamento fisico a `~/.ssh/id_rsa` messo lì dentro ne ha due;
 *   - sulla strada della cartella non c'è nessun collegamento (il suo percorso reale è quello dichiarato): se la cartella
 *     delle pagine fosse una giunzione verso `~/.ssh`, ogni file «dentro» sarebbe una chiave. È la regola di Claude Code,
 *     «tool-results path refused: a directory on the way is a link»;
 *   - e il file sta DIRETTAMENTE nella cartella: una sottocartella può essere una giunzione che porta altrove.
 *   ⇒ Con la cartella senza collegamenti e il file vero con un nome solo, il suo percorso reale È quello dichiarato:
 *     un `realpath` anche del file non aggiungerebbe niente (provato: il mutante che lo toglieva sopravviveva).
 *   Qualunque dubbio (cartella assente, errore di disco, un'unità mappata che `realpath` scrive diversa) ⇒ `false`, e
 *   `leggi` torna a chiedere come prima: sbagliare qui costa una domanda, mai una lettura.
 */
export async function eUnaPaginaSalvata(cartellaPagine, percorsoAssoluto) {
    if (typeof cartellaPagine !== 'string' || cartellaPagine === '') return false
    try {
        const info = await lstat(percorsoAssoluto)
        if (!info.isFile() || info.nlink !== 1) return false
        const cartella = resolve(cartellaPagine)
        const stesso = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
        return stesso(await realpath(cartella), cartella) && stesso(dirname(resolve(percorsoAssoluto)), cartella)
    } catch {
        return false
    }
}
