import { expect, test } from '@playwright/test'

/**
 * ⛔⛔⛔ UNA CSP SBAGLIATA NON DÀ ERRORE: TOGLIE PEZZI.
 *
 * Non fa fallire il build, non fa fallire un test unitario, non scrive niente in
 * rosso. Blocca uno script, o uno stile, o un worker — e l'app parte con una
 * parte in meno, che qualcuno scopre giorni dopo su un telefono.
 *
 * ⇒ L'unico modo di provarla è caricare l'app vera in un browser vero e
 * chiedergli se ha dovuto bloccare qualcosa. È la stessa idea per cui il test
 * dei redirect monta due server invece di guardare un flag.
 */

test.describe('la Content Security Policy', () => {
    test('⛔ non blocca niente di ciò che l\'app usa davvero', async ({ page }) => {
        const violazioni: string[] = []
        await page.addInitScript(() => {
            document.addEventListener('securitypolicyviolation', (evento) => {
                const e = evento as SecurityPolicyViolationEvent
                ;(window as unknown as { __csp: string[] }).__csp ??= []
                ;(window as unknown as { __csp: string[] }).__csp.push(
                    `${e.violatedDirective} ← ${e.blockedURI || '(inline)'}`,
                )
            })
        })
        const errori: string[] = []
        page.on('console', (m) => {
            if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errori.push(m.text())
        })

        await page.goto('/')
        // Si aspetta che l'app abbia davvero montato qualcosa, o si misurerebbe
        // una pagina vuota e si concluderebbe che va tutto bene.
        await expect(page.locator('body')).not.toBeEmpty()
        await page.waitForTimeout(2_000)

        violazioni.push(...await page.evaluate(
            () => (window as unknown as { __csp?: string[] }).__csp ?? [],
        ))

        expect(violazioni, `la CSP ha bloccato qualcosa che serve:\n${violazioni.join('\n')}`).toEqual([])
        expect(errori, `errori di CSP in console:\n${errori.join('\n')}`).toEqual([])
    })

    test('⭐ e la policy è davvero nella pagina, prima di tutto il resto', async ({ page }) => {
        await page.goto('/')
        const testa = await page.evaluate(() => {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
            const primi = [...document.head.children].slice(0, 6).map((n) => n.nodeName.toLowerCase())
            return { contenuto: meta?.getAttribute('content') ?? null, primi }
        })
        expect(testa.contenuto).toContain("script-src 'self'")
        expect(testa.contenuto).toContain("object-src 'none'")
        expect(testa.contenuto).toContain("base-uri 'none'")
        // ⛔ Il browser applica la policy da dove la incontra in poi: una riga di
        // ritardo è una riga non protetta.
        expect(testa.primi.slice(0, 3)).toContain('meta')
    })

    test('⛔⛔ e uno script iniettato NON esegue', async ({ page }) => {
        await page.goto('/')
        const eseguito = await page.evaluate(() => {
            const s = document.createElement('script')
            s.textContent = '(window as any).__eseguito = true'
            s.textContent = 'window.__eseguito = true'
            document.body.appendChild(s)
            return (window as unknown as { __eseguito?: boolean }).__eseguito === true
        })
        expect(eseguito).toBe(false)
        /*
         * ⛔ È la prova che la voce che conta MORDE. Senza, tutto il resto della
         * policy è decorazione: dentro questa WebView uno script iniettato non
         * ruba una sessione, usa il telefono.
         */
    })
})
