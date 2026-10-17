// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useTalosI18n } from '@/i18n'

/*
 * ⛔ I18N-TESTO (15/10/2026, owner «Spento solo dove serve»). `escapeParameter` resta acceso su tutta l'app (29/07), ma un testo
 * libero mostrato come TESTO ne usciva rovinato: «L'IVA» → «L&apos;IVA», «3/4» → «3&#x2F;4» (01/08, 06/08, 27/08, 15/10). Vue già
 * protegge testo e attributi; l'escape serve solo a ciò che finisce in `v-html`. `tTesto` lo spegne per la singola chiamata
 * (opzione ufficiale di vue-i18n 11, terzo argomento di `t`), e il cancello qui sotto tiene `tTesto` lontano da `v-html`.
 */
const SRC = resolve(__dirname, '..', '..', '..', 'src')
function file(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n)
        return statSync(p).isDirectory() ? file(p) : /\.(vue|ts)$/u.test(n) ? [p] : []
    })
}

describe('tTesto: il testo libero resta com’è', () => {
    it('I18N-TESTO-01 tTesto non cambia il parametro, t lo protegge come prima; il parametro passato non viene riscritto', () => {
        let risultato: { testo: string; protetto: string } | null = null
        const parametri = { title: `L'IVA di "marzo" 3/4 & co <b>` }
        mount(defineComponent({
            setup() {
                const { t, tTesto } = useTalosI18n()
                risultato = { testo: tTesto('harness.actionsFor', parametri), protetto: t('harness.actionsFor', { ...parametri }) }
                return () => h('div')
            },
        }))
        expect(risultato!.testo).toBe(`Actions for L'IVA di "marzo" 3/4 & co <b>`)
        expect(risultato!.protetto).toBe('Actions for L&apos;IVA di &quot;marzo&quot; 3&#x2F;4 &amp; co &lt;b&gt;')
        expect(parametri.title).toBe(`L'IVA di "marzo" 3/4 & co <b>`)
    })

    it('I18N-TESTO-02 cancello: v-html solo nel markdown dei messaggi, e mai in un file che usa tTesto', () => {
        const conVHtml = file(SRC).filter((p) => /\sv-html=/u.test(readFileSync(p, 'utf8'))).map((p) => relative(SRC, p).replace(/\\/gu, '/'))
        expect(conVHtml, 'un v-html nuovo va rivisto: il testo tradotto lì dentro deve restare protetto').toEqual(['components/chat/TalosMobileMessageContent.vue'])
        for (const p of conVHtml) expect(readFileSync(join(SRC, p), 'utf8')).not.toMatch(/\btTesto\b/u)
    })
})
