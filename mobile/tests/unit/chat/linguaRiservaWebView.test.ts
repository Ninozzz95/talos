import { afterEach, describe, expect, it, vi } from 'vitest'
import lingue from '../../fixtures/lingue-senza-nome-webview-android.json'

/**
 * LINGUA-07 (CHAT-140, LEDGER-CHAT-140-NOMI-DELLE-LINGUE-2026-10-28.md). L'ICU ridotto della WebView di Android (Chromium
 * `filters/android.json`) non sa nominare 34 lingue che il telefono riconosce o detta, pashto e uiguro compresi: misurato sul Pad,
 * `new Intl.DisplayNames(['en']).of('ps')` → undefined. La nota «reply in …» non nasceva, il `ps` di Android veniva buttato e
 * l'impostazione `ps-AF` tornava ad Automatica. La riserva dà gli STESSI nomi del desktop (CLDR 48): lo prova la parità in Node.
 */

const SENZA_NOME = new Set(lingue.senzaNome)

/** Un `Intl` come quello della WebView: per le lingue senza nome `DisplayNames.of` rende undefined (`fallback: 'none'`). */
function intlDellaWebView(): typeof Intl {
    const Vero = Intl.DisplayNames
    class DisplayNamesRidotto extends Vero {
        readonly #tipo: string
        constructor(locali: string | string[], opzioni: Intl.DisplayNamesOptions) {
            super(locali, opzioni)
            this.#tipo = opzioni.type
        }

        override of(codice: string): string | undefined {
            if (this.#tipo === 'language' && SENZA_NOME.has(codice.split('-')[0]!.toLowerCase())) return undefined
            return super.of(codice)
        }
    }
    return {
        getCanonicalLocales: Intl.getCanonicalLocales,
        Locale: Intl.Locale,
        DisplayNames: DisplayNamesRidotto,
        Collator: Intl.Collator,
        DateTimeFormat: Intl.DateTimeFormat,
        NumberFormat: Intl.NumberFormat,
        PluralRules: Intl.PluralRules,
        RelativeTimeFormat: Intl.RelativeTimeFormat,
        ListFormat: Intl.ListFormat,
        Segmenter: Intl.Segmenter,
        supportedValuesOf: Intl.supportedValuesOf,
    } as unknown as typeof Intl
}

async function conLaWebView() {
    vi.stubGlobal('Intl', intlDellaWebView())
    vi.resetModules()
    return import('@/lib/chat/linguaDelleRisposte')
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
})

describe('LINGUA-07 le lingue che la WebView non sa nominare', () => {
    it('LINGUA-07a la simulazione è fedele alla misura: ps senza nome, fa e hi-Latn sì', () => {
        const d = new (intlDellaWebView().DisplayNames)(['en'], { type: 'language', fallback: 'none' })
        expect(d.of('ps')).toBeUndefined()
        expect(d.of('ps-AF')).toBeUndefined()
        expect(d.of('fa')).toBe('Persian')
        expect(d.of('hi-Latn')).toBe('Hindi (Latin)')
    })

    it('LINGUA-07b pashto e uiguro hanno la loro nota', async () => {
        const { notaLinguaDelMessaggio } = await conLaWebView()
        expect(notaLinguaDelMessaggio({ lingua: 'auto', linguaDelMessaggio: 'ps' })).toBe("The person's last message is in Pashto: reply in Pashto.")
        expect(notaLinguaDelMessaggio({ lingua: 'auto', linguaDelMessaggio: 'ug' })).toBe("The person's last message is in Uyghur: reply in Uyghur.")
    })

    it('LINGUA-07c l\'impostazione ps-AF non torna ad Automatica', async () => {
        const { rigaLinguaDelleRisposte } = await conLaWebView()
        expect(rigaLinguaDelleRisposte({ lingua: 'ps-AF' })).toBe('Always reply in Pashto (Afghanistan), unless the person asks for another language.')
    })

    it('LINGUA-07d ogni lingua che Android riconosce ha un nome', async () => {
        const { nomeIngleseDellaLingua } = await conLaWebView()
        const senza = lingue.langid.filter((c) => !nomeIngleseDellaLingua(c))
        expect(senza).toEqual([])
    })

    it('LINGUA-07e le regole di sempre restano: codici inventati, speciali e regioni ignote valgono Automatica', async () => {
        const { nomeIngleseDellaLingua } = await conLaWebView()
        for (const c of ['xx', 'qaa', 'zz-nonsense', 'und', 'zxx', 'mul', 'mis', 'en-ZZ', 'ps-ZZ', 'auto', 'una frase qualsiasi']) {
            expect(nomeIngleseDellaLingua(c), c).toBeNull()
        }
    })

    it('LINGUA-07f la riserva dice le stesse parole del desktop (ICU completo di Node)', async () => {
        const { NOMI_INGLESI_DI_RISERVA } = await import('@/lib/chat/linguaDelleRisposte')
        const completo = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
        expect(Object.keys(NOMI_INGLESI_DI_RISERVA).sort()).toEqual([...SENZA_NOME].sort())
        for (const [c, nome] of Object.entries(NOMI_INGLESI_DI_RISERVA)) expect(nome, c).toBe(completo.of(c))
    })

    it('LINGUA-07g il pashto riconosciuto da Android non viene più buttato', async () => {
        vi.stubGlobal('Intl', intlDellaWebView())
        vi.resetModules()
        const { decidiLinguaDelTesto } = await import('@/services/linguaDelTesto')
        expect(decidiLinguaDelTesto('سلام! د ایټالیا پلازمېنه چېرته ده؟', { lingua: 'ps', confidenza: 0.9 })).toBe('ps')
    })
})
