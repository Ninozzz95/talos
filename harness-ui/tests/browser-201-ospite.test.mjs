/*
 * Decisione 201 dell'owner (04/11/2026): l'ospite di `browser_page` (`src/pagina-browser-ospite.mjs`). Forma: in-corso/FORMA-BROWSER-201.
 * Si prova l'ordine di lettura (corsia viva ⇒ copia pubblica ⇒ rifiuto per la rete locale), la forma del campo che il compositore manda,
 * e che dove non c'è Chromium (il telefono) l'attrezzo non nasce, come `local_page`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { creaLeggiPaginaBrowser, leggiPaginaBrowserSeCeIlBrowser, paginaBrowserValida, MOTIVO_NESSUNA_PAGINA, MOTIVO_PAGINA_LOCALE } from '../src/pagina-browser-ospite.mjs'
import { SCHEDA_DELLA_FINESTRA } from '../src/pagina-locale-ospite.mjs'

const PAGINA = { url: 'https://example.org/a?b=1', titolo: 'Esempio', via: 'cornice' }

function browserFinto(schede, testo = 'TESTO RESO DAL BROWSER', urlLetta = 'https://example.org/a?b=1#dopo') {
    const letture = []
    return {
        letture,
        stato: () => ({ schede }),
        leggi: async (chiave, opzioni) => { letture.push([chiave, opzioni]); return { url: urlLetta, testo } },
    }
}

/* 05/11/2026 (revisione R-3): la scheda e la lettura dicevano `/a` e `/a?b=1&dopo=1` contro la nota `/a?b=1`; ora un indirizzo diverso
   non si restituisce più, e qui la scheda mostra la pagina della nota (il frammento non conta: resta nell'esito, il nucleo lo toglie). */
test('BP-OSPITE-01 — corsia viva con la scheda della finestra: il testo reso, senza passare dal server', async () => {
    const browser = browserFinto([{ sessionId: 'altra' }, { sessionId: SCHEDA_DELLA_FINESTRA, url: 'https://example.org/a?b=1' }])
    const pubbliche = []
    const leggi = creaLeggiPaginaBrowser({ browserVivoFn: () => browser, leggiPaginaFn: async (u) => { pubbliche.push(u); return { corpo: 'x' } } })
    const r = await leggi({ pagina: { ...PAGINA, via: 'vivo' } })
    assert.deepEqual(r, { ok: true, url: 'https://example.org/a?b=1#dopo', titolo: 'Esempio', testo: 'TESTO RESO DAL BROWSER' })
    assert.deepEqual(browser.letture, [[SCHEDA_DELLA_FINESTRA, { guarda: 'text' }]])
    assert.equal(pubbliche.length, 0)
})

test('BP-OSPITE-02 — corsia viva senza la scheda, o una pagina in cornice: la copia pubblica, ripulita, senza credenziali né frammento', async () => {
    const browser = browserFinto([{ sessionId: 'altra' }])
    const pubbliche = []
    const html = '<!doctype html><html><head><title>t</title><style>.x{}</style><script>alert(1)</script></head><body><nav>menu</nav><p>Il paragrafo vero.</p></body></html>'
    const leggi = creaLeggiPaginaBrowser({ browserVivoFn: () => browser, leggiPaginaFn: async (u) => { pubbliche.push(u); return { url: u, corpo: html } } })
    const r = await leggi({ pagina: { url: 'https://anna:pw@example.org/a?b=1#sez', titolo: null, via: 'vivo' } })
    assert.deepEqual(pubbliche, ['https://example.org/a?b=1'])
    assert.equal(browser.letture.length, 0)
    assert.equal(r.ok, true)
    assert.equal(r.copiaPubblica, true)
    assert.equal(r.titolo, null)
    assert.match(r.testo, /Il paragrafo vero\./u)
    assert.doesNotMatch(r.testo, /alert\(1\)|<p>|\.x\{\}/u, 'come la vista Browser: niente sorgente')
    const testo = await creaLeggiPaginaBrowser({ leggiPaginaFn: async () => ({ corpo: 'solo testo, non html' }) })({ pagina: PAGINA })
    assert.equal(testo.testo, 'solo testo, non html')
    assert.equal(testo.url, PAGINA.url, 'senza indirizzo finale, quello riportato')
    /* un browser rotto non ferma la lettura: si passa alla copia pubblica */
    const rotto = await creaLeggiPaginaBrowser({ browserVivoFn: () => ({ stato: () => { throw new Error('morto') } }), leggiPaginaFn: async () => ({ corpo: 'ok' }) })({ pagina: { ...PAGINA, via: 'vivo' } })
    assert.equal(rotto.testo, 'ok')
})

test('BP-OSPITE-03 — rifiuti: nessuna pagina, rete locale (codici della politica di naviga), altri guasti col codice', async () => {
    const lancia = (msg) => creaLeggiPaginaBrowser({ leggiPaginaFn: async () => { throw new Error(msg) } })
    assert.deepEqual(await lancia('x')({ pagina: null }), { ok: false, motivo: MOTIVO_NESSUNA_PAGINA })
    assert.deepEqual(await lancia('x')({}), { ok: false, motivo: MOTIVO_NESSUNA_PAGINA })
    assert.deepEqual(await lancia('x')({ pagina: { url: '' } }), { ok: false, motivo: MOTIVO_NESSUNA_PAGINA })
    for (const codice of ['TALOS_WEB_URL_BLOCKED:hostname', 'TALOS_WEB_URL_BLOCKED:address', 'TALOS_WEB_URL_BLOCKED:port', 'TALOS_WEB_ADDRESS_NOT_PUBLIC']) {
        assert.deepEqual(await lancia(codice)({ pagina: PAGINA }), { ok: false, motivo: MOTIVO_PAGINA_LOCALE }, codice)
    }
    assert.match(MOTIVO_PAGINA_LOCALE, /use local_page\.$/u)
    assert.deepEqual(await lancia('TALOS_WEB_URL_BLOCKED:scheme')({ pagina: PAGINA }), { ok: false, motivo: 'The page could not be read: TALOS_WEB_URL_BLOCKED:scheme.' })
    assert.deepEqual(await lancia('TALOS_WEB_HTTP_404')({ pagina: PAGINA }), { ok: false, motivo: 'The page could not be read: TALOS_WEB_HTTP_404.' })
    const fermato = new AbortController()
    fermato.abort()
    await assert.rejects(lancia('x')({ pagina: PAGINA, segnale: fermato.signal }), { name: 'AbortError' })
})

test('BP-OSPITE-04 — il campo del compositore: nulla, una pagina pulita, oppure una forma sbagliata (undefined)', () => {
    assert.equal(paginaBrowserValida(null), null)
    assert.deepEqual(paginaBrowserValida({ url: 'https://e.com/', via: 'vivo' }), { url: 'https://e.com/', titolo: null, via: 'vivo' })
    assert.deepEqual(paginaBrowserValida({ url: 'HTTP://E.COM/x', titolo: 'T', via: 'proxy' }), { url: 'HTTP://E.COM/x', titolo: 'T', via: 'proxy' })
    const sbagliate = [
        undefined, 'https://e.com', [], 42,
        { url: 'https://e.com', via: 'vivo', testo: 'il testo della pagina NON si manda' },
        { url: 'ftp://e.com', via: 'vivo' }, { url: 'javascript:1', via: 'vivo' }, { url: 'https://', via: 'vivo' },
        { url: `https://e.com/${'x'.repeat(2048)}`, via: 'vivo' },
        { url: 'https://e.com', titolo: 'x'.repeat(301), via: 'vivo' }, { url: 'https://e.com', titolo: 3, via: 'vivo' },
        { url: 'https://e.com', via: 'altro' }, { url: 'https://e.com' }, { url: 7, via: 'vivo' },
    ]
    for (const s of sbagliate) assert.equal(paginaBrowserValida(s), undefined, JSON.stringify(s))
    assert.deepEqual(paginaBrowserValida({ url: `https://e.com/${'x'.repeat(2048 - 'https://e.com/'.length)}`, titolo: 'y'.repeat(300), via: 'cornice' })?.via, 'cornice', 'ai tetti esatti passa')
})

test('BP-OSPITE-05 — dove non c\'è Chromium (il telefono) l\'attrezzo non nasce; dove c\'è, sì; il guasto della ricerca vale «no»', async () => {
    assert.equal(leggiPaginaBrowserSeCeIlBrowser({ leggiPaginaFn: async () => ({}) }, { trovaFn: () => null }), null)
    assert.equal(leggiPaginaBrowserSeCeIlBrowser({ leggiPaginaFn: async () => ({}) }, { trovaFn: () => { throw new Error('no') } }), null)
    const fn = leggiPaginaBrowserSeCeIlBrowser({ leggiPaginaFn: async () => ({ corpo: 'c' }) }, { trovaFn: () => 'C:/chrome.exe' })
    assert.equal(typeof fn, 'function')
    assert.equal((await fn({ pagina: PAGINA })).testo, 'c')
})

test('BP-OSPITE-06 — revisione R-3: la scheda viva mostra un\'altra pagina ⇒ il suo testo non torna, si ripiega sulla copia pubblica della pagina detta', async () => {
    const pubbliche = []
    const leggiPaginaFn = async (u) => { pubbliche.push(u); return { corpo: 'COPIA PUBBLICA' } }
    const nota = { url: 'https://giornale.example/articolo?id=7#sopra', titolo: 'Articolo', via: 'vivo' }
    /* la scheda dice già un altro indirizzo: nessuna lettura */
    const altrove = browserFinto([{ sessionId: SCHEDA_DELLA_FINESTRA, url: 'https://banca.example/conto' }], 'SALDO 12345', 'https://banca.example/conto')
    const r1 = await creaLeggiPaginaBrowser({ browserVivoFn: () => altrove, leggiPaginaFn })({ pagina: nota })
    assert.equal(altrove.letture.length, 0, 'la pagina dell\'altra chat non si legge nemmeno')
    assert.deepEqual([r1.ok, r1.testo, r1.copiaPubblica], [true, 'COPIA PUBBLICA', true])
    assert.deepEqual(pubbliche, ['https://giornale.example/articolo?id=7'])
    /* la scheda cambia fra lo stato e la lettura: il testo letto non torna */
    const nelMezzo = browserFinto([{ sessionId: SCHEDA_DELLA_FINESTRA, url: 'https://giornale.example/articolo?id=7' }], 'SALDO 12345', 'https://banca.example/conto')
    const r2 = await creaLeggiPaginaBrowser({ browserVivoFn: () => nelMezzo, leggiPaginaFn })({ pagina: nota })
    assert.equal(nelMezzo.letture.length, 1)
    assert.deepEqual([r2.testo, r2.copiaPubblica], ['COPIA PUBBLICA', true])
    /* la stessa pagina con un altro parametro è un altro documento */
    const altroId = browserFinto([{ sessionId: SCHEDA_DELLA_FINESTRA }], 'POSTA DI UN ALTRO', 'https://giornale.example/articolo?id=8')
    const r3 = await creaLeggiPaginaBrowser({ browserVivoFn: () => altroId, leggiPaginaFn })({ pagina: nota })
    assert.deepEqual([r3.testo, r3.copiaPubblica], ['COPIA PUBBLICA', true])
    /* scheda senza indirizzo e lettura senza indirizzo: vale quello detto, si legge dal vivo */
    const muta = { stato: () => ({ schede: [{ sessionId: SCHEDA_DELLA_FINESTRA }] }), leggi: async () => ({ testo: 'VIVO' }) }
    const r4 = await creaLeggiPaginaBrowser({ browserVivoFn: () => muta, leggiPaginaFn })({ pagina: nota })
    assert.deepEqual([r4.testo, r4.copiaPubblica, r4.url], ['VIVO', undefined, nota.url])
    /* utente e password nell'indirizzo detto non contano per il confronto */
    const conCredenziali = browserFinto([{ sessionId: SCHEDA_DELLA_FINESTRA, url: 'https://giornale.example/articolo?id=7' }], 'VIVO', 'https://giornale.example/articolo?id=7')
    const r5 = await creaLeggiPaginaBrowser({ browserVivoFn: () => conCredenziali, leggiPaginaFn })({ pagina: { ...nota, url: 'https://anna:pw@giornale.example/articolo?id=7' } })
    assert.deepEqual([r5.testo, r5.copiaPubblica], ['VIVO', undefined])
    /* un indirizzo illeggibile nella scheda non è «la stessa pagina» */
    const rotta = browserFinto([{ sessionId: SCHEDA_DELLA_FINESTRA, url: 'non un indirizzo' }], 'SALDO', 'non un indirizzo')
    const r6 = await creaLeggiPaginaBrowser({ browserVivoFn: () => rotta, leggiPaginaFn })({ pagina: nota })
    assert.deepEqual([rotta.letture.length, r6.testo], [0, 'COPIA PUBBLICA'])
})
