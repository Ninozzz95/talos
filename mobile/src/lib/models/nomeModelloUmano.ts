/**
 * Il nome breve di un modello, per la pillola del compositore (owner 28/10/2026: «il logo provider e SOLO il nome del modello, non il
 * nome del provider + il modello»). Porta IDENTICA di `nomeModelloUmano`/`nomeDaTarga`/`NOMI_GENERICI` del desktop
 * (`harness-ui/frontend/src/components/chat-foot.js:228-278`, regola concordata col Desktop il 28/10): stesse espressioni, stesse
 * eccezioni, così le tre app dicono lo stesso nome. Unica differenza: sul telefono il file di un modello locale lo dà il profilo
 * (`model` è il percorso), non un catalogo da registrare. Il «(N attivi)» dei modelli a esperti arriva tradotto da chi chiama.
 */

export type TalosAttiviDi = (totali: string, attivi: string) => string

/* Revisione blocco 9 del desktop (G-R1): i nomi dati dagli strumenti di conversione non dicono il modello. */
const NOMI_GENERICI = /^(?:ggml\s*|mmproj\s*)?(?:model|modello|gguf|ggml|weights|download|scaricato|unsloth|converted|output|mmproj)(?:\s*\(\d+\))?$|^\s*\(\d+\)\s*$/iu

/** Il nome leggibile da una targa (l'id del catalogo, o il nome del file senza estensione). `conAutore`: il primo pezzo è chi pubblica. */
function nomeDaTarga(resto: string, conAutore: boolean, attivi: TalosAttiviDi): { pulito: string, testo: string } {
    const quant = /(?:^|[-_.])(IQ\d\w*|Q\d(?:[-_]\d)?(?:[-_][A-Z]+)*|B?F(?:16|32))(?=[-_.]|$)/i.exec(resto)
    // A10-9: nelle targhe il punto decimale diventa un trattino; solo davanti a uno ZERO il trattino è una virgola
    const parametri = /(?:^|[-_])((?:0[-_]\d+|\d+(?:[.,]\d+)?)B)(?:[-_]A((?:0[-_]\d+|\d+(?:[.,]\d+)?)B))?(?=[-_]|$)/i.exec(resto)
    const totali = parametri?.[1]?.replace(/^0[-_]/u, '0.') ?? null
    const attiviB = parametri?.[2]?.replace(/^0[-_]/u, '0.') ?? null
    // il nome finisce dove comincia la taglia O la quantizzazione, la prima delle due
    const fine = Math.min(parametri ? parametri.index : Infinity, quant ? quant.index : Infinity)
    let nome = Number.isFinite(fine) ? resto.slice(0, fine) : resto
    nome = nome.replace(/[-_](GGUF|MLX|AWQ|GPTQ)$/i, '')
    const pezzi = nome.split(/[-_]/).filter(Boolean)
    if (pezzi.length > 1 && conAutore) pezzi.shift()
    const pulito = pezzi.join(' ').replace(/\s+/g, ' ').trim()
    const parti = [pulito || (parametri || quant ? '' : resto)]
    if (totali) parti.push(attiviB ? attivi(totali, attiviB.replace(/^A/i, '')) : totali)
    if (quant) parti.push(quant[1]!.toUpperCase().replace(/-/g, '_'))
    return { pulito, testo: parti.filter(Boolean).join(' · ') }
}

/** Il nome breve da un id di modello. Per un locale, `file` (il nome del file .gguf) vince sull'id quando sa dire il modello. */
export function talosNomeModelloUmano(id: string, { attivi, file = null }: { attivi: TalosAttiviDi, file?: string | null }): string {
    if (typeof id !== 'string' || !id.trim()) return ''
    const grezzo = id.trim()
    if (!/^local:/i.test(grezzo)) {
        // il prefisso `fornitore:` è instradamento: regola di FORMA (un nome semplice senza barre prima dei due punti)
        const senzaFonte = grezzo.replace(/^[a-z][a-z0-9-]*:(?=.)/u, '')
        return senzaFonte.replace(/^~/u, '').split('/').pop() ?? senzaFonte
    }
    if (file) {
        const dalFile = nomeDaTarga(file.replace(/\.gguf$/i, '').replace(/-\d{5}-of-\d{5}$/i, ''), false, attivi)
        if (dalFile.pulito && !NOMI_GENERICI.test(dalFile.pulito)) return dalFile.testo
    }
    return nomeDaTarga(grezzo.replace(/^local:/i, '').replace(/[-_.]gguf$/i, ''), true, attivi).testo
}

/**
 * Il nome breve di un profilo del telefono. Locale: dal FILE del percorso; se il file ha un nome generico, dalla cartella del
 * repository (`…/models/<editore>/<repo>/<revisione>/<file>`), che sul telefono fa da id. Il resto: dal `model`. Mai vuoto: in
 * mancanza di tutto resta il `display_name`.
 */
export function talosNomeBreveDelProfilo(
    profilo: { provider: string, model: string, display_name: string },
    attivi: TalosAttiviDi,
): string {
    if (profilo.provider === 'local') {
        const pezzi = (profilo.model ?? '').split(/[\\/]/u).filter(Boolean)
        const file = pezzi[pezzi.length - 1] ?? ''
        const cartella = pezzi.length >= 3 ? pezzi[pezzi.length - 3]! : ''
        if (/\.gguf$/i.test(file)) {
            const dalFile = nomeDaTarga(file.replace(/\.gguf$/i, '').replace(/-\d{5}-of-\d{5}$/i, ''), false, attivi)
            if (dalFile.pulito && !NOMI_GENERICI.test(dalFile.pulito)) return dalFile.testo
            // il file non sa il modello: la cartella del repo, senza l'editore (è già un pezzo a parte del percorso)
            if (cartella) return nomeDaTarga(cartella.replace(/[-_.]gguf$/i, ''), false, attivi).testo || profilo.display_name
        }
        return profilo.display_name
    }
    return talosNomeModelloUmano(profilo.model ?? '', { attivi }) || profilo.display_name
}

/** Per la pillola: lo stesso nome breve, col «(N attivi)» detto dalla chiave `chat.modelActiveOf` (qui, fuori dal chunk dell'avvio). */
export function talosNomeBreveTradotto(
    profilo: { provider: string, model: string, display_name: string },
    t: (chiave: string, valori: Record<string, string>) => string,
): string {
    return talosNomeBreveDelProfilo(profilo, (totali, attivi) => t('chat.modelActiveOf', { totali, attivi }))
}
