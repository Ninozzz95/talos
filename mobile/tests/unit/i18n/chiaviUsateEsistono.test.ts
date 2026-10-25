import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/**
 * ⛔ I18N-USO-01 (D-MOCK-17, dal vivo vc184 foto 206, 24/10/2026): la scheda di un PC mostrava le chiavi grezze
 * `computer.notificationsTitle`, `computer.connection`, `computer.pcCode`: le frasi c'erano, ma sotto `harness:`. Il cancello:
 * ogni chiave LETTERALE passata a `t('…')`, `tTesto('…')` o `$t('…')` in `src/` (`.vue` e `.ts`) esiste, come frase, in inglese
 * E in italiano.
 *   · Le chiavi costruite a runtime (template string, concatenazioni, variabili) non sono letterali e si saltano da sé: la regola
 *     guarda solo una stringa fra apici subito dentro la parentesi.
 *   · Una chiave è un percorso con almeno un punto (`sezione.voce`): un `t('x')` senza punto non è del catalogo.
 */
const SRC = resolve(__dirname, '..', '..', '..', 'src')
const LOCALI = resolve(SRC, 'i18n', 'locales')

function file(radice: string): string[] {
    return readdirSync(radice, { withFileTypes: true }).flatMap((voce) => {
        const percorso = join(radice, voce.name)
        if (voce.isDirectory()) return percorso === LOCALI ? [] : file(percorso)
        return /\.(vue|ts)$/u.test(voce.name) && !voce.name.endsWith('.d.ts') ? [percorso] : []
    })
}

/** `t(`, `tTesto(` o `$t(` non preceduti da un carattere d'identificatore o da un punto, poi una stringa fra apici. */
const CHIAMATA = /(?<![\w$.])(?:t|tTesto|\$t)\(\s*(['"])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/gu

/** Eccezioni esplicite, con il perché: `file relativo a src` → chiavi. Vuota finché non serve. */
const ECCEZIONI: Readonly<Record<string, readonly string[]>> = Object.freeze({})

/**
 * I file il cui `t` è un dizionario del DESKTOP portato in casa, non il catalogo dell'app: chiavi e cancelli loro (i JSON in
 * `lib/harness/r4/testi/`). Lì si salta solo `t(`; `tTesto(` e `$t(` restano controllati. Elenco esplicito: un file che dichiara un
 * `t` per altro (`const t = Math.max(…)`, un istante, un testo) resta controllato come tutti.
 */
const DIZIONARI_DEL_DESKTOP: Readonly<Record<string, string>> = Object.freeze({
    'components/codice/TalosCodiceR4Pannello.vue': 'testoPannelloR4',
    'lib/harness/r4/doctorR4.ts': 'testoDoctorR4',
    'lib/harness/r4/automazioniR4.ts': 'testoAutomazioniR4',
    'lib/harness/r4/codaR4.ts': 'tabelle della coda',
    'lib/harness/r4/domandeR4.ts': 'testoDomandaR4',
    'lib/harness/r4/pannelloR4.ts': 'testoPannelloR4',
    'lib/harness/r4/permessiR4.ts': 'testoApprovazioneR4',
})
const T_PROPRIO = /(?:\bconst|\blet|\bfunction)\s+t\s*[=(<]/u

const frase = (catalogo: unknown, chiave: string) =>
    typeof chiave.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), catalogo) === 'string'

/**
 * Una chiave citata in un commento non è usata (`TalosMobileSchedaAzione.vue` racconta la chiave sbagliata di agosto in un commento
 * HTML). Si tolgono i commenti HTML, quelli a blocco e quelli su una riga intera, tenendo gli a capo: i numeri di riga restano veri.
 */
const senzaCommenti = (testo: string) => testo
    .replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//gu, (c) => c.replace(/[^\n]/gu, ' '))
    .replace(/^[ \t]*\/\/.*$/gmu, '')

describe('il catalogo copre ogni chiave usata (I18N-USO-01)', () => {
    it('I18N-USO-01 ogni chiave letterale di t/tTesto/$t in src esiste come frase in en E in it', () => {
        const mancanti: string[] = []
        const conTProprio: string[] = [] // file elencati che non hanno più il loro `t`
        let viste = 0
        for (const percorso of file(SRC)) {
            const rel = relative(SRC, percorso).replaceAll('\\', '/')
            const testo = senzaCommenti(readFileSync(percorso, 'utf8'))
            const tProprio = Object.hasOwn(DIZIONARI_DEL_DESKTOP, rel)
            // l'elenco non marcisce: un file elencato dichiara ancora il suo `t`
            if (tProprio && !T_PROPRIO.test(testo)) conTProprio.push(rel)
            for (const m of testo.matchAll(CHIAMATA)) {
                const chiave = m[2]!
                if (tProprio && m[0].startsWith('t(')) continue // solo `t(`: `$t(` e `tTesto(` restano
                viste += 1
                if (ECCEZIONI[rel]?.includes(chiave)) continue
                const riga = testo.slice(0, m.index).split('\n').length
                const senza = [frase(TALOS_EN_MESSAGES, chiave) ? '' : 'en', frase(TALOS_IT_MESSAGES, chiave) ? '' : 'it'].filter(Boolean)
                if (senza.length) mancanti.push(`${rel}:${riga} ${chiave} (manca in ${senza.join(' e ')})`)
            }
        }
        // il cancello guarda davvero: in src le chiavi letterali sono migliaia
        expect(viste).toBeGreaterThan(500)
        expect(conTProprio).toEqual([])
        expect(mancanti).toEqual([])
    })
})
