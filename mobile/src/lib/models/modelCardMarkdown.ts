/**
 * Il README di un modello, preparato per essere LETTO invece che mostrato.
 *
 * Owner 2026-08-06, provando sul dispositivo: «scheda modello in Markdown
 * grezzo». La scheda arrivava dentro un `<pre>`, quindi cancelletti, asterischi
 * e tabelle a barre verticali, esattamente come stanno nel file.
 *
 * La pipeline per renderla esiste già ed è quella della chat — markdown-it con
 * `html: false` e DOMPurify con una lista di tag molto stretta. Qui non se ne
 * costruisce una seconda: si prepara la SORGENTE, perché un README del Hub non è
 * un messaggio, e porta tre cose che un messaggio non ha.
 *
 * ## 1. Il frontmatter YAML
 *
 * Ogni scheda del Hub comincia con un blocco `---` di metadati: licenza, lingue,
 * tag, `pipeline_tag`. Serve al Hub per indicizzare, non a chi legge. Lasciato lì
 * diventa una riga orizzontale, un paragrafo di `chiave: valore` e un'altra riga
 * orizzontale, prima ancora del titolo. Autore e licenza li mostriamo già come
 * etichette in cima alla scheda: qui sarebbero la stessa cosa detta peggio.
 *
 * ## 2. L'HTML dei badge
 *
 * Le schede del Hub usano HTML crudo — `<div align="center">`, `<img>`, `<a>`,
 * `<br>`. Con `html: false` markdown-it non lo interpreta: lo **mostra come
 * testo**, e chi legge si trova `<div align="center">` scritto sulla pagina.
 * Peggio del grezzo che stiamo togliendo. Si rimuove alla sorgente.
 *
 * ⛔ Ma **mai dentro un blocco di codice**: le schede dei modelli sono piene di
 * template di chat, e `<|im_start|>`, `<s>[INST]`, `<think>` sono proprio ciò che
 * si va a copiare da lì. Toglierli sarebbe rompere l'unica parte della scheda
 * che si usa davvero. Per questo lo scanner qui sotto conosce i fence e gli
 * apici, e non tocca niente che stia dentro.
 *
 * ## 3. I badge come immagini
 *
 * In chat un'immagine omessa lascia un segno («immagine esterna omessa: …»),
 * perché lì è contenuto che il modello ha scelto di mostrare. In una scheda le
 * immagini sono la carta intestata: sei scudetti di shields.io in fila
 * diventerebbero sei righe di segnaposto. Qui spariscono, insieme al link che le
 * avvolge quando resta vuoto.
 *
 * Quello che NON si fa qui è sanificare: la sicurezza resta dove stava, cioè
 * nella lista di tag ammessi di DOMPurify a valle. Questo modulo migliora la
 * lettura, non è la barriera — e se domani qualcuno lo saltasse, il risultato
 * sarebbe brutto, non pericoloso.
 */

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/
const HTML_COMMENT = /<!--[\s\S]*?-->/g
/**
 * Una forma di tag HTML VERA: apre con una lettera. `<|im_start|>` comincia con
 * una barra verticale e non entra qui, che è tutto il punto.
 */
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g
const HTML_BREAK = /<br\s*\/?>/gi
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g
const EMPTY_LINK = /\[\s*\]\([^)\s]*(?:\s+"[^"]*")?\)/g
const HUGGING_FACE_IMAGE = /(?:<img\b[^>]*>|&lt;img\b[\s\S]*?&gt;)/gi
/** Un fence: tre o più backtick o tilde, con al più tre spazi di rientro. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
/** Le sequenze fra apici: `codice`, ``con un apice dentro``. */
const INLINE_CODE = /(`+)(?:[\s\S]*?[^`])?\1(?!`)/g

/**
 * Il frontmatter tolto, una volta sola e per tutti.
 *
 * Lo usa anche il riassunto sotto il nome del modello: se le due funzioni
 * dessero risposte diverse su cosa sia «l'inizio del testo», il riassunto e la
 * scheda mostrerebbero due modelli diversi dello stesso modello.
 */
export function talosStripReadmeFrontmatter(readme: string): string {
    return readme.replace(FRONTMATTER, '')
}

function pulisciTesto(testo: string): string {
    return testo
        .replace(MARKDOWN_IMAGE, (match, _alt: string, url: string) => {
            try {
                return new URL(url, 'https://huggingface.co').hostname.endsWith('shields.io') ? '' : match
            } catch {
                return match
            }
        })
        .replace(EMPTY_LINK, '')
        .replace(HTML_BREAK, '  \n')
        .replace(HTML_TAG, '')
}

function conservaImmagineHuggingFace(testo: string): string {
    return testo.replace(HUGGING_FACE_IMAGE, (tag) => {
        const normalized = tag
            .replace(/^&lt;/i, '<')
            .replace(/&gt;$/i, '>')
            .replace(/&quot;/gi, '"')
        const source = /\bsrc\s*=\s*["'](https:\/\/cdn-uploads\.huggingface\.co\/[^"']+)["']/i.exec(normalized)?.[1]
        if (!source) return ''
        const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(normalized)?.[1] ?? ''
        return `![${alt}](${source})`
    })
}

/**
 * Una riga fuori dai fence, ripulita — tranne le parti fra apici.
 *
 * Il taglio è per sequenza, non per riga intera: `usa <think> per ragionare`
 * deve perdere il tag, `` usa `<think>` per ragionare `` deve tenerlo, e le due
 * frasi possono stare sulla stessa riga.
 */
function pulisciRiga(riga: string): string {
    let risultato = ''
    let ultimo = 0
    INLINE_CODE.lastIndex = 0
    for (let trovato = INLINE_CODE.exec(riga); trovato; trovato = INLINE_CODE.exec(riga)) {
        risultato += pulisciTesto(conservaImmagineHuggingFace(riga.slice(ultimo, trovato.index))) + trovato[0]
        ultimo = trovato.index + trovato[0].length
    }
    risultato += pulisciTesto(conservaImmagineHuggingFace(riga.slice(ultimo)))

    /**
     * ⛔ Il rientro dell'HTML non è il rientro del Markdown.
     *
     * MISURATO sul Pad, guardando la scheda di `unsloth/Qwen3-4B-GGUF`: due
     * paragrafi comparivano in monospaziato dentro un riquadro, come se fossero
     * codice. Nel README stanno dentro un `<div>` e sono rientrati di quattro
     * spazi perché così si scrive l'HTML. Tolto il tag, restava il rientro — e
     * quattro spazi in Markdown vogliono dire «blocco di codice».
     *
     * Il rientro si toglie SOLO quando la riga cominciava con un tag: allora
     * quegli spazi erano impaginazione HTML e non hanno mai significato niente.
     * Una riga rientrata che comincia con del testo, invece, sta continuando un
     * elenco o è codice davvero, e non si tocca.
     */
    return /^\s*</.test(riga) ? risultato.replace(/^\s+/, '') : risultato
}

export function talosModelCardMarkdown(readme: string): string {
    if (typeof readme !== 'string' || readme.trim() === '') return ''
    // I commenti possono attraversare le righe, quindi vanno via prima che il
    // testo diventi un elenco di righe — ma solo fuori dai fence, e per questo
    // il taglio avviene riga per riga sotto. Qui si tolgono quelli su una riga
    // sola; quelli su più righe li chiude il ciclo.
    const righe = talosStripReadmeFrontmatter(readme).split('\n')
    const risultato: string[] = []
    let fenceAperto: string | null = null
    let dentroCommento = false
    let immagineAperta: string | null = null

    for (const riga of righe) {
        const fence = FENCE.exec(riga)
        if (fenceAperto !== null) {
            risultato.push(riga)
            // Si chiude solo con lo stesso carattere e almeno la stessa
            // lunghezza: ``` dentro un blocco ````…```` non lo chiude.
            if (fence && fence[1]![0] === fenceAperto[0] && fence[1]!.length >= fenceAperto.length && fence[2]!.trim() === '') {
                fenceAperto = null
            }
            continue
        }
        if (fence && !dentroCommento) {
            fenceAperto = fence[1]!
            risultato.push(riga)
            continue
        }

        let testo = riga
        if (immagineAperta !== null) {
            immagineAperta += `\n${testo}`
            if (!/(?:\/\s*(?:>|&gt;)|(?:>|&gt;))/i.test(testo)) continue
            testo = immagineAperta
            immagineAperta = null
        } else {
            const inizioImmagine = /(?:<img\b|&lt;img\b)/i.exec(testo)?.index
            if (inizioImmagine !== undefined
                && !/(?:\/\s*(?:>|&gt;)|(?:>|&gt;))/i.test(testo.slice(inizioImmagine))) {
                immagineAperta = testo
                continue
            }
        }
        if (dentroCommento) {
            const fine = testo.indexOf('-->')
            if (fine < 0) continue
            testo = testo.slice(fine + 3)
            dentroCommento = false
        }
        testo = testo.replace(HTML_COMMENT, '')
        const apertura = testo.indexOf('<!--')
        if (apertura >= 0) {
            dentroCommento = true
            testo = testo.slice(0, apertura)
        }
        risultato.push(pulisciRiga(testo))
    }

    // Un tag troncato non diventa HTML attivo: resta testo leggibile e inerte.
    if (immagineAperta !== null) risultato.push(pulisciRiga(immagineAperta))

    // Tre righe vuote di fila non aggiungono niente, e dopo aver tolto badge e
    // `<div>` ne restano parecchie.
    return risultato.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
