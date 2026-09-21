/**
 * ⭐⭐⭐ QUANTO COSTA VEDERE MEGLIO — il cancello del Livello 1.
 *
 * La ricerca sulla navigazione dinamica proponeva di portare `Elemento` da 4
 * campi a undici: riquadro, `resource-id`, classe, descrizione, posizione nel
 * genitore, dentro-una-lista, e le tre affordance. E si dava da sola
 * l'avvertimento giusto — *«il costo va misurato PRIMA di consegnare, perché il
 * ciclo dell'agente fa molti passi e ogni campo si paga a ognuno»*.
 *
 * ## ⛔ La misura ha bocciato la proposta
 *
 * Fatta il 2026-08-16 su **tre schermate vere** del Pad OPD2415, tirate giù con
 * `uiautomator dump` da tre fornitori diversi — OnePlus (`com.oplus.wirelesssettings`),
 * AOSP (`com.android.settings`) e Play Store (`com.android.vending`) — per 69
 * elementi interattivi:
 *
 * | formato | token per sguardo | |
 * |---|---:|---|
 * | **A** senza recupero | **277** | ma 50 pulsanti su 69 sono `""` |
 * | **B** gli undici campi nel testo | **4.794** | **17,3×** ⇒ insostenibile |
 * | **D** il nostro | **535** | **1,93×**, e 44 muti su 50 diventano scegliebili |
 *
 * ⇒ La proposta B costava **diciassette volte tanto a ogni passo**. Dieci passi
 * sarebbero 47.900 token di soli sguardi, contro i 5.350 di D.
 *
 * ⛔ Il confronto è fatto con l'igiene attiva su ENTRAMBE le colonne, così il
 * rapporto isola il costo del **solo recupero**. Contro l'uscita di produzione
 * di oggi, che l'igiene non ce l'ha, il nostro costa 1,81×.
 *
 * ## La cura, in due mosse
 *
 * 1. **I campi per gli ordinali non vanno nel testo.** `posizione` e `inLista`
 *    servono a risolvere «il primo contatto» nel codice: attraversano il ponte
 *    e si fermano al risolutore. Costano **zero token**.
 * 2. **L'etichetta recuperata si asciuga.** Il `contentDescription` di una
 *    scheda del Play Store è titolo + editore + categorie + «Valutazione a
 *    stelle…»: 135 caratteri per dire «Crunchyroll». Il nome è il primo
 *    capoverso. Da solo, questo taglio porta il recupero da 2,60× a 1,68×.
 *
 * ⛔ Questo test è il cancello: se qualcuno rimette i campi nel testo, o toglie
 * il cappello all'etichetta, il numero sfonda e la corsa diventa rossa. Non è
 * un test di stile — è la differenza fra un pilota che gira e uno che finisce
 * la finestra di contesto al terzo passo.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    TALOS_ETICHETTA_MAX,
    talosEtichettaAsciutta,
    talosOsservazione,
    type TalosElementoSchermo,
} from '@/lib/agent/passoDelloSchermo'

/** La convenzione della casa: si contano i byte, ~3,7 per token. */
const BYTE_PER_TOKEN = 3.7
const inToken = (s: string): number => Math.round(Buffer.byteLength(s, 'utf8') / BYTE_PER_TOKEN)

const SCHERMATE = [
    ['OnePlus Wi-Fi', 'oneplus-wifi.xml'],
    ['AOSP applicazioni', 'aosp-applicazioni.xml'],
    ['Play Store', 'play-store.xml'],
] as const

interface Nodo {
    attr: Record<string, string>
    figli: Nodo[]
    genitore: Nodo | null
}

function fixture(nome: string): string {
    return readFileSync(
        fileURLToPath(new URL(`../../fixtures/schermate/${nome}`, import.meta.url)),
        'utf8',
    )
}

/** Ricostruisce l'albero del dump di `uiautomator`. Niente dipendenze. */
function albero(xml: string): Nodo {
    const radice: Nodo = { attr: {}, figli: [], genitore: null }
    let corrente = radice
    const tag = /<node\b([^>]*?)(\/?)>|<\/node>/g
    let m: RegExpExecArray | null
    while ((m = tag.exec(xml)) !== null) {
        if (m[0] === '</node>') {
            corrente = corrente.genitore ?? radice
            continue
        }
        const attr: Record<string, string> = {}
        for (const a of (m[1] ?? '').matchAll(/([a-z-]+)="([^"]*)"/g)) attr[a[1]!] = a[2]!
        const n: Nodo = { attr, figli: [], genitore: corrente }
        corrente.figli.push(n)
        if (m[2] !== '/') corrente = n
    }
    return radice
}

const vero = (v: string | undefined): boolean => v === 'true'

/** Il proprio testo, come lo legge oggi `TalosOcchio`. */
const etichettaPropria = (n: Nodo): string =>
    (n.attr.text || n.attr['content-desc'] || '').trim()

/**
 * ⭐ Il recupero dal SOTTOALBERO.
 *
 * In Android il nodo cliccabile è quasi sempre un contenitore nudo e il nome
 * sta nei figli: chiedere l'etichetta al contenitore è come chiedere il titolo
 * alla copertina invece che al frontespizio. Questa è la copia in TypeScript di
 * ciò che `TalosOcchio.nomeDalSottoalbero()` fa sull'albero vivo — sta qui per
 * poter misurare il costo su schermate vere senza un telefono attaccato.
 */
function etichettaDalSottoalbero(n: Nodo): string {
    const coda = [...n.figli]
    while (coda.length) {
        const f = coda.shift()!
        const t = etichettaPropria(f)
        if (t) return t
        for (const g of f.figli) coda.push(g)
    }
    return ''
}

const dentroUnaLista = (n: Nodo): boolean => {
    for (let p = n.genitore; p; p = p.genitore) {
        if (vero(p.attr.scrollable)) return true
        if (/RecyclerView|ListView|GridView|ViewPager/.test(p.attr.class ?? '')) return true
    }
    return false
}

interface Visto {
    nodo: Nodo
    elemento: TalosElementoSchermo
    riquadro: { t: number, l: number }
}

/** Lo stesso filtro di `TalosOcchio.interattivi()`. */
function guarda(xml: string): Visto[] {
    const radice = albero(xml)
    const grezzi: Array<{ nodo: Nodo, t: number, l: number }> = []
    const pila = [radice]
    while (pila.length) {
        const n = pila.pop()!
        for (const f of n.figli) pila.push(f)
        if (n === radice) continue
        const riquadro = /\[(-?\d+),(-?\d+)]\[(-?\d+),(-?\d+)]/.exec(n.attr.bounds ?? '')
        if (!riquadro) continue
        if (+riquadro[3]! - +riquadro[1]! <= 0 || +riquadro[4]! - +riquadro[2]! <= 0) continue
        grezzi.push({ nodo: n, t: +riquadro[2]!, l: +riquadro[1]! })
    }
    const fuori: Visto[] = []
    for (const { nodo: n, t, l } of grezzi) {
        const a = n.attr
        const tipo = (a.class ?? '').includes('EditText')
            ? 'campo'
            : vero(a.checkable)
              ? 'interruttore'
              : vero(a.scrollable)
                ? 'scorri'
                : vero(a.clickable) || vero(a['long-clickable'])
                  ? 'tocca'
                  : null
        if (!tipo) continue
        /*
         * ⛔ Il recupero NON si fa sui contenitori che scorrono: uno scorrimento
         * non ha bisogno di un nome per essere fatto, e battezzarli costerebbe
         * token per niente. Sono 4 dei 54 muti — piccolo, ma è gratis toglierlo.
         */
        const propria = etichettaPropria(n)
        const etichetta = propria || (tipo === 'scorri' ? '' : etichettaDalSottoalbero(n))
        fuori.push({
            nodo: n,
            riquadro: { t, l },
            elemento: {
                indice: fuori.length,
                tipo,
                etichetta,
                ...(vero(a.checkable) ? { attivo: vero(a.checked) } : {}),
                posizione: n.genitore ? n.genitore.figli.indexOf(n) : -1,
                inLista: dentroUnaLista(n),
            },
        })
    }
    /*
     * ⭐ Si numera COME SI VEDE — la stessa cosa che fa `TalosOcchio` sul
     * dispositivo. Lo spareggio finale è l'ordine di scoperta, così due
     * elementi sovrapposti si numerano sempre allo stesso modo.
     */
    return fuori
        .map((v, ordineDiScoperta) => ({ v, ordineDiScoperta }))
        .sort((a, b) =>
            (a.v.riquadro.t - b.v.riquadro.t)
            || (a.v.riquadro.l - b.v.riquadro.l)
            || (a.ordineDiScoperta - b.ordineDiScoperta))
        .map(({ v }, i) => ({ ...v, elemento: { ...v.elemento, indice: i } }))
}

/** B — la proposta della ricerca: gli undici campi, nel testo. */
function osservazioneIngenua(visti: readonly Visto[]): string {
    return visti
        .map(({ nodo: n, elemento: e }) =>
            JSON.stringify({
                indice: e.indice,
                tipo: e.tipo,
                etichetta: e.etichetta,
                attivo: e.attivo,
                riquadro: n.attr.bounds,
                identificativo: (n.attr['resource-id'] ?? '').split('/').pop() ?? '',
                classe: (n.attr.class ?? '').split('.').pop() ?? '',
                descrizione: n.attr['content-desc'] ?? '',
                posizione: e.posizione,
                inLista: e.inLista,
                scorribile: vero(n.attr.scrollable),
                modificabile: e.tipo === 'campo',
                selezionato: vero(n.attr.selected),
            }),
        )
        .join('\n')
}

describe('quanto costa vedere meglio', () => {
    const misure = SCHERMATE.map(([nome, file]) => {
        const visti = guarda(fixture(file))
        const senzaRecupero = visti.map(({ nodo, elemento }) => ({
            ...elemento,
            etichetta: etichettaPropria(nodo),
        }))
        return {
            nome,
            visti,
            oggi: inToken(talosOsservazione(senzaRecupero)),
            ingenuo: inToken(osservazioneIngenua(visti)),
            nostro: inToken(talosOsservazione(visti.map((v) => v.elemento))),
        }
    })

    const somma = (k: 'oggi' | 'ingenuo' | 'nostro'): number =>
        misure.reduce((t, m) => t + m[k], 0)

    it('misura e mostra il peso, su schermate vere', () => {
        const righe = misure.map(
            (m) =>
                `  ${m.nome.padEnd(20)} ${String(m.visti.length).padStart(3)} el.` +
                `  oggi ${String(m.oggi).padStart(5)}` +
                `  ingenuo ${String(m.ingenuo).padStart(5)}` +
                `  nostro ${String(m.nostro).padStart(5)}`,
        )
        console.log(
            '\nTOKEN PER SGUARDO — tre schermate vere del Pad OPD2415\n\n' +
                `${righe.join('\n')}\n` +
                `  ${'TOTALE'.padEnd(20)}     ` +
                `  oggi ${String(somma('oggi')).padStart(5)}` +
                `  ingenuo ${String(somma('ingenuo')).padStart(5)}` +
                `  nostro ${String(somma('nostro')).padStart(5)}\n\n` +
                `  l'ingenuo costa ${(somma('ingenuo') / somma('oggi')).toFixed(1)}× — ` +
                'e sarebbe stato pagato a OGNI passo del ciclo\n' +
                `  il nostro costa ${(somma('nostro') / somma('oggi')).toFixed(2)}×\n`,
        )
        expect(misure).toHaveLength(3)
    })

    it('⛔ il nostro formato resta molto sotto la proposta ingenua', () => {
        // Misurato 1,68×. Il tetto a 2,2× lascia respiro a schermate più
        // parlanti senza lasciar passare un ritorno agli undici campi (15,8×).
        expect(somma('nostro') / somma('oggi')).toBeLessThan(2.2)
        expect(somma('ingenuo') / somma('oggi')).toBeGreaterThan(10)
    })

    it('⛔ `posizione` e `inLista` NON compaiono nel testo per il modello', () => {
        for (const m of misure) {
            const testo = talosOsservazione(m.visti.map((v) => v.elemento))
            expect(testo).not.toContain('posizione')
            expect(testo).not.toContain('inLista')
            // ...ma ci sono, perché il risolutore degli ordinali li usa.
            expect(m.visti.some((v) => v.elemento.inLista === true)).toBe(true)
            expect(m.visti.every((v) => typeof v.elemento.posizione === 'number')).toBe(true)
        }
    })

    it('⭐ il sottoalbero recupera la gran parte dei pulsanti muti', () => {
        let muti = 0
        let salvati = 0
        for (const m of misure) {
            for (const v of m.visti) {
                if (v.elemento.tipo !== 'tocca') continue
                if (etichettaPropria(v.nodo)) continue
                muti += 1
                if (v.elemento.etichetta) salvati += 1
            }
        }
        console.log(
            `\n  pulsanti muti: ${muti} — salvati dal sottoalbero: ${salvati}` +
                ` (${Math.round((salvati / muti) * 100)}%), ciechi: ${muti - salvati}\n`,
        )
        expect(muti).toBeGreaterThan(20)
        /*
         * ⛔ 88% qui (44 su 50). Ma NON È UNA COSTANTE: sul Play Store dal vivo,
         * col carosello aperto, la stessa funzione ha fatto **76%** (22 su 29).
         * Il tasso dipende da quanto è grafica la schermata e sta fra il 75% e
         * il 95%. La soglia qui è larga apposta: serve a dire «il metodo
         * funziona», non a promettere una cifra che cambierebbe con l'app.
         */
        expect(salvati / muti).toBeGreaterThan(0.7)
    })

    /*
     * ⭐⭐⭐ IL DIFETTO PIÙ GROSSO DEI TRE, e nessuno lo vedeva.
     *
     * MISURATO il 2026-08-16: quanti indici erano già in ordine visivo?
     * Impostazioni **0 su 19**, Applicazioni **1 su 18**, Play Store **2 su 32**.
     *
     * La visita dell'albero è in profondità, e l'ordine di scoperta non ha
     * niente a che fare con quello di schermo. Su `Applicazioni`, «il primo»
     * per indice era «Accessibilità di Android» mentre in cima si vedeva
     * «Indietro».
     *
     * ⇒ Il modello ragiona sull'elenco numerato come farebbe una persona — «il
     * terzo», «quello sopra», «il primo contatto» — e con una numerazione
     * arbitraria quel ragionamento è **sempre sbagliato**, senza mai fallire in
     * modo visibile: tocca semplicemente un'altra cosa.
     */
    it('⭐⭐ gli indici seguono l\'ordine in cui si VEDE, non quello dell\'albero', () => {
        for (const m of misure) {
            const y = m.visti.map((v) => v.riquadro.t)
            const crescente = y.every((v, i) => i === 0 || y[i - 1]! <= v)
            expect(crescente, `${m.nome}: gli indici non scendono lungo lo schermo`).toBe(true)
        }
    })

    it('⛔ a parità di riga si va da SINISTRA a destra', () => {
        for (const m of misure) {
            for (let i = 1; i < m.visti.length; i += 1) {
                const a = m.visti[i - 1]!.riquadro
                const b = m.visti[i]!.riquadro
                if (a.t === b.t) expect(a.l).toBeLessThanOrEqual(b.l)
            }
        }
    })

    it('⛔ AL CONTRARIO: chi non ha un nome resta senza, non se ne inventa uno', () => {
        const ciechi = misure
            .flatMap((m) => m.visti)
            .filter((v) => v.elemento.tipo === 'tocca' && !etichettaPropria(v.nodo))
            .filter((v) => !v.elemento.etichetta)
        // Devono esistere: sono i casi per cui serve lo screenshot ritagliato.
        expect(ciechi.length).toBeGreaterThan(0)
        for (const v of ciechi) expect(v.elemento.etichetta).toBe('')
    })
})

describe("l'etichetta asciutta", () => {
    it('tiene il primo capoverso, che è il nome', () => {
        const scheda = 'Crunchyroll: Streaming Anime\nCrunchyroll, LLC\nSupervisione dei genitori'
        expect(talosEtichettaAsciutta(scheda)).toBe('Crunchyroll: Streaming Anime')
    })

    it('cappa quello che resta troppo lungo, e lo dice con i puntini', () => {
        const lunga = 'a'.repeat(120)
        const fuori = talosEtichettaAsciutta(lunga)
        expect(fuori).toHaveLength(TALOS_ETICHETTA_MAX)
        expect(fuori.endsWith('…')).toBe(true)
    })

    it('⛔ non tocca le etichette normali — la mediana misurata è 18 caratteri', () => {
        for (const breve of ['Wi-Fi', 'Bluetooth', 'Impostazioni', 'Invia']) {
            expect(talosEtichettaAsciutta(breve)).toBe(breve)
        }
    })

    it('⛔ AL CONTRARIO: vuoto resta vuoto', () => {
        expect(talosEtichettaAsciutta('')).toBe('')
        expect(talosEtichettaAsciutta('   \n  ')).toBe('')
    })
})
