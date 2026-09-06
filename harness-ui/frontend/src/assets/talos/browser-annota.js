/*
 * browser-annota.js — l'overlay di annotazione DENTRO la pagina proxata (Browser oltre Hermes,
 * 06/09). Iniettato per primo nel <head> dal proxy locale di TALOS: cattura gli errori di console
 * prima degli script della pagina, poi, quando il genitore lo accende, evidenzia l'elemento sotto
 * il mouse e al clic manda al genitore un FATTO verificabile sull'elemento: selettore stabile,
 * tag, testo, HTML, stili calcolati che contano, posizione, catena degli antenati, indizi sul
 * sorgente (Vue: `__vueParentComponent.type.__file`, `data-v-inspector`; React ≤18: `_debugSource`,
 * nome del componente), e gli errori di console della pagina.
 *
 * Hermes (`lib/preview-annotate/in-page.ts`) manda selettore, testo e un ritaglio dell'immagine;
 * qui l'agente riceve la struttura: è il «+1» di questo blocco.
 *
 * Nessuna dipendenza, nessuno stile esterno: tutto in linea perché la pagina ospite può avere
 * qualunque CSS. Comunica solo col genitore (postMessage) e solo se è quello che l'ha aperta.
 */
(function () {
  'use strict';
  if (window.__talosAnnota) return;
  var TAG = 'talos-annota';
  var genitore = window.parent && window.parent !== window ? window.parent : null;
  var urlDichiarato = (document.currentScript && document.currentScript.getAttribute('data-talos-url')) || location.href;
  var errori = [];
  var MAX_ERRORI = 20;

  function registraErrore(tipo, testo) {
    if (errori.length >= MAX_ERRORI) return;
    errori.push({ tipo: tipo, testo: String(testo).slice(0, 300), quando: new Date().toISOString() });
    manda({ tipo: 'errore', errore: errori[errori.length - 1] });
  }
  var consoleError = console.error;
  console.error = function () { try { registraErrore('console', Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : (a && a.message) || JSON.stringify(a); }).join(' ')); } catch (e) { /* mai rompere la pagina */ } return consoleError.apply(console, arguments); };
  window.addEventListener('error', function (e) { registraErrore('eccezione', (e.message || 'errore') + (e.filename ? ' — ' + e.filename + ':' + e.lineno : '')); });
  window.addEventListener('unhandledrejection', function (e) { registraErrore('promessa', (e.reason && (e.reason.message || String(e.reason))) || 'rifiuto non gestito'); });

  function manda(messaggio) {
    if (!genitore) return;
    try { genitore.postMessage(Object.assign({ fonte: TAG, url: location.href }, messaggio), '*'); } catch (e) { /* genitore chiuso */ }
  }

  /* ---- selettore stabile: id → data-testid/data-test/data-cy → name/aria-label → classi stabili → catena nth-of-type ---- */
  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1'); }
  function unico(sel, el) { try { var t = document.querySelectorAll(sel); return t.length === 1 && t[0] === el; } catch (e) { return false; } }
  function classeStabile(c) { return /^[a-zA-Z][a-zA-Z0-9_-]{2,40}$/.test(c) && !/\d{3,}|[a-f0-9]{6,}|^(css|sc|jsx|svelte|emotion)-/.test(c); }
  function pezzo(el) {
    var tag = el.tagName.toLowerCase();
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) { var s = '#' + cssEscape(el.id); if (unico(s, el)) return { sel: s, assoluto: true }; }
    var attrs = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'aria-label'];
    for (var i = 0; i < attrs.length; i++) { var v = el.getAttribute(attrs[i]); if (v) { var sa = tag + '[' + attrs[i] + '="' + v.replace(/"/g, '\\"') + '"]'; if (unico(sa, el)) return { sel: sa, assoluto: true }; } }
    var classi = Array.prototype.filter.call(el.classList || [], classeStabile).slice(0, 2);
    var base = tag + classi.map(function (c) { return '.' + cssEscape(c); }).join('');
    var genitoreEl = el.parentElement;
    if (genitoreEl) {
      var fratelli = Array.prototype.filter.call(genitoreEl.children, function (f) { return f.tagName === el.tagName; });
      if (fratelli.length > 1) base += ':nth-of-type(' + (fratelli.indexOf(el) + 1) + ')';
    }
    return { sel: base, assoluto: false };
  }
  function selettore(el) {
    var parti = []; var corrente = el; var profondita = 0;
    while (corrente && corrente.nodeType === 1 && corrente !== document.documentElement && profondita < 12) {
      var p = pezzo(corrente); parti.unshift(p.sel);
      var candidato = parti.join(' > ');
      if (p.assoluto || unico(candidato, el)) return candidato;
      corrente = corrente.parentElement; profondita++;
    }
    return parti.join(' > ');
  }

  /* ---- indizi sul sorgente: dichiarati solo quando esistono davvero ---- */
  function sorgente(el) {
    var indizi = {};
    var e = el;
    for (var i = 0; i < 6 && e; i++) {
      var vi = e.getAttribute && (e.getAttribute('data-v-inspector') || e.getAttribute('data-source') || e.getAttribute('data-loc'));
      if (vi && !indizi.file) indizi.file = vi;
      var vue = e.__vueParentComponent || e.__vue_app__ && null;
      if (vue && vue.type) { if (!indizi.componente) indizi.componente = vue.type.name || vue.type.__name || null; if (!indizi.file && vue.type.__file) indizi.file = vue.type.__file; }
      for (var k in e) {
        if (k.indexOf('__reactFiber$') === 0) {
          var fibra = e[k];
          for (var j = 0; j < 8 && fibra; j++) {
            if (fibra._debugSource && !indizi.file) indizi.file = fibra._debugSource.fileName + ':' + fibra._debugSource.lineNumber;
            if (fibra.type && typeof fibra.type === 'function' && !indizi.componente) indizi.componente = fibra.type.displayName || fibra.type.name || null;
            fibra = fibra._debugOwner || fibra.return;
          }
        }
      }
      e = e.parentElement;
    }
    var framework = null;
    if (document.querySelector('script[src*="/@vite/client"]') || window.__vite_plugin_react_preamble_installed__) framework = 'Vite';
    if (window.__NEXT_DATA__) framework = 'Next.js';
    if (window.__NUXT__) framework = 'Nuxt';
    if (window.__svelte || document.querySelector('[class*="svelte-"]')) framework = framework || 'Svelte';
    if (framework) indizi.framework = framework;
    return indizi;
  }

  var STILI = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'border', 'border-radius', 'opacity', 'z-index'];
  function stiliCalcolati(el) {
    var cs = getComputedStyle(el); var out = {};
    for (var i = 0; i < STILI.length; i++) { var v = cs.getPropertyValue(STILI[i]); if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'static') out[STILI[i]] = v; }
    return out;
  }
  function testoDi(el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200); }
  function htmlDi(el) { var h = el.outerHTML || ''; return h.length > 800 ? h.slice(0, 800) + '…' : h; }
  function antenati(el) { var a = []; var e = el.parentElement; while (e && e !== document.documentElement && a.length < 8) { a.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')); e = e.parentElement; } return a; }

  function fatto(el) {
    var r = el.getBoundingClientRect();
    return {
      selettore: selettore(el), tag: el.tagName.toLowerCase(), testo: testoDi(el), html: htmlDi(el),
      stili: stiliCalcolati(el), rect: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), larghezza: Math.round(r.width), altezza: Math.round(r.height) },
      antenati: antenati(el), sorgente: sorgente(el), pagina: { url: location.href, titolo: document.title, urlDichiarato: urlDichiarato },
      errori: errori.slice(),
    };
  }

  /* ---- overlay ---- */
  var attivo = false; var evidenza = null; var spilli = [];
  function creaEvidenza() {
    evidenza = document.createElement('div');
    evidenza.setAttribute('data-' + TAG, 'evidenza');
    evidenza.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483646;border:2px solid #c08b3c;background:rgba(192,139,60,.12);border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.35);transition:all 60ms ease;display:none';
    document.documentElement.appendChild(evidenza);
  }
  function muoviEvidenza(el) {
    if (!evidenza) creaEvidenza();
    var r = el.getBoundingClientRect();
    evidenza.style.display = 'block';
    evidenza.style.left = (r.left + window.scrollX) + 'px'; evidenza.style.top = (r.top + window.scrollY) + 'px';
    evidenza.style.width = r.width + 'px'; evidenza.style.height = r.height + 'px';
  }
  function bersaglio(e) { var el = document.elementFromPoint(e.clientX, e.clientY); while (el && el.getAttribute && el.getAttribute('data-' + TAG)) el = el.parentElement; return el && el.nodeType === 1 && el !== document.documentElement && el !== document.body ? el : null; }
  function suMossa(e) { if (!attivo) return; var el = bersaglio(e); if (el) muoviEvidenza(el); }
  function suClic(e) {
    if (!attivo) return;
    e.preventDefault(); e.stopPropagation();
    var el = bersaglio(e); if (!el) return;
    var f = fatto(el);
    var n = spilli.length + 1;
    var spillo = document.createElement('div');
    spillo.setAttribute('data-' + TAG, 'spillo');
    spillo.textContent = String(n);
    spillo.style.cssText = 'position:absolute;z-index:2147483647;left:' + (f.rect.x - 10) + 'px;top:' + (f.rect.y - 10) + 'px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c08b3c;color:#fff;font:600 12px/20px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.4);pointer-events:none';
    document.documentElement.appendChild(spillo);
    spilli.push({ el: el, spillo: spillo });
    manda({ tipo: 'elemento', numero: n, fatto: f });
  }
  function suTasto(e) { if (attivo && e.key === 'Escape') { e.preventDefault(); manda({ tipo: 'esc' }); } }
  function suLink(e) {
    // dentro il proxy la navigazione resta nel proxy: il genitore riapre l'indirizzo nuovo
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || attivo) return;
    var href = a.getAttribute('href'); if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
    var assoluto; try { assoluto = new URL(href, urlDichiarato).href; } catch (er) { return; }
    e.preventDefault(); manda({ tipo: 'naviga', url: assoluto });
  }
  function accendi() { attivo = true; document.documentElement.style.cursor = 'crosshair'; if (!evidenza) creaEvidenza(); }
  function spegni() { attivo = false; document.documentElement.style.cursor = ''; if (evidenza) evidenza.style.display = 'none'; }
  function togliSpilli() { spilli.forEach(function (s) { s.spillo.remove(); }); spilli = []; }
  function togliSpillo(n) { var s = spilli[n - 1]; if (s) { s.spillo.remove(); } }

  document.addEventListener('mousemove', suMossa, true);
  document.addEventListener('click', suClic, true);
  document.addEventListener('click', suLink, true);
  document.addEventListener('keydown', suTasto, true);
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m || m.fonte !== 'talos-genitore') return;
    if (m.tipo === 'annota') { if (m.attivo) accendi(); else spegni(); }
    else if (m.tipo === 'svuota') togliSpilli();
    else if (m.tipo === 'togli') togliSpillo(m.numero);
    else if (m.tipo === 'stato') manda({ tipo: 'stato', attivo: attivo, spilli: spilli.length, errori: errori.slice(), titolo: document.title });
  });
  window.__talosAnnota = { versione: 1 };
  function pronta() { manda({ tipo: 'pronta', titolo: document.title, errori: errori.slice() }); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(pronta, 0); else document.addEventListener('DOMContentLoaded', pronta);
})();
