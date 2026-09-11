/*
 * ⭐⭐⭐ LA SCHERMATA D'AVVIO — il ponte del tema e la vita del velo.
 *
 * ⛔⛔⛔ PERCHÉ È UN FILE E NON UNO SCRIPT INLINE, che sarebbe stato più comodo:
 *   `tests/ui-untrusted-content.test.mjs` vieta qualunque script con contenuto dentro
 *   `public/index.html` («static UI keeps the main security headers and never adds an inline
 *   script sink»). L'avevo scritto inline e quel cancello mi ha fermato — a ragione: un documento
 *   senza script inline è un documento dove un'iniezione non trova terreno, ed è la stessa
 *   disciplina per cui questo server manda `script-src 'self'` invece di `unsafe-inline`.
 *   Un file servito da noi soddisfa `'self'` e non apre niente.
 *
 * ⛔ Va caricato SINCRONO e PRIMA dei fogli di stile: niente `defer`, niente `async`. Tutto il suo
 *   valore sta nell'arrivare prima del primo disegno — un ponte del tema che arriva dopo è
 *   esattamente il lampo che deve togliere.
 */

/*
 * IL PONTE DEL TEMA.
 *
 * Trovato guardando la prima foto del velo: usciva CHIARO perché seguiva `prefers-color-scheme`,
 * mentre la app dell'owner è in tema scuro — un lampo BIANCO prima di una app scura, cioè peggio
 * dello scheletro che stava coprendo. Un velo che non conosce il tema non nasconde un difetto:
 * ne aggiunge uno.
 *
 * ⇒ Si legge la preferenza SALVATA e si stampa `data-theme` sulla radice, con la stessa regola di
 *   `applicaThemeDesktop` (app.js): `light` esplicito ⇒ chiaro; `dark` ⇒ scuro; `system` o assente
 *   ⇒ lo decide il sistema.
 * ⛔ Dentro un `try`: una preferenza illeggibile (finestra privata, dati puliti) non deve impedire
 *   l'avvio — si ripiega sul sistema, che è il default dichiarato.
 */
(function ponteDelTema() {
  var modo = 'system';
  try {
    var grezzo = window.localStorage.getItem('talos.harness.desktop.settings.v1');
    if (grezzo) {
      var salvato = JSON.parse(grezzo);
      modo = (salvato && salvato.appearance && salvato.appearance.colorMode) || 'system';
    }
  } catch (errore) { modo = 'system'; }
  var chiaro = modo === 'light' || (modo !== 'dark'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches);
  var radice = document.documentElement;
  if (chiaro) radice.setAttribute('data-theme', 'light');
  radice.style.setProperty('color-scheme', chiaro ? 'light' : 'dark');
}());

/*
 * LA VITA DEL VELO.
 *
 * ⛔ L'accensione comincia quando il thread principale è LIBERO, non al caricamento: le animazioni
 *   dentro un SVG non sono accelerate dal compositore e un long task del boot le inchioda —
 *   misurato sui pixel dipinti, un buco da 128 ms, mentre la stessa animazione da sola non ne ha
 *   nessuno.
 * ⛔ `requestIdleCallback` con un `timeout`: il timeout non è pessimismo, è la garanzia che su una
 *   macchina sempre occupata l'animazione parta lo stesso invece di non partire mai.
 * ⛔ Il minimo di permanenza si conta da quando l'animazione È PARTITA, non dal caricamento:
 *   contarlo dal caricamento taglierebbe la sequenza a metà proprio nei casi lenti, che sono
 *   quelli per cui il velo esiste.
 * ⛔ E c'è un tetto massimo: senza, una pagina che non arriva mai a `load` (una rete che pende, un
 *   errore precoce) lascerebbe il velo per sempre, e si guarderebbe un logo invece della app. Un
 *   velo che copre tutto ha bisogno di una via d'uscita che non dipenda da ciò che sta coprendo.
 */
function vitaDelVelo() {
  var MINIMO = 650;
  var MASSIMO = 4000;
  var USCITA = 320;
  var velo = document.getElementById('talosAvvio');
  if (!velo) return;
  var partita = 0;
  var tolto = false;

  function accendi() {
    if (partita) return;
    partita = Date.now();
    velo.setAttribute('data-anima', 'si');
  }

  function via() {
    if (tolto) return;
    tolto = true;
    velo.setAttribute('data-uscita', 'si');
    setTimeout(function () { if (velo.parentNode) velo.parentNode.removeChild(velo); }, USCITA);
  }

  function quandoPronta() {
    if (!partita) accendi();
    setTimeout(via, Math.max(0, MINIMO - (Date.now() - partita)));
  }

  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(accendi, { timeout: 400 });
  else setTimeout(accendi, 120);

  /* La app può chiamarlo appena ha finito il primo disegno: è la via più precisa. */
  window.__talosAvvioPronta = quandoPronta;
  if (document.readyState === 'complete') requestAnimationFrame(quandoPronta);
  else window.addEventListener('load', function () { requestAnimationFrame(quandoPronta); });
  setTimeout(via, MASSIMO);
}

/*
 * ⛔ Questo file gira nell'`<head>`, cioè PRIMA che il `<body>` esista: al momento in cui viene
 *   eseguito `document.getElementById('talosAvvio')` torna `null`. Difetto mio, trovato rileggendo
 *   l'ordine e non da un errore — sarebbe stato silenzioso: nessuna eccezione, semplicemente il
 *   velo non se ne sarebbe mai andato.
 * ⇒ Il ponte del tema deve stare nell'head (deve arrivare prima del primo disegno); la vita del
 *   velo aspetta che il suo elemento esista.
 */
if (document.getElementById('talosAvvio')) vitaDelVelo();
else document.addEventListener('DOMContentLoaded', vitaDelVelo, { once: true });
