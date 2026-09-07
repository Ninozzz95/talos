import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decidiVia,
  dietroLogin,
  indirizzoLocale,
  bersaglioAmmesso,
  intestazioniDaTogliere,
  senzaFrameAncestors,
  permettiScriptDa,
  riscriviHtml,
  urlProxato,
  leggiPagina,
  creaServerProxy,
  INTESTAZIONI_MAI_INOLTRATE,
} from '../src/browser-proxy-universale.mjs';

/*
 * M3 (07/09/2026) — il proxy universale su ORIGINE SEPARATA: la corsia veloce del
 * Browser per le pagine che vietano la cornice.
 *
 * ⛔ Ogni prova ha la sua METÀ AL CONTRARIO: non basta che un cancello respinga,
 * deve anche LASCIAR PASSARE dove non c'è niente da respingere. Un cancello che
 * non ha mai fatto passare nessuno è chiuso, non è un cancello.
 */

const intestazioniGet = (obj) => ({ get: (k) => obj[String(k).toLowerCase()] ?? null });

/* ─────────────── decidiVia ─────────────── */

test('VIA-01 — la pagina che si lascia incorniciare resta nella CORNICE, anche con proxy e browser vero pronti (la via più economica vince)', () => {
  const dentro = decidiVia({ incorniciabile: true, url: 'https://example.org/', proxyDisponibile: true, vivoDisponibile: true });
  assert.equal(dentro.via, 'cornice');
  assert.match(dentro.perche, /economica/i);
  // AL CONTRARIO: la stessa pagina che NON si lascia incorniciare non resta nella cornice
  const fuori = decidiVia({ incorniciabile: false, motivo: 'X-Frame-Options: DENY', url: 'https://example.org/', proxyDisponibile: true, vivoDisponibile: true });
  assert.notEqual(fuori.via, 'cornice');
});

test('VIA-02 — vietata la cornice e proxy acceso: si passa dal PROXY, e il perché porta con sé il motivo misurato', () => {
  const scelta = decidiVia({ incorniciabile: false, motivo: 'X-Frame-Options: DENY', url: 'https://github.com/anthropics', proxyDisponibile: true });
  assert.equal(scelta.via, 'proxy');
  assert.match(scelta.perche, /X-Frame-Options: DENY/);
  assert.match(scelta.perche, /origine separata/i);
});

test('VIA-03 — senza proxy si va al BROWSER VERO; senza nessuno dei due resta la cornice, dicendo che resterà vuota', () => {
  const vivo = decidiVia({ incorniciabile: false, motivo: 'frame-ancestors', url: 'https://github.com/', proxyDisponibile: false, vivoDisponibile: true });
  assert.equal(vivo.via, 'vivo');
  // AL CONTRARIO: se non c'è né proxy né browser vero non si inventa una corsia
  const niente = decidiVia({ incorniciabile: false, motivo: 'frame-ancestors', url: 'https://github.com/', proxyDisponibile: false, vivoDisponibile: false });
  assert.equal(niente.via, 'cornice');
  assert.match(niente.perche, /vuota/i);
});

test('VIA-04 — dietro accesso si sceglie il BROWSER VERO anche col proxy acceso: il proxy non inoltra i cookie', () => {
  const daPercorso = decidiVia({ incorniciabile: false, url: 'https://github.com/login', proxyDisponibile: true, vivoDisponibile: true });
  assert.equal(daPercorso.via, 'vivo');
  const daMotivo = decidiVia({ incorniciabile: false, motivo: 'La pagina risponde 401', url: 'https://api.esempio.it/dati', proxyDisponibile: true, vivoDisponibile: true });
  assert.equal(daMotivo.via, 'vivo');
  // AL CONTRARIO: una pagina pubblica con le stesse disponibilità va al proxy, non al browser vero
  assert.equal(decidiVia({ incorniciabile: false, url: 'https://github.com/anthropics/claude-code', proxyDisponibile: true, vivoDisponibile: true }).via, 'proxy');
  // e senza browser vero il proxy la mostra lo stesso, dicendo che sarà la vista di chi non ha fatto l'accesso
  const ripiego = decidiVia({ incorniciabile: false, url: 'https://github.com/login', proxyDisponibile: true, vivoDisponibile: false });
  assert.equal(ripiego.via, 'proxy');
  assert.match(ripiego.perche, /accesso/i);
});

test('VIA-05 — un indirizzo privato non lo tocca il proxy, ma il browser vero gira sul computer e ci arriva', () => {
  const conVivo = decidiVia({ incorniciabile: false, url: 'http://localhost:5173/', proxyDisponibile: true, vivoDisponibile: true });
  assert.equal(conVivo.via, 'vivo');
  assert.match(conVivo.perche, /privati/i);
  // AL CONTRARIO: senza browser vero non si ripiega sul proxy — l'indirizzo privato resta fuori
  const senzaVivo = decidiVia({ incorniciabile: false, url: 'http://localhost:5173/', proxyDisponibile: true, vivoDisponibile: false });
  assert.equal(senzaVivo.via, 'cornice');
  // uno schema che non è http/https non lo migliora nessuna corsia
  assert.equal(decidiVia({ incorniciabile: false, url: 'file:///C:/x.html', proxyDisponibile: true, vivoDisponibile: true }).via, 'cornice');
});

test('VIA-06 — dietroLogin riconosce percorso, host e motivo; e NON accusa una pagina qualunque', () => {
  assert.equal(dietroLogin({ url: 'https://sito.it/accedi' }), true);
  assert.equal(dietroLogin({ url: 'https://accounts.google.com/o/oauth2/v2/auth' }), true);
  assert.equal(dietroLogin({ url: 'https://sito.it/x', motivo: 'risposta 403' }), true);
  // AL CONTRARIO: nessun falso positivo su parole che contengono i segni ma non sono login
  assert.equal(dietroLogin({ url: 'https://sito.it/blog/authorship-e-git' }), false);
  assert.equal(dietroLogin({ url: 'https://sito.it/prodotti/sessione-fotografica' }), false);
  assert.equal(dietroLogin({ url: 'non-un-url' }), false);
});

/* ─────────────── SSRF ─────────────── */

test('SSRF-01 — loopback, reti private, link-local e multicast si rifiutano; un indirizzo pubblico passa', () => {
  const rifiutati = ['http://127.0.0.1:4174/', 'http://localhost/', 'http://dev.localhost/', 'http://10.1.2.3/', 'http://172.16.0.9/', 'http://192.168.1.10/', 'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://239.1.1.1/', 'http://[::1]/', 'http://[fe80::1]/', 'http://[fd00::1]/', 'http://stampante.local/'];
  for (const indirizzo of rifiutati) {
    const esito = bersaglioAmmesso(new URL(indirizzo));
    assert.equal(esito.ok, false, `doveva rifiutare ${indirizzo}`);
    assert.equal(esito.locale, true, `${indirizzo} è privato, non malformato`);
  }
  // AL CONTRARIO: gli indirizzi pubblici passano davvero — un cancello sempre chiuso non è un cancello
  for (const indirizzo of ['https://github.com/', 'http://example.org/x?y=1', 'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/']) {
    assert.deepEqual(bersaglioAmmesso(new URL(indirizzo)), { ok: true }, `doveva ammettere ${indirizzo}`);
  }
});

test('SSRF-02 — l\'IPv4 travestito da IPv6 è lo stesso bersaglio: [::ffff:169.254.169.254] si rifiuta come 169.254.169.254', () => {
  const mascherato = bersaglioAmmesso(new URL('http://[::ffff:169.254.169.254]/latest/meta-data/'));
  assert.equal(mascherato.ok, false);
  assert.match(mascherato.motivo, /link-local/i);
  assert.match(String(indirizzoLocale('[::ffff:7f00:1]')), /loopback/i);
  // AL CONTRARIO: un IPv6 pubblico che comincia per «f» non viene scambiato per rete locale
  assert.equal(indirizzoLocale('[2a00:1450:4001:80f::200e]'), null);
  assert.equal(indirizzoLocale('[fe00::1]'), null);
});

test('SSRF-03 — le regole ereditate da browser-frame.mjs restano: niente schemi diversi da http/https, niente credenziali nell\'indirizzo', () => {
  assert.equal(bersaglioAmmesso(new URL('file:///C:/segreti.txt')).ok, false);
  assert.equal(bersaglioAmmesso(new URL('https://tizio:parola@example.org/')).ok, false);
  // AL CONTRARIO: lo stesso indirizzo senza credenziali passa
  assert.equal(bersaglioAmmesso(new URL('https://example.org/')).ok, true);
});

/* ─────────────── intestazioni ─────────────── */

test('CSP-01 — si toglie la SOLA direttiva frame-ancestors, il resto della politica resta intero', () => {
  const dentro = senzaFrameAncestors("default-src 'self'; frame-ancestors 'none'; script-src 'self' https://cdn.it");
  assert.equal(dentro.tolta, true);
  assert.equal(dentro.csp, "default-src 'self'; script-src 'self' https://cdn.it");
  // più politiche in una sola intestazione: si trattano una per una
  const doppia = senzaFrameAncestors("frame-ancestors 'none'; img-src *, default-src 'self'");
  assert.equal(doppia.csp, "img-src *, default-src 'self'");
  // AL CONTRARIO: una CSP senza frame-ancestors non si tocca e non dichiara di aver tolto niente
  const intatta = senzaFrameAncestors("default-src 'self'; script-src 'self'");
  assert.deepEqual([intatta.csp, intatta.tolta], ["default-src 'self'; script-src 'self'", false]);
});

test('CSP-02 — l\'origine del proxy si AGGIUNGE alle sorgenti di script, senza toccare le altre direttive', () => {
  const conScript = permettiScriptDa("default-src 'self'; script-src 'self'; img-src *", 'http://127.0.0.2:4301/s/abc');
  assert.equal(conScript, "default-src 'self'; script-src 'self' http://127.0.0.2:4301; img-src *");
  // senza script-src si copia default-src invece di allargarlo: nient'altro cambia
  const soloDefault = permettiScriptDa("default-src 'self'", 'http://127.0.0.2:4301');
  assert.equal(soloDefault, "default-src 'self'; script-src 'self' http://127.0.0.2:4301");
  // anche script-src-elem, che ha la precedenza su script-src
  assert.match(permettiScriptDa("script-src-elem 'self'", 'http://127.0.0.2:4301'), /script-src-elem 'self' http:\/\/127\.0\.0\.2:4301/);
  // AL CONTRARIO: una politica vuota resta vuota, e l'origine non si aggiunge due volte
  assert.equal(permettiScriptDa('', 'http://127.0.0.2:4301'), '');
  assert.equal(permettiScriptDa("script-src http://127.0.0.2:4301", 'http://127.0.0.2:4301'), 'script-src http://127.0.0.2:4301');
});

test('INT-01 — via X-Frame-Options, via i cookie del sito e le politiche che parlano della NOSTRA origine; la CSP resta, senza frame-ancestors', () => {
  const { tolte, tenute } = intestazioniDaTogliere({
    'content-type': 'text/html; charset=utf-8',
    'x-frame-options': 'DENY',
    'set-cookie': 'sessione=abc; HttpOnly',
    'strict-transport-security': 'max-age=63072000',
    'cross-origin-resource-policy': 'same-origin',
    'content-encoding': 'gzip',
    'content-length': '12345',
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
  });
  for (const nome of ['x-frame-options', 'set-cookie', 'strict-transport-security', 'cross-origin-resource-policy', 'content-encoding', 'content-length']) {
    assert.ok(tolte.includes(nome), `${nome} doveva essere tolta`);
    assert.equal(tenute[nome], undefined, `${nome} non doveva restare`);
  }
  assert.equal(tenute['content-security-policy'], "default-src 'self'");
  assert.ok(tolte.includes('content-security-policy: frame-ancestors'));
  // AL CONTRARIO: quello che non fa male resta — un proxy che ripulisce tutto è un proxy che rompe le pagine
  assert.equal(tenute['content-type'], 'text/html; charset=utf-8');
  assert.equal(tenute['x-content-type-options'], 'nosniff');
});

test('INT-02 — una CSP fatta di sola frame-ancestors sparisce del tutto; e le intestazioni si leggono anche da Headers e dalla forma {get}', () => {
  const solo = intestazioniDaTogliere({ 'content-security-policy': "frame-ancestors 'none'" });
  assert.equal(solo.tenute['content-security-policy'], undefined);
  assert.ok(solo.tolte.includes('content-security-policy'));
  // stessa risposta partendo da Headers veri
  const daHeaders = intestazioniDaTogliere(new Headers({ 'x-frame-options': 'SAMEORIGIN', 'content-type': 'text/html' }));
  assert.deepEqual([daHeaders.tolte, daHeaders.tenute['content-type']], [['x-frame-options'], 'text/html']);
  // e dalla forma {get} usata dai test di browser-frame.mjs
  const daGet = intestazioniDaTogliere(intestazioniGet({ 'content-type': 'text/html', 'x-frame-options': 'DENY' }));
  assert.ok(daGet.tolte.includes('x-frame-options') && daGet.tenute['content-type'] === 'text/html');
  // AL CONTRARIO: senza niente da togliere l'elenco delle tolte è vuoto
  assert.deepEqual(intestazioniDaTogliere({ 'content-type': 'text/html' }), { tolte: [], tenute: { 'content-type': 'text/html' } });
  assert.ok(INTESTAZIONI_MAI_INOLTRATE.includes('set-cookie'));
});

/* ─────────────── il documento ─────────────── */

test('HTML-01 — base sull\'origine vera e overlay in testa; una base già presente non si duplica e una pagina senza head non si perde', () => {
  const out = riscriviHtml('<!doctype html><html><head><title>x</title></head><body>ciao</body></html>', { urlPagina: 'https://github.com/anthropics/', origineProxy: 'http://127.0.0.2:4301/s/abc' });
  assert.ok(out.includes('<head><base href="https://github.com/anthropics/">'));
  assert.ok(out.includes('<script src="http://127.0.0.2:4301/s/abc/annota.js" data-talos-url="https://github.com/anthropics/"></script><title>'));
  // AL CONTRARIO: la base della pagina comanda, non la nostra
  const conBase = riscriviHtml('<html><head><base href="/statico/"></head></html>', { urlPagina: 'https://sito.it/a/b' });
  assert.equal((conBase.match(/<base\b/g) || []).length, 1);
  assert.ok(conBase.includes('<base href="/statico/">'));
  // senza head il head si crea; senza html nemmeno il documento si perde
  assert.ok(riscriviHtml('<html><body>solo</body></html>', { urlPagina: 'https://sito.it/' }).includes('<html><head><base href="https://sito.it/"></head>'));
  assert.ok(riscriviHtml('<p>frammento</p>', { urlPagina: 'https://sito.it/' }).includes('<p>frammento</p>'));
});

test('HTML-02 — integrity si TIENE e si accompagna a crossorigin: cambiando origine, senza CORS il browser bloccherebbe lo script', () => {
  const html = '<html><head><script src="/a.js" integrity="sha384-AAA"></script><link rel="stylesheet" href="/a.css" integrity="sha384-BBB"/></head></html>';
  const out = riscriviHtml(html, { urlPagina: 'https://sito.it/', origineProxy: 'http://127.0.0.2:4301/s/abc' });
  assert.ok(out.includes('<script src="/a.js" integrity="sha384-AAA" crossorigin="anonymous">'));
  assert.ok(out.includes('integrity="sha384-BBB" crossorigin="anonymous" />'));
  assert.equal((out.match(/integrity=/g) || []).length, 2, 'le impronte non si tolgono mai');
  // AL CONTRARIO: chi non ha integrity non riceve crossorigin, e chi ce l'ha già non lo riceve due volte
  const senza = riscriviHtml('<html><head><script src="/b.js"></script><script src="/c.js" integrity="sha384-C" crossorigin="use-credentials"></script></head></html>', { urlPagina: 'https://sito.it/' });
  assert.ok(senza.includes('<script src="/b.js"></script>'));
  assert.equal((senza.match(/crossorigin/g) || []).length, 1);
  assert.ok(senza.includes('crossorigin="use-credentials"'));
});

test('HTML-03 — nel meta CSP sparisce solo frame-ancestors e si aggiunge l\'origine del proxy; il resto della politica resta a difendere la pagina', () => {
  const html = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; frame-ancestors \'none\'"><title>t</title></head></html>';
  const out = riscriviHtml(html, { urlPagina: 'https://sito.it/', origineProxy: 'http://127.0.0.2:4301/s/abc' });
  assert.ok(!/frame-ancestors/i.test(out), 'frame-ancestors doveva sparire dal meta');
  assert.ok(out.includes(`content="default-src 'self'; script-src 'self' http://127.0.0.2:4301"`), `meta CSP riscritto male: ${out}`);
  assert.ok(/<meta http-equiv="Content-Security-Policy"/i.test(out), 'il meta CSP resta: buttarlo toglierebbe ogni difesa a una pagina non affidabile');
  // AL CONTRARIO: un meta che non è una CSP non si tocca
  const altro = riscriviHtml('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head></html>', { urlPagina: 'https://sito.it/' });
  assert.ok(altro.includes('<meta charset="utf-8">') && altro.includes('content="width=device-width"'));
});

test('URL-01 — urlProxato costruisce il link e rifiuta i bersagli che il proxy non tocca', () => {
  assert.equal(urlProxato('http://127.0.0.2:4301/s/abc/', 'https://github.com/a?b=1&c=2'), 'http://127.0.0.2:4301/s/abc/vai?u=https%3A%2F%2Fgithub.com%2Fa%3Fb%3D1%26c%3D2');
  // AL CONTRARIO: niente link per ciò che il proxy rifiuterebbe comunque — meglio un errore che un indirizzo che dà 403
  assert.throws(() => urlProxato('http://127.0.0.2:4301/s/abc', 'http://169.254.169.254/'), /link-local/i);
  assert.throws(() => urlProxato('http://127.0.0.2:4301/s/abc', 'file:///C:/x'), /http/i);
  assert.throws(() => urlProxato('non-una-origine', 'https://github.com/'), /Origine del proxy non valida/);
});

/* ─────────────── chi va a prendere la pagina ─────────────── */

test('LEGGI-01 — i reindirizzamenti si seguono a mano e OGNI salto si ricontrolla: un 302 verso 169.254.169.254 non parte', async () => {
  const chiamate = [];
  const fetchFinto = async (url) => {
    chiamate.push(url);
    if (url === 'https://sito.it/') return { status: 302, headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }), body: { cancel: async () => {} } };
    throw new Error('non doveva arrivare qui');
  };
  const esito = await leggiPagina('https://sito.it/', { fetchFn: fetchFinto });
  assert.equal(esito.ok, false);
  assert.match(esito.motivo, /link-local/i);
  assert.deepEqual(chiamate, ['https://sito.it/'], 'il secondo salto non doveva partire');
  // AL CONTRARIO: un reindirizzamento verso un indirizzo pubblico si segue fino in fondo
  const buono = async (url) => (url === 'https://sito.it/'
    ? { status: 301, headers: new Headers({ location: 'https://sito.it/nuova' }), body: { cancel: async () => {} } }
    : { status: 200, headers: new Headers({ 'content-type': 'text/html' }), text: async () => '<html><body>ok</body></html>' });
  const arrivato = await leggiPagina('https://sito.it/', { fetchFn: buono });
  assert.deepEqual([arrivato.ok, arrivato.url, arrivato.corpo], [true, 'https://sito.it/nuova', '<html><body>ok</body></html>']);
});

test('LEGGI-02 — niente credenziali e niente cookie nella richiesta; e un tipo che non è HTML torna senza corpo', async () => {
  let opzioni = null;
  const esito = await leggiPagina('https://sito.it/', {
    fetchFn: async (_url, o) => { opzioni = o; return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), text: async () => '<p>x</p>' }; },
  });
  assert.equal(esito.ok, true);
  assert.equal(opzioni.credentials, 'omit');
  assert.equal(opzioni.redirect, 'manual');
  assert.equal(opzioni.headers.cookie, undefined);
  assert.equal(opzioni.headers.authorization, undefined);
  // AL CONTRARIO (l'altro ramo): un CSS torna ok ma senza corpo, e il server lo rifiuterà con 415
  const css = await leggiPagina('https://sito.it/a.css', { fetchFn: async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/css' }), body: { cancel: async () => {} } }) });
  assert.deepEqual([css.ok, css.corpo, css.tipo], [true, '', 'text/css']);
});

/* ─────────────── il server ─────────────── */

async function proxyDiProva(t, leggi, extra = {}) {
  const srv = await creaServerProxy({ leggi, chiave: 'chiavediprova', origineOspite: 'http://127.0.0.1:4174', ...extra });
  t.after(() => srv.chiudi());
  return srv;
}

const paginaFinta = async () => ({
  ok: true,
  url: 'https://github.com/anthropics',
  stato: 200,
  tipo: 'text/html; charset=utf-8',
  intestazioni: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'set-cookie': 'sessione=abc', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" },
  corpo: '<html><head><title>Repo</title></head><body>ciao</body></html>',
});

test('SERVER-01 — il proxy vive su una PORTA SUA e, dove si può, su un OSPITE suo: la pagina torna riscritta, senza X-Frame-Options e senza i cookie del sito', async (t) => {
  const srv = await proxyDiProva(t, paginaFinta);
  assert.ok(srv.porta > 0);
  assert.ok(srv.origine.startsWith(`http://${srv.ospite}:${srv.porta}/s/chiavediprova`));
  if (srv.cookieCondiviso) assert.equal(srv.ospite, '127.0.0.1');
  else assert.equal(srv.ospite, '127.0.0.2', 'ospite separato: host diverso, barattolo di cookie diverso da TALOS');

  const risposta = await fetch(`${srv.origine}/vai?u=${encodeURIComponent('https://github.com/anthropics')}`);
  assert.equal(risposta.status, 200);
  assert.equal(risposta.headers.get('x-frame-options'), null);
  assert.equal(risposta.headers.get('set-cookie'), null);
  assert.match(String(risposta.headers.get('x-talos-tolte')), /x-frame-options/);
  const csp = String(risposta.headers.get('content-security-policy') || '');
  assert.ok(!/frame-ancestors 'none'/.test(csp), 'la direttiva che vieta la cornice se ne va');
  assert.ok(/default-src 'self'/.test(csp), 'il resto della politica del sito resta in piedi');
  assert.ok(csp.includes("frame-ancestors 'self' http://127.0.0.1:4174"), 'la nostra politica dice chi può incorniciare');
  const html = await risposta.text();
  assert.ok(html.includes('<base href="https://github.com/anthropics">'));
  assert.ok(html.includes(`${srv.origine}/annota.js`));
});

test('SERVER-02 — l\'overlay lo serve il proxy stesso, mai TALOS: una richiesta verso 4174 partirebbe col cookie di sessione', async (t) => {
  const srv = await proxyDiProva(t, paginaFinta);
  const js = await fetch(`${srv.origine}/annota.js`);
  assert.equal(js.status, 200);
  assert.match(String(js.headers.get('content-type')), /javascript/);
  assert.match(await js.text(), /browser-proxy/);
});

test('SERVER-03 — i quattro rifiuti: chiave sbagliata 404, metodo diverso da GET 405, bersaglio privato 403 (e il lettore non viene nemmeno chiamato), tipo non HTML 415', async (t) => {
  let chiamato = 0;
  const srv = await proxyDiProva(t, async (url) => { chiamato += 1; return url.includes('css') ? { ok: true, url, tipo: 'text/css', intestazioni: {}, corpo: 'body{}' } : paginaFinta(); });
  const base = `http://${srv.ospite}:${srv.porta}`;

  assert.equal((await fetch(`${base}/s/chiavesbagliata/vai?u=https%3A%2F%2Fgithub.com%2F`)).status, 404);
  assert.equal((await fetch(`${srv.origine}/vai?u=https%3A%2F%2Fgithub.com%2F`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${srv.origine}/vai`)).status, 400);

  const privato = await fetch(`${srv.origine}/vai?u=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
  assert.equal(privato.status, 403);
  assert.match(await privato.text(), /link-local/i);
  assert.equal(chiamato, 0, 'un bersaglio privato si ferma PRIMA di andare in rete');

  const css = await fetch(`${srv.origine}/vai?u=${encodeURIComponent('https://sito.it/a.css')}`);
  assert.equal(css.status, 415);
  // AL CONTRARIO: la richiesta giusta, con la chiave giusta, passa
  assert.equal((await fetch(`${srv.origine}/vai?u=${encodeURIComponent('https://github.com/anthropics')}`)).status, 200);
});

test('SERVER-04 — un sito che non risponde diventa 502, e dopo chiudi() il proxy non risponde più', async (t) => {
  const srv = await creaServerProxy({ leggi: async () => { throw new Error('rete giù'); }, chiave: 'chiavediprova' });
  const rotto = await fetch(`${srv.origine}/vai?u=${encodeURIComponent('https://github.com/')}`);
  assert.equal(rotto.status, 502);
  await srv.chiudi();
  await assert.rejects(fetch(`${srv.origine}/vai?u=${encodeURIComponent('https://github.com/')}`), 'chiuso vuol dire chiuso');
  t.diagnostic(`proxy provato su ${srv.origine}`);
});

test('SERVER-05 — senza «leggi» il proxy non si accende: chi lo chiama deve dire chi va a prendere la pagina', async () => {
  await assert.rejects(() => creaServerProxy({}), /leggi/);
});
