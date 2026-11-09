/*
 * Centro assistenza (owner 01/11/2026): l'indice costruito dalle pagine del sito e l'attrezzo `talos_help` del kernel.
 * Condizioni delle sessioni provate qui: sezioni ≤ 3.000 caratteri e indice alla prima chiamata (Performance); solo le pagine del
 * proprio prodotto più le comuni (CLI, Mobile); `checkedOn` della SUA chiave, senza chiave «mai controllata» (Mobile); la lingua detta.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ancora, contenutoDellaPagina, dividiInSezioni, leggiIntestazione, paginaDellIndice, testoDaHtml } from '../src/aiuto/costruisci-indice.mjs'
import { cercaNellAiuto, confrontaVersioni, creaAiutoTalos, DEFINIZIONE_AIUTO, notaDiControllo, paroleDi, pesoDellaPagina, sezioneDiUnAltraSuperficie } from '../src/kernel/aiuto-talos.mjs'

const MDX = `---
title: 'Schedule an automation'
description: Have a task run again by itself, with a daily cap.
eyebrow: The Archive · Desktop
product: desktop
checkedOn: { desktop: '0.1.19', cli: "0.6.12" }
---
import X from '~/x.astro';

<Tools />
`

const ICONA = '<a class="sl-anchor-link" href="#create-one"><span aria-hidden="true"><svg width="16"><path d="m1 2"></path></svg></span><span class="sr-only" data-pagefind-ignore>Section titled “Create one”</span></a>'
const HTML = `<html><body><header>A newer version is out</header><main><div class="sl-markdown-content">
<p>An automation starts a task again by itself, tied
to a <a href="/docs/x/">task</a>.</p>
<div class="sl-heading-wrapper level-h2"><h2 id="create-one">Create one</h2>${ICONA}</div>
<ol>
<li>Open <strong>Automations</strong> in the sidebar.</li>
<li>Set its interval &amp; daily cap.</li>
</ol>
<div class="expressive-code"><link rel="stylesheet" href="/x.css"><figure class="frame"><figcaption class="header"><span class="title">PowerShell</span></figcaption><pre data-language="powershell"><code><div class="ec-line"><div class="code"><span>Get-FileHash</span><span> .\\TALOS-Setup-&lt;version&gt;.exe</span></div></div><div class="ec-line"><div class="code"><span>  second   line</span></div></div></code></pre><div class="copy"><button data-code="x"><div></div></button></div></figure></div>
<table><tr><th>Key</th><th>Value</th></tr><tr><td>a</td><td>b</td></tr></table>
</div> <footer class="docs-foot" data-pagefind-ignore>Sources</footer></main></body></html>`

test('AIUTO-01: l\'intestazione del sito dà titolo, descrizione, prodotto e i checkedOn per prodotto', () => {
    assert.deepEqual(leggiIntestazione(MDX), {
        titolo: 'Schedule an automation',
        descrizione: 'Have a task run again by itself, with a daily cap.',
        prodotto: 'desktop',
        controllataSu: { desktop: '0.1.19', cli: '0.6.12' },
    })
    assert.equal(leggiIntestazione('---\ntitle: x\nproduct: phone\n---\n').prodotto, 'all', 'un prodotto sconosciuto vale per tutti')
    assert.equal(leggiIntestazione('niente intestazione').titolo, '')
})

test('AIUTO-02: il contenuto si chiude al suo div, non al primo </div>; fuori resta il piè di pagina', () => {
    const c = contenutoDellaPagina(HTML)
    assert.ok(c.startsWith('<div class="sl-markdown-content">'))
    assert.ok(c.includes('<table>'), 'arriva fino in fondo, oltre i div annidati')
    assert.ok(!c.includes('Sources'), 'il piè di pagina resta fuori')
    assert.equal(contenutoDellaPagina('<p>nessun contenuto</p>'), '')
})

test('AIUTO-03: HTML → testo: titoli, elenchi senza righe vuote, codice intatto con <version>, tabelle, niente icone', () => {
    const t = testoDaHtml(contenutoDellaPagina(HTML))
    assert.ok(t.includes('An automation starts a task again by itself, tied to a task.'), 'gli a capo dell\'HTML diventano spazi')
    assert.ok(t.includes('## Create one'))
    assert.ok(t.includes('- Open Automations in the sidebar.\n- Set its interval & daily cap.'), t)
    assert.ok(t.includes('```\nGet-FileHash .\\TALOS-Setup-<version>.exe\n  second   line\n```'), t)
    assert.ok(t.includes('Key | Value\na | b'), t)
    assert.ok(!/Section titled|PowerShell|<|svg/u.test(t.replace(/```[\s\S]*?```/gu, '')), t)
})

test('AIUTO-04: le sezioni stanno sotto il tetto, tagliate a paragrafo, con le àncore del sito', () => {
    const lungo = Array.from({ length: 12 }, (_v, i) => `Paragraph ${i} ${'word '.repeat(60)}`).join('\n\n')
    const sezioni = dividiInSezioni(`Intro.\n\n## Big part\n\n${lungo}\n\n### Small\n\nshort`, { titoloPagina: 'Page', massimo: 1000 })
    for (const s of sezioni) assert.ok(s.testo.length <= 1000, `${s.id}: ${s.testo.length}`)
    assert.equal(sezioni[0].id, 'page')
    assert.ok(sezioni.some((s) => s.id === 'big-part' && /\(1\/\d\)$/u.test(s.titolo)))
    assert.ok(sezioni.some((s) => s.id === 'big-part-2'), 'i pezzi successivi hanno un id loro')
    assert.equal(ancora('What it records — and “why”!'), 'what-it-records-and-why')
    // un ### piccolo si fonde nel suo ##
    const fuso = dividiInSezioni('## A\n\ntext\n\n### B\n\nmore', { titoloPagina: 'P' })
    assert.deepEqual(fuso.map((s) => s.id), ['a'])
    assert.ok(fuso[0].testo.includes('### B'))
})

test('AIUTO-05: una pagina dell\'indice porta percorso, prodotto, checkedOn, lingua e sezioni', () => {
    const p = paginaDellIndice({ percorso: 'desktop/guides/automations', mdx: MDX, html: HTML })
    assert.equal(p.percorso, 'desktop/guides/automations')
    assert.equal(p.prodotto, 'desktop')
    assert.equal(p.lingua, 'en')
    assert.deepEqual(p.sezioni.map((s) => s.id), ['schedule-an-automation', 'create-one'])
})

const INDICE = {
    versione: 1,
    fonte: { commit: 'abc123' },
    pagine: [
        { percorso: 'desktop/guides/automations', titolo: 'Schedule an automation', descrizione: 'A task runs again by itself.', prodotto: 'desktop', controllataSu: { desktop: '0.1.19' }, lingua: 'en',
            sezioni: [{ id: 'create-one', titolo: 'Create one', testo: 'Open Automations in the sidebar. Set the interval and the daily cap.' },
                { id: 'what-it-records', titolo: 'What it records', testo: 'Each run is recorded with its start time.' }] },
        { percorso: 'cli/guides/automations', titolo: 'Automations in the CLI', descrizione: 'talos automation commands.', prodotto: 'cli', controllataSu: { cli: '0.6.12' }, lingua: 'en',
            sezioni: [{ id: 'commands', titolo: 'Commands', testo: 'Run talos automation create with a daily cap.' }] },
        { percorso: 'reference/glossary', titolo: 'Glossary', descrizione: 'Words of TALOS.', prodotto: 'all', controllataSu: {}, lingua: 'en',
            sezioni: [{ id: 'automation', titolo: 'Automation', testo: 'A task that runs again by itself.' }] },
    ],
}

test('AIUTO-06: la ricerca dà solo il proprio prodotto più le comuni, e prima la sezione col titolo giusto', () => {
    const pc = cercaNellAiuto(INDICE, 'automation daily cap', { prodotto: 'desktop' })
    assert.deepEqual(pc.map((r) => r.pagina.percorso), ['desktop/guides/automations', 'reference/glossary', 'desktop/guides/automations'].slice(0, pc.length))
    assert.ok(!pc.some((r) => r.pagina.prodotto === 'cli'), 'mai la pagina della CLI al PC')
    assert.equal(pc[0].sezione.id, 'create-one')
    const cli = cercaNellAiuto(INDICE, 'automation daily cap', { prodotto: 'cli' })
    assert.ok(cli.every((r) => r.pagina.prodotto !== 'desktop'), 'mai i pulsanti del PC alla CLI')
    assert.equal(cli[0].pagina.percorso, 'cli/guides/automations')
    assert.deepEqual(cercaNellAiuto(INDICE, 'the of and', { prodotto: 'desktop' }), [], 'solo parole vuote: niente')
    assert.deepEqual(cercaNellAiuto(INDICE, 'zebra', { prodotto: 'desktop' }), [])
})

test('AIUTO-07: la nota di controllo guarda SOLO la chiave del proprio prodotto', () => {
    const p = INDICE.pagine[0]
    assert.equal(notaDiControllo(p, { prodotto: 'desktop', versione: '0.1.39' }), 'Checked on Desktop 0.1.19; this app is 0.1.39: some details may differ.')
    assert.equal(notaDiControllo(p, { prodotto: 'desktop', versione: '0.1.19' }), 'Checked on Desktop 0.1.19.')
    // revisione del blocco 25 (R8): senza la versione dell'app la nota lo dice, non tace il confronto (AIUTO-16)
    assert.equal(notaDiControllo(p, { prodotto: 'desktop', versione: null }), 'Checked on Desktop 0.1.19; the version of this app is not known, so some details may differ.')
    assert.match(notaDiControllo({ controllataSu: { desktop: '0.1.19' } }, { prodotto: 'android', versione: '0.1.47' }), /^Never checked on Android/u)
    assert.equal(confrontaVersioni('0.1.9', '0.1.10'), -1)
    assert.equal(confrontaVersioni('0.2.0', '0.1.99'), 1)
    assert.equal(confrontaVersioni('1.0', '1.0.0'), 0)
})

test('AIUTO-08: l\'attrezzo legge l\'indice alla PRIMA chiamata, una volta sola, e riprova dopo un errore', async () => {
    let letture = 0
    let rompi = true
    const aiuto = creaAiutoTalos({ prodotto: 'desktop', versione: '0.1.39', leggiIndice: async () => { letture++; if (rompi) throw new Error('disco'); return INDICE } })
    assert.equal(letture, 0, 'creare l\'attrezzo non legge niente')
    const guasto = await aiuto.rispondi({ query: 'automation' })
    assert.equal(guasto.errore, true)
    assert.match(guasto.testo, /not available/u)
    rompi = false
    const r1 = await aiuto.rispondi({ query: 'automation' })
    await aiuto.rispondi({ query: 'cap' })
    assert.equal(letture, 2, 'riletto dopo l\'errore, poi in memoria')
    assert.equal(r1.errore, false)
    assert.match(r1.testo, /page "desktop\/guides\/automations", section "create-one"/u)
    assert.match(r1.testo, /Checked on Desktop 0\.1\.19; this app is 0\.1\.39/u)
    assert.match(r1.testo, /site abc123/u)
    assert.ok(!r1.testo.includes('cli/guides'))
})

test('AIUTO-09: leggere una sezione dà il testo intero, le sezioni vicine e i rifiuti onesti', async () => {
    const aiuto = creaAiutoTalos({ prodotto: 'desktop', versione: '0.1.39', lingua: 'it-IT', leggiIndice: async () => INDICE })
    const r = await aiuto.rispondi({ page: '/docs/desktop/guides/automations/', section: '#create-one', query: 'ignorata' })
    assert.equal(r.errore, false)
    assert.ok(r.testo.includes('Open Automations in the sidebar. Set the interval and the daily cap.'))
    assert.ok(r.testo.includes('Other sections of this page: what-it-records (What it records).'))
    assert.ok(r.testo.includes('answer the person in their own language'), 'persona in italiano, guida in inglese: detto')
    const primo = await aiuto.rispondi({ page: 'desktop/guides/automations' })
    assert.ok(primo.testo.includes('#create-one'), 'senza sezione, la prima')
    const altrove = await aiuto.rispondi({ page: 'cli/guides/automations' })
    assert.equal(altrove.errore, true)
    assert.match(altrove.testo, /is for TALOS CLI, not for this app \(Desktop\)/u)
    assert.match((await aiuto.rispondi({ page: 'nope' })).testo, /No help page "nope"/u)
    assert.match((await aiuto.rispondi({ page: 'desktop/guides/automations', section: 'x' })).testo, /Its sections: create-one, what-it-records/u)
    assert.equal((await aiuto.rispondi({})).errore, true)
    const nulla = await aiuto.rispondi({ query: 'zebra' })
    assert.equal(nulla.errore, false)
    assert.match(nulla.testo, /does not cover it rather than guessing/u)
    const inglese = creaAiutoTalos({ prodotto: 'desktop', lingua: 'en-GB', leggiIndice: async () => INDICE })
    assert.ok(!(await inglese.rispondi({ page: 'desktop/guides/automations' })).testo.includes('own language'))
})

test('AIUTO-10: il limite dei risultati sta fra 1 e 8; un indice d\'altra versione non si legge; prodotto sconosciuto rifiutato', async () => {
    const molte = { versione: 1, pagine: [{ percorso: 'desktop/x', titolo: 'X', descrizione: '', prodotto: 'desktop', controllataSu: {}, lingua: 'en',
        sezioni: Array.from({ length: 20 }, (_v, i) => ({ id: `s${i}`, titolo: `cap ${i}`, testo: 'cap' })) }] }
    const aiuto = creaAiutoTalos({ prodotto: 'desktop', leggiIndice: async () => molte })
    const conta = (t) => (t.match(/^\d+\. page/gmu) ?? []).length
    assert.equal(conta((await aiuto.rispondi({ query: 'cap' })).testo), 5)
    assert.equal(conta((await aiuto.rispondi({ query: 'cap', limit: 50 })).testo), 8)
    assert.equal(conta((await aiuto.rispondi({ query: 'cap', limit: 0 })).testo), 5, '0 non è un numero valido: il predefinito')
    assert.equal(conta((await aiuto.rispondi({ query: 'cap', limit: -3 })).testo), 1)
    const vecchio = creaAiutoTalos({ prodotto: 'desktop', leggiIndice: async () => ({ versione: 2, pagine: [] }) })
    assert.equal((await vecchio.rispondi({ query: 'cap' })).errore, true)
    assert.throws(() => creaAiutoTalos({ prodotto: 'phone' }), /prodotto sconosciuto/u)
    assert.equal(DEFINIZIONE_AIUTO.name, 'talos_help')
    assert.deepEqual(Object.keys(DEFINIZIONE_AIUTO.input_schema.properties), ['query', 'page', 'section', 'limit'])
})

test('AIUTO-11: a pari parole vincono le guide sulle note di versione e sull\'API; una versione nella domanda porta alla sua nota', async () => {
    const pagina = (percorso, titolo, testo) => ({ percorso, titolo, descrizione: '', prodotto: 'desktop', controllataSu: {}, lingua: 'en', sezioni: [{ id: 'a', titolo, testo }] })
    const indice = { versione: 1, pagine: [
        pagina('desktop/changelog', '0.1.36', 'The compaction model can be changed.'),
        pagina('desktop/reference/api/sessions', 'POST /sessions/compaction', 'Change the compaction model.'),
        pagina('desktop/guides/long-conversations', 'Long conversations', 'Change the compaction model in Settings.'),
    ] }
    const ordine = (q) => cercaNellAiuto(indice, q, { prodotto: 'desktop' }).map((r) => r.pagina.percorso)
    assert.equal(ordine('change compaction model')[0], 'desktop/guides/long-conversations')
    assert.equal(ordine('change compaction model').at(-1), 'desktop/changelog')
    assert.equal(ordine('what changed in 0.1.36')[0], 'desktop/changelog', 'la versione resta una parola sola')
    assert.deepEqual(paroleDi('New in 0.1.36?'), ['0.1.36', 'new'])
    assert.equal(pesoDellaPagina('desktop/guides/automations'), 1)
    assert.ok(pesoDellaPagina('desktop/changelog') < pesoDellaPagina('desktop/reference/api/x'))
    assert.ok(pesoDellaPagina('desktop/reference/api/x') < pesoDellaPagina('desktop/reference/tools'))
    // con una versione nella domanda la nota di versione vince anche contro la guida che ha le stesse altre parole
    assert.equal(ordine('compaction model 0.1.36')[0], 'desktop/changelog')
    assert.ok(pesoDellaPagina('desktop/changelog', { chiedeUnaVersione: true }) > pesoDellaPagina('desktop/guides/x'))
})

/* Revisione avversaria mia (01/11/2026), sull'indice vero: le pagine comuni (`all`) hanno sezioni di una superficie sola («On Android»,
   «In the CLI», «On TALOS Desktop»). La ricerca le dava al modello del PC come se valessero lì: la condizione del Mobile («mai una pagina
   di un'altra superficie come se valesse lì») vale anche per le sezioni. */
test('AIUTO-12: in una pagina comune, una sezione che nomina un\'altra superficie non esce dalla ricerca; quella della propria sì', () => {
    const pagina = { percorso: 'reference/models', titolo: 'Models & providers', descrizione: '', prodotto: 'all', controllataSu: {}, lingua: 'en', sezioni: [
        { id: 'on-talos-desktop', titolo: 'On TALOS Desktop', testo: 'Local models run on the GPU of this computer.' },
        { id: 'in-the-cli', titolo: 'In the CLI', testo: 'Local models run on the GPU with the CLI.' },
        { id: 'on-android', titolo: 'On Android', testo: 'Local models run on the GPU of the device.' },
        { id: 'your-keys', titolo: 'Your keys', testo: 'Keys for cloud models; local models need none.' },
    ] }
    const indice = { versione: 1, pagine: [pagina] }
    const sezioni = (prodotto) => cercaNellAiuto(indice, 'local models GPU', { prodotto, limite: 8 }).map((r) => r.sezione.id).sort()
    assert.deepEqual(sezioni('desktop'), ['on-talos-desktop', 'your-keys'])
    assert.deepEqual(sezioni('cli'), ['in-the-cli', 'your-keys'])
    assert.deepEqual(sezioni('android'), ['on-android', 'your-keys'])
})

test('AIUTO-12b: una sezione che nomina anche la propria superficie resta («Desktop and CLI» vale per tutte e due)', () => {
    assert.equal(sezioneDiUnAltraSuperficie('Desktop and CLI', 'desktop'), false)
    assert.equal(sezioneDiUnAltraSuperficie('Desktop and CLI', 'cli'), false)
    assert.equal(sezioneDiUnAltraSuperficie('Desktop and CLI', 'android'), true)
    assert.equal(sezioneDiUnAltraSuperficie('Your keys', 'android'), false, 'una sezione che non nomina nessuno vale per tutti')
})

/* Revisione del blocco 25 (S3, R6): il filtro guardava solo il TITOLO. Sull'indice vero «“Windows protected your PC”» e «The graphics card» valgono solo per
   il Desktop ma non lo dicono nel titolo: uscivano al modello del telefono, la seconda per prima su «graphics card gpu driver». Ora, con un titolo che non nomina
   nessuno, decide la PRIMA FRASE della sezione (di chi parla); una superficie nominata più avanti, di passaggio («For the CLI, attach…»), non basta. */
test('AIUTO-13: titolo neutro, la prima frase nomina un\'altra superficie e non la propria ⇒ fuori; di passaggio più avanti ⇒ resta', () => {
    assert.equal(sezioneDiUnAltraSuperficie('The graphics card', 'android', '- If the graphics card is lost, TALOS Desktop restarts the model on the CPU.\n- More.'), true)
    assert.equal(sezioneDiUnAltraSuperficie('The graphics card', 'cli', '- If the graphics card is lost, TALOS Desktop restarts the model on the CPU.'), true)
    assert.equal(sezioneDiUnAltraSuperficie('The graphics card', 'desktop', '- If the graphics card is lost, TALOS Desktop restarts the model on the CPU.'), false)
    assert.equal(sezioneDiUnAltraSuperficie('Report a problem', 'desktop', '- Bugs and questions: open an issue on GitHub. For the CLI, attach the bundle.'), false, 'nominata di passaggio')
    assert.equal(sezioneDiUnAltraSuperficie('Your keys', 'android', 'Desktop, CLI and Android keep keys in the system keychain.'), false, 'nomina anche la propria')
    assert.equal(sezioneDiUnAltraSuperficie('Overview', 'cli'), false, 'senza testo: come prima, solo il titolo')
})

test('AIUTO-13b (indice vero): al modello del telefono e della CLI non escono più le due sezioni del solo Desktop; al Desktop sì', async () => {
    const { readFile } = await import('node:fs/promises')
    const vero = JSON.parse(await readFile(new URL('../aiuto/index.json', import.meta.url), 'utf8'))
    const id = (prodotto, q) => cercaNellAiuto(vero, q, { prodotto, limite: 8 }).map((r) => `${r.pagina.percorso}#${r.sezione.id}`)
    for (const prodotto of ['android', 'cli']) {
        assert.ok(!id(prodotto, 'windows protected your pc smartscreen').includes('reference/verify-and-troubleshoot#windows-protected-your-pc'), prodotto)
        assert.ok(!id(prodotto, 'graphics card gpu driver').includes('reference/verify-and-troubleshoot#the-graphics-card'), prodotto)
    }
    assert.ok(id('desktop', 'windows protected your pc smartscreen').includes('reference/verify-and-troubleshoot#windows-protected-your-pc'))
    assert.ok(id('desktop', 'graphics card gpu driver').includes('reference/verify-and-troubleshoot#the-graphics-card'))
    assert.ok(id('android', 'report a problem bug issue').includes('reference/verify-and-troubleshoot#report-a-problem'), 'AL CONTRARIO: la sezione comune resta')
})

test('AIUTO-14: una sezione d\'un\'altra superficie letta direttamente lo DICE; una della propria no', async () => {
    const pagina = { percorso: 'reference/models', titolo: 'Models', descrizione: '', prodotto: 'all', controllataSu: {}, lingua: 'en', sezioni: [
        { id: 'local', titolo: 'Local', testo: 'Local models.' },
        { id: 'on-android', titolo: 'On Android', testo: 'On the device.' },
        { id: 'gpu', titolo: 'The graphics card', testo: 'TALOS Desktop restarts the model on the CPU.' },
    ] }
    const a = creaAiutoTalos({ leggiIndice: async () => ({ versione: 1, pagine: [pagina] }), prodotto: 'desktop', versione: '0.1.39', lingua: 'en' })
    assert.match((await a.rispondi({ page: 'reference/models', section: 'on-android' })).testo, /This section is about TALOS Android, not this app \(Desktop\)/u)
    assert.doesNotMatch((await a.rispondi({ page: 'reference/models', section: 'gpu' })).testo, /This section is about/u)
    const b = creaAiutoTalos({ leggiIndice: async () => ({ versione: 1, pagine: [pagina] }), prodotto: 'android', versione: '0.1.47', lingua: 'en' })
    assert.match((await b.rispondi({ page: 'reference/models', section: 'gpu' })).testo, /This section is about TALOS Desktop, not this app \(Android\)/u)
    assert.doesNotMatch((await b.rispondi({ page: 'reference/models', section: 'local' })).testo, /This section is about/u)
})

/* R7: la domanda tornava al modello per intera e si tokenizzava tutta (1 MB ⇒ un esito da 1.102.645 caratteri; 20.000 parole ⇒ ~435 ms di CPU). Tetto a
   500 caratteri, prima di cercare e nell'eco; ciò che sta oltre non conta per la ricerca. */
test('AIUTO-15: la domanda ha un tetto di 500 caratteri, nella ricerca e nell\'eco', async () => {
    const pagina = { percorso: 'g/a', titolo: 'Automations', descrizione: '', prodotto: 'desktop', controllataSu: {}, lingua: 'en', sezioni: [{ id: 's', titolo: 'Daily cap', testo: 'zebracap here.' }] }
    const a = creaAiutoTalos({ leggiIndice: async () => ({ versione: 1, pagine: [pagina] }), prodotto: 'desktop', versione: '0.1.39', lingua: 'en' })
    const enorme = await a.rispondi({ query: 'compaction '.repeat(100_000) })
    assert.ok(enorme.testo.length < 1_500, `esito di ${enorme.testo.length} caratteri`)
    const oltre = await a.rispondi({ query: `${'x'.repeat(520)} zebracap` })
    assert.match(oltre.testo, /^Nothing in the TALOS help/u, 'una parola oltre il tetto non conta')
    const dentro = await a.rispondi({ query: `${'x'.repeat(400)} zebracap` })
    assert.match(dentro.testo, /section "s"/u)
})

/* R8: senza la versione dell'app la nota diceva «Checked on Android X.» senza confronto (come se fosse attuale), e la lingua non arrivava mai: si DICE */
test('AIUTO-16: versione sconosciuta e lingua sconosciuta si dicono al modello, non si tacciono', async () => {
    const p = { controllataSu: { android: '0.1.40' } }
    assert.equal(notaDiControllo(p, { prodotto: 'android', versione: null }), 'Checked on Android 0.1.40; the version of this app is not known, so some details may differ.')
    const pagina = { percorso: 'g/a', titolo: 'A', descrizione: '', prodotto: 'all', controllataSu: {}, lingua: 'en', sezioni: [{ id: 's', titolo: 'Cap', testo: 'daily cap' }] }
    const conLingua = (lingua) => creaAiutoTalos({ leggiIndice: async () => ({ versione: 1, pagine: [pagina] }), prodotto: 'cli', lingua }).rispondi({ query: 'daily cap' })
    assert.match((await conLingua(null)).testo, /The guide is in English; the person's language is not known here: answer in the language the person writes in\./u)
    assert.match((await conLingua('it')).testo, /The guide is in English: answer the person in their own language\./u)
    assert.doesNotMatch((await conLingua('en')).testo, /The guide is in English/u)
})

test('AIUTO-17: il server passa versione e lingua quando l\'ospite le dà (anche telefono e CLI), e le dice ignote quando no', async () => {
    const { aiutoDelServer } = await import('../src/aiuto/aiuto-del-server.mjs')
    const indice = { versione: 1, pagine: [{ percorso: 'g/a', titolo: 'A', descrizione: '', prodotto: 'all', controllataSu: { android: '0.1.40', cli: '0.6.1' }, lingua: 'en', sezioni: [{ id: 's', titolo: 'Cap', testo: 'daily cap' }] }] }
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const cartella = mkdtempSync(join(tmpdir(), 'aiuto-17-'))
    writeFileSync(join(cartella, 'index.json'), JSON.stringify(indice))
    const telefono = aiutoDelServer({ TALOS_AIUTO_DIR: cartella, TALOS_LOCALE_OSPITE_DIR: 'x', TALOS_AIUTO_VERSIONE: '0.1.47', TALOS_AIUTO_LINGUA: 'it' })
    const t = (await telefono.rispondi({ query: 'daily cap' })).testo
    assert.match(t, /Checked on Android 0\.1\.40; this app is 0\.1\.47: some details may differ\./u)
    assert.match(t, /answer the person in their own language/u)
    const cli = aiutoDelServer({ TALOS_AIUTO_DIR: cartella, TALOS_AIUTO_PRODOTTO: 'cli' })
    const c = (await cli.rispondi({ query: 'daily cap' })).testo
    assert.match(c, /the version of this app is not known/u)
    assert.match(c, /the person's language is not known here/u)
})

/* Revisione del blocco 25 (S3, R9): `talos_help` è una lettura (il nucleo lo dice, `talosHarness.mjs` «una lettura: anche alle figlie»), ma non era fra le letture
   del contratto di delega: a una figlia in sola lettura non si offriva. AL CONTRARIO: una scrittura resta fuori. */
test('AIUTO-18: una figlia in sola lettura può leggere la guida; una scrittura resta negata', async () => {
    const { consenteAttrezzoDelega } = await import('../src/delegation-contract.mjs')
    const contrattoDelega = { schema: 'talos.delegation.v1', modalita: 'lettura' }
    assert.equal(consenteAttrezzoDelega({ contrattoDelega }, 'talos_help'), true)
    assert.equal(consenteAttrezzoDelega({ contrattoDelega }, 'scrivi'), false)
    assert.equal(consenteAttrezzoDelega({ contrattoDelega }, 'notes_create'), false)
})
