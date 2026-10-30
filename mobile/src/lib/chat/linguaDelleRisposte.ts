/**
 * ⭐ LA LINGUA DELLE RISPOSTE (owner 28/10/2026: «se parlo in persiano a Talos mi risponde in inglese, sia in voce che scrivendolo»;
 * decisione «come scrivi o parli» + impostazione «Lingua», su CLI, desktop e mobile — «le modifiche i fix devono essere sempre
 * allineati su tutte e tre le app»). Le frasi sono quelle del nucleo r4 (`harness-ui/src/kernel/talosHarness.mjs` 3269fb01b,
 * `rigaLinguaDelleRisposte` e `notaLinguaDelMessaggio`), parola per parola: una regola sola per le tre app (`linguaDelleRisposte.test.ts`).
 *
 * · La RIGA dipende solo dall'impostazione: identica per tutta la conversazione, o la cache del prefisso si rompe a ogni giro.
 * · La NOTA dice la lingua del messaggio quando il dispositivo la sa (la dettatura, il riconoscitore sul testo) e solo quando cambia:
 *   sta sul messaggio a cui si riferisce, sempre uguale, così un turno già mandato non si riscrive (PREFISSO-STABILE-01).
 * · Un codice si traduce nel nome inglese della lingua (`Intl.DisplayNames`): testo libero dalle impostazioni non entra nel prompt.
 */

export const INIZIO_RIGA_LINGUA = 'Always reply in '
/** La chiave dei metadati con la lingua di un messaggio della persona (codice BCP 47), scritta all'invio. */
export const TALOS_METADATA_LINGUA_DEL_MESSAGGIO = 'lingua_del_messaggio'
export const INIZIO_NOTA_LINGUA_DEL_MESSAGGIO = "The person's last message is in "
const LINGUE_DELL_INTERFACCIA: Readonly<Record<string, string>> = Object.freeze({ en: 'English', it: 'Italian' })

const CODICI_SPECIALI = new Set(['zxx', 'mul', 'und', 'mis'])
let nomi: Intl.DisplayNames | null = null

/**
 * CHAT-140 (28/10/2026): le lingue che il telefono riconosce o detta e che l'ICU RIDOTTO della WebView non sa nominare (Chromium
 * `filters/android.json`, a0ea93436c52, circa 85 lingue). Misurato sul Pad (WebView 157): `ps`, `ug`, `be`, `cy`, `mi`, `ps-AF` senza
 * nome. Sono i 33 codici di AOSP `lang_id.model` (uguale da Android 15 a 17) fuori da quella lista, più `ug` dalla dettatura. Nomi di
 * CLDR 48, cioè le stesse parole del desktop con l'ICU completo: lo prova la parità in `linguaRiservaWebView.test.ts`.
 */
export const NOMI_INGLESI_DI_RISERVA: Readonly<Record<string, string>> = Object.freeze({
    be: 'Belarusian', bs: 'Bosnian', ceb: 'Cebuano', co: 'Corsican', cy: 'Welsh', eo: 'Esperanto', fy: 'Western Frisian',
    ga: 'Irish', gd: 'Scottish Gaelic', ha: 'Hausa', haw: 'Hawaiian', hmn: 'Hmong', ht: 'Haitian Creole', ig: 'Igbo',
    jv: 'Javanese', ku: 'Kurdish', la: 'Latin', lb: 'Luxembourgish', mg: 'Malagasy', mi: 'Māori', mt: 'Maltese',
    ny: 'Nyanja', ps: 'Pashto', sd: 'Sindhi', sm: 'Samoan', sn: 'Shona', so: 'Somali', st: 'Southern Sotho',
    su: 'Sundanese', tg: 'Tajik', ug: 'Uyghur', xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba',
})

// in cache come `nomi`: costruire un DisplayNames a ogni messaggio costa (nota del Desktop, 29/10)
const nomiDiScriptERegione: Partial<Record<'script' | 'region', Intl.DisplayNames>> = {}
/** Il nome dalla riserva, nel formato di ICU («Pashto (Afghanistan)»); `null` se la lingua non c'è o script e regione non hanno nome. */
function nomeDiRiserva(canonico: string): string | null {
    let locale: Intl.Locale
    try { locale = new Intl.Locale(canonico) } catch { return null }
    const base = Object.hasOwn(NOMI_INGLESI_DI_RISERVA, locale.language) ? NOMI_INGLESI_DI_RISERVA[locale.language] : undefined
    // varianti ed estensioni: la riserva non le sa dire, meglio Automatica che un nome a metà
    if (!base || canonico.toLowerCase() !== [locale.language, locale.script, locale.region].filter(Boolean).join('-').toLowerCase()) return null
    const parti: string[] = []
    for (const [tipo, codice] of [['script', locale.script], ['region', locale.region]] as const) {
        if (!codice) continue
        let nome: string | undefined
        try { nome = (nomiDiScriptERegione[tipo] ??= new Intl.DisplayNames(['en'], { type: tipo, fallback: 'none' })).of(codice) } catch { return null }
        if (!nome || nome === codice) return null
        parti.push(nome)
    }
    return parti.length ? `${base} (${parti.join(', ')})` : base
}
/** Il nome inglese di un codice BCP 47; `null` per Automatica, un codice storto o una lingua che `Intl` non conosce. */
export function nomeIngleseDellaLingua(codice: unknown): string | null {
    if (typeof codice !== 'string') return null
    const pulito = codice.trim()
    if (!pulito || pulito.toLowerCase() === 'auto') return null
    // nucleo r4 b32dfadb8: i codici speciali (nessun contenuto, più lingue, indeterminata, mancante) non sono una lingua
    if (CODICI_SPECIALI.has(pulito.toLowerCase())) return null
    let canonico: string | undefined
    try { [canonico] = Intl.getCanonicalLocales(pulito) } catch { return null }
    if (!canonico) return null
    // `fallback: 'none'`: un codice ben formato ma inventato (es. «zz-nonsense») non diventa «zz (NONSENSE)» nel prompt
    nomi ??= new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
    let nome: string | undefined
    try { nome = nomi.of(canonico) } catch { return null }
    // CHAT-140: solo quando `Intl` tace (l'ICU ridotto della WebView); le regole qui sotto valgono anche per la riserva
    if (!nome || nome === canonico) nome = nomeDiRiserva(canonico) ?? undefined
    // `of` rende il codice stesso quando non conosce la lingua (es. «xx»): allora non è una lingua, e vale Automatica; e anche con
    // 'none' una regione sconosciuta passa («en-ZZ» → «English (Unknown Region)»): un nome con «Unknown» vale Automatica (nucleo r4)
    return nome && nome !== canonico && !nome.includes('Unknown') ? nome : null
}

export function rigaLinguaDelleRisposte({ lingua = null, linguaInterfaccia = null }: { lingua?: string | null, linguaInterfaccia?: string | null } = {}): string {
    const scelta = nomeIngleseDellaLingua(lingua)
    if (scelta) return `${INIZIO_RIGA_LINGUA}${scelta}, unless the person asks for another language.`
    const ripiego = linguaInterfaccia && Object.hasOwn(LINGUE_DELL_INTERFACCIA, linguaInterfaccia) ? LINGUE_DELL_INTERFACCIA[linguaInterfaccia] : null
    // ⛔ la coda «even when…» è la cura del 15/08 (tone.ts): le memorie e gli attrezzi in italiano facevano dedurre l'italiano
    return `${INIZIO_RIGA_LINGUA}the same language the person writes or speaks in, even when documents, memory or tool output are in another language, unless they ask for another one.`
        + (ripiego ? ` If you cannot tell which language that is, reply in ${ripiego}.` : '')
}

/**
 * La nota sulla lingua del messaggio di QUESTO giro: solo in Automatica e solo se la lingua si sa. Imperativa (misurato sul Pad il
 * 28/10: la forma descrittiva non bastava a gemma in una chat lunga in italiano, né a granite), e ridetta a ogni messaggio: non resta
 * nella storia (nucleo r4 909973667 e b32dfadb8). `null`: niente nota.
 */
export function notaLinguaDelMessaggio({ lingua = null, linguaDelMessaggio = null }: {
    lingua?: string | null
    linguaDelMessaggio?: string | null
}): string | null {
    if (nomeIngleseDellaLingua(lingua)) return null // una lingua scelta comanda: la nota non serve
    const nome = nomeIngleseDellaLingua(linguaDelMessaggio)
    return nome ? `${INIZIO_NOTA_LINGUA_DEL_MESSAGGIO}${nome}: reply in ${nome}.` : null
}

/**
 * La lingua da NOMINARE dove serve un nome (il promemoria dopo i dati degli attrezzi, LINGUA-DOPO-IL-TOOL-01): quella scelta; in
 * Automatica quella del messaggio, se il dispositivo la sa; se no la lingua dell'interfaccia, il ripiego della riga del nucleo.
 */
export function linguaDelPromemoria({ lingua = null, linguaDelMessaggio = null, linguaInterfaccia = null }: {
    lingua?: string | null
    linguaDelMessaggio?: string | null
    linguaInterfaccia?: string | null
}): string | null {
    if (nomeIngleseDellaLingua(lingua)) return lingua!.trim()
    if (nomeIngleseDellaLingua(linguaDelMessaggio)) return linguaDelMessaggio!.trim()
    return linguaInterfaccia ?? null
}
