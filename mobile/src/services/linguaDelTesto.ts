/**
 * ⭐ LA LINGUA DI UN TESTO SCRITTO (owner 28/10/2026: «se parlo in persiano a Talos mi risponde in inglese, sia in voce che
 * scrivendolo»; `LTESTO-01..04`). Misurato sul Pad il 28/10: senza la nota che nomina la lingua, gemma in una chat lunga in italiano
 * ha risposto in italiano a una domanda in persiano, e granite in inglese a una in italiano.
 *
 * Chiede ad Android (`TalosLinguaPlugin`, `TextClassifier.detectLanguage`: del sistema, sul dispositivo, senza termini nuovi). Qui
 * le regole, in un posto solo. Sono quelle del desktop, portate IDENTICHE (regola delle tre app, 28/10), da
 * `harness-ui/src/lingua-del-testo.mjs`: `6e404535f` (la pulizia, almeno 6 lettere, persiano e cirillico dalle loro lettere),
 * `6f2fb48a6` (RIV14B-L1: le citazioni e la cornice prima dei due punti) e `af8ac4173` (i due punti di indirizzi, percorsi, orari e
 * codice non fanno cornice). Cambia solo il riconoscitore: al posto di ELD, Android con confidenza almeno 0,5 e un codice che `Intl`
 * conosce.
 * Misura sul Pad, 114 frasi: sbagliate da 16 a 6, nessuna giusta persa (`.claude/ragionamento/corpus-lingua-2026-10-28/misura-l1.txt`).
 * Un errore o una risposta oltre il tetto non fermano l'invio: rendono `null` (vale la riga Automatica).
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { nomeIngleseDellaLingua } from '@/lib/chat/linguaDelleRisposte'

export interface TalosLinguaPonte {
    identifica(opzioni: { testo: string }): Promise<{ lingua?: string | null, confidenza?: number } | unknown>
}

type EsitoDiAndroid = { lingua?: unknown, confidenza?: unknown } | null

const CONFIDENZA_MINIMA = 0.5
const LETTERE_MINIME = 6
const TETTO_DI_SERIE_MS = 400

/* dal desktop, identiche */
const LETTERE_PERSIANE = /[پچژگیک]/u
const LETTERE_URDU = /[ھہےٹڈڑ]/u
/* il curdo sorani scrive con le stesse lettere persiane, più queste sue: lì decide il riconoscitore */
const LETTERE_CURDE = /[ڕڵۆێە]/u
const ALFABETO_ARABO = /[؀-ۿ]/u
const LETTERE_SOLO_ARABE = /[ةيكى]/u
const LETTERE_PASHTO = /[ټډړږښځڅۍېګڼ]/u
const QUOTA_ALFABETO = 0.6
/* un gettone di codice: separatori da percorso o da sintassi, `a.b`, camelCase, o tutto MAIUSCOLO da errore (ERESOLVE, ERR_X) */
const GETTONE_DI_CODICE = /[/\\_<>{}[\]=();:]|\w\.\w|\p{Ll}\p{Lu}|^[\p{Lu}0-9_]{2,}$/u
const BORDI = /^[(\[«"'“‘]+|[)\]»"'”’.,;:!?]+$/gu
const ALFABETO_CIRILLICO = /[Ѐ-ӿ]/u
const LETTERE_UCRAINE = /[іїєґІЇЄҐ]/u
const LETTERE_SERBE = /[ђћџљњјЂЋЏЉЊЈ]/u
const LETTERE_RUSSE = /[ыэёЫЭЁ]/u
const LETTERE_BULGARE = /[ъЪ]/u
/* RIV14B-L1: un passo CITATO («…», "…", “…”) non è la voce di chi scrive */
const CITAZIONI = /«[^»]*»|"[^"\n]*"|“[^”]*”/gu

const lettere = (testo: string): number => (testo.match(/\p{L}/gu) ?? []).length
function quota(testo: string, alfabeto: RegExp): number {
    const n = lettere(testo)
    return n === 0 ? 0 : (testo.match(new RegExp(alfabeto.source, 'gu')) ?? []).length / n
}
function linguaCirillica(testo: string): string | null {
    const ucraino = LETTERE_UCRAINE.test(testo), serbo = LETTERE_SERBE.test(testo), russo = LETTERE_RUSSE.test(testo)
    if (ucraino && !serbo && !russo) return 'uk'
    if (serbo && !ucraino && !russo) return 'sr'
    if (russo && !ucraino && !serbo) return 'ru'
    if (LETTERE_BULGARE.test(testo) && !ucraino && !serbo && !russo) return 'bg'
    return null
}

/** Il testo senza blocchi di codice, codice in linea e indirizzi: i loro due punti non sono la voce di nessuno. */
function senzaCodiceNeIndirizzi(testo: string): string {
    return String(testo ?? '')
        .replace(/```[\s\S]*?(```|$)/gu, ' ')
        .replace(/`[^`\n]*`/gu, ' ')
        .replace(/\bhttps?:\/\/\S+/giu, ' ')
}

/** Il testo che conta per la lingua: senza blocchi di codice, codice in linea, indirizzi e righe di stack. */
export function testoDaRiconoscere(testo: string): string {
    return senzaCodiceNeIndirizzi(testo)
        .replace(/^\s*at .*$/gmu, ' ')
        .split(/\s+/u).filter((g) => g && !GETTONE_DI_CODICE.test(g.replace(BORDI, ''))).join(' ')
        .replace(/\s+/gu, ' ')
        .trim()
}

/** La decisione su un testo già ripulito, con la risposta di Android (pura, per le prove). `esito` null: solo le lettere decidono. */
export function decidiLinguaDelTesto(testo: string, esito: EsitoDiAndroid): string | null {
    if (lettere(testo) < LETTERE_MINIME) return null
    if (quota(testo, ALFABETO_ARABO) >= QUOTA_ALFABETO && LETTERE_PERSIANE.test(testo) && !LETTERE_URDU.test(testo) && !LETTERE_CURDE.test(testo)
        && !LETTERE_SOLO_ARABE.test(testo) && !LETTERE_PASHTO.test(testo)) return 'fa'
    if (quota(testo, ALFABETO_CIRILLICO) >= QUOTA_ALFABETO) { const cirillica = linguaCirillica(testo); if (cirillica) return cirillica }
    const lingua = typeof esito?.lingua === 'string' ? esito.lingua : null
    const confidenza = typeof esito?.confidenza === 'number' ? esito.confidenza : 0
    if (!lingua || confidenza < CONFIDENZA_MINIMA || !nomeIngleseDellaLingua(lingua)) return null
    return lingua
}

/** Le lettere decidono da sole (persiano, cirillico): Android non serve. */
const decideLAlfabeto = (testo: string): boolean => decidiLinguaDelTesto(testo, null) !== null

let ponte: TalosLinguaPonte | null = null

export async function identificaLinguaDelTesto(
    testo: string,
    { plugin, nativo, tettoMs = TETTO_DI_SERIE_MS }: { plugin?: TalosLinguaPonte, nativo?: boolean, tettoMs?: number } = {},
): Promise<string | null> {
    const senzaCitazioni = String(testo ?? '').replace(CITAZIONI, ' ')
    const pulito = testoDaRiconoscere(senzaCitazioni)
    if (lettere(pulito) < LETTERE_MINIME) return null
    if (!(nativo ?? Capacitor.isNativePlatform())) return null
    const p = plugin ?? (ponte ??= registerPlugin<TalosLinguaPonte>('TalosLingua'))
    const chiedi = async (t: string): Promise<EsitoDiAndroid> => {
        if (decideLAlfabeto(t)) return null
        let tetto: ReturnType<typeof setTimeout> | null = null
        try {
            return await Promise.race([
                p.identifica({ testo: t }),
                new Promise<null>((ok) => { tetto = setTimeout(() => ok(null), tettoMs) }),
            ]) as EsitoDiAndroid
        } catch {
            return null
        } finally {
            if (tetto !== null) clearTimeout(tetto)
        }
    }
    const tutto = decidiLinguaDelTesto(pulito, await chiedi(pulito))
    /* …e la cornice prima dei primi due punti («il build dice: …», «traduci: …») è la voce della persona: se ha abbastanza lettere e
       dice un'altra lingua, quello che segue è incollato ⇒ nessuna nota (come il desktop: decisione intera, se no l'etichetta grezza) */
    /* desktop `af8ac4173` (RIV14B-L1d, dalla segnalazione del Mobile): i due punti di un indirizzo, di un percorso (C:\) o di un orario
       (12:30), o dentro il codice, non chiudono una cornice; contano solo quelli fuori da codice e indirizzi, seguiti da uno spazio o dalla fine */
    const perLaCornice = senzaCodiceNeIndirizzi(senzaCitazioni)
    const duePunti = perLaCornice.search(/:(?=\s|$)/u)
    if (tutto && duePunti > 0) {
        const cornice = testoDaRiconoscere(perLaCornice.slice(0, duePunti))
        if (lettere(cornice) >= LETTERE_MINIME) {
            const esito = await chiedi(cornice)
            const grezza = typeof esito?.lingua === 'string' ? esito.lingua : null
            if ((decidiLinguaDelTesto(cornice, esito) ?? grezza) !== tutto) return null
        }
    }
    return tutto
}
