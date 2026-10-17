// N15 — foto del mockup (Playwright, Chromium). Pad in verticale e orizzontale (CSS 914×1292 e 1292×914, dpr 2.625 come l'OnePlus
// Pad 3) e telefono (412×915). Inglese/scuro e italiano/chiaro. Uso: node mockup/n15/foto.mjs <cartella di uscita>
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const uscita = process.argv[2]
mkdirSync(uscita, { recursive: true })
const BASE = 'http://127.0.0.1:4179/'
const scene = ['foglio-scollegato', 'foglio-attesa', 'foglio-collegato', 'foglio-scollega', 'benvenuto', 'compositore', 'pannello', 'limite']
const schermi = [
    { nome: 'pad-vert', viewport: { width: 914, height: 1292 } },
    { nome: 'pad-orizz', viewport: { width: 1292, height: 914 } },
    { nome: 'telefono', viewport: { width: 412, height: 915 } },
]
const varianti = [
    { nome: 'en-scuro', locale: 'en-US', tema: 'dark' },
    { nome: 'it-chiaro', locale: 'it-IT', tema: 'light' },
]

const browser = await chromium.launch()
for (const v of varianti) {
    for (const s of schermi) {
        const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 2.625, locale: v.locale, colorScheme: v.tema, reducedMotion: 'reduce' })
        const page = await ctx.newPage()
        for (const scena of scene) {
            await page.goto(`${BASE}?scena=${scena}&tema=${v.tema}`, { waitUntil: 'networkidle' })
            await page.waitForTimeout(700)
            await page.screenshot({ path: `${uscita}/${scena}-${s.nome}-${v.nome}.png` })
        }
        await ctx.close()
    }
}
await browser.close()
console.log('foto fatte:', scene.length * schermi.length * varianti.length)
