/*
 * ⭐ ANTEPRIMA NELLE DOMANDE — come riconoscere un DOCUMENTO del progetto in un'anteprima del modello (owner 29/10/2026: «la prima
 *   opzione, ma fai attenzione a formattare documenti tipo pdf md html e altri possibili»; testo dell'attrezzo concordato con la CLI:
 *   «to preview a project document, write only its path relative to the project on one line»).
 *
 * Una riga sola, un percorso RELATIVO al progetto, un'estensione che il lettore dei file sa mostrare. Tutto il resto è Markdown e si
 *   disegna come in chat. ⛔ Nota 2 della CLI: un percorso assoluto, con `..` o con un disco non è un documento del progetto — resta
 *   testo; e il server, sulla rotta del file, applica in più la regola dei segreti della lettura (`PREVIEW_FILE_SECRET`).
 */
const ESTENSIONI_DOCUMENTO = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm', 'md', 'markdown', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

/**
 * Il percorso del documento dell'anteprima, normalizzato con `/`, o `null` se l'anteprima non è un documento del progetto.
 * @param {string} testo l'anteprima come l'ha scritta il modello
 * @returns {string|null}
 */
export function percorsoDiAnteprima(testo) {
  const riga = String(testo ?? '').trim();
  if (!riga || riga.includes('\n') || riga.length > 400) return null;
  const percorso = riga.replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (/^[a-z][a-z0-9+.-]*:/iu.test(percorso)) return null; // `C:/…`, `file:`, `https:`: non è del progetto
  if (percorso.startsWith('/') || percorso.startsWith('~')) return null;
  const pezzi = percorso.split('/');
  if (pezzi.some((p) => p === '' || p === '.' || p === '..')) return null;
  const estensione = /\.([^./]+)$/u.exec(pezzi.at(-1))?.[1]?.toLowerCase();
  if (!estensione || !ESTENSIONI_DOCUMENTO.has(estensione)) return null;
  return percorso;
}

/*
 * L'HTML di un'anteprima del modello, da mostrare in una cornice SENZA script, file né rete: lo stile e le immagini in linea sì.
 * ⛔ Revisione del blocco 19: la CSP non governa la NAVIGAZIONE, e un link cliccato dalla persona caricava il sito esterno dentro la
 *   cornice. `<base target="_blank">` manda ogni link in una finestra nuova, che la cornice (sandbox senza `allow-popups`) non può
 *   aprire: il clic non porta da nessuna parte. Un `target` scritto nella pagina vince sul base, ma `_top`/`_parent` restano vietati
 *   dalla sandbox (niente `allow-top-navigation`) e `_self` resta l'unico modo: lo si toglie dai link prima di mostrarli.
 * ⛔ Seconda verifica del blocco 19: una regex sul TESTO non vede ciò che il browser vede — `target="&#95;self"` (entità decodificata),
 *   `href="…"target=…` senza spazio, e i link degli SVG (`<a href>` e `<a xlink:href>`, a cui `<base target>` non si applica): 5 casi
 *   su 10 uscivano ancora. ⇒ Dove c'è il browser, i link si tolgono dal documento GIÀ ANALIZZATO (`DOMParser` non esegue niente): ogni
 *   `<a>` e `<area>`, HTML o SVG, perde `href`, `xlink:href` e `target`, e il testo resta. Un'anteprima mostra un documento, non lo
 *   naviga. Senza `DOMParser` (le prove in Node) resta la regex di prima, più `<base target="_blank">` in ogni caso.
 */
export const POLITICA_HTML_ANTEPRIMA = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
/*
 * ⛔ Terza verifica del blocco 19: quattro modi uscivano ancora — un'animazione SVG (`<animate>`/`<set>`) che RIMETTE `href` dopo la
 *   pulizia; un link dentro un `<template>` (anche dichiarativo, `shadowrootmode`), dove `querySelectorAll` non entra; e una lettura
 *   diversa dell'HTML fra il nostro `DOMParser` e la cornice (mXSS: un link che per noi è testo dentro `<style>` e per la cornice è
 *   vivo). ⇒ Via gli elementi di animazione SVG, via `target` da OGNI elemento, dentro ogni `template.content`, e la pulizia si
 *   RIPETE sul testo riletto finché non cambia più (se in cinque passate non si ferma, il sorgente si mostra come testo semplice).
 * autosufficiente (niente costanti del modulo): la prova del browser la esegue DENTRO la pagina, dove c'è il vero `DOMParser`
 */
export function senzaLinkCheNavigano(sorgente, Parser = globalThis.DOMParser) {
  const testo = String(sorgente ?? '');
  if (typeof Parser !== 'function') return testo.replace(/\starget\s*=\s*(["']?)_self\1/giu, '');
  const ANIMAZIONI = new Set(['animate', 'set', 'animatemotion', 'animatetransform']);
  const pulisci = (radice) => {
    for (const el of [...radice.querySelectorAll('*')]) {
      if (ANIMAZIONI.has(el.localName.toLowerCase())) { el.remove(); continue; }
      el.removeAttribute('target');
      if (el.localName === 'a' || el.localName === 'area') {
        el.removeAttribute('href');
        el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        el.removeAttribute('xlink:href');
      }
      if (el.localName === 'template' && el.content) pulisci(el.content);
    }
  };
  let attuale = testo;
  for (let passata = 0; passata < 5; passata += 1) {
    const documento = new Parser().parseFromString(attuale, 'text/html');
    pulisci(documento);
    const pulito = `${documento.head.innerHTML}${documento.body.innerHTML}`;
    if (pulito === attuale) return pulito;
    attuale = pulito;
  }
  const comeTesto = testo.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  return `<pre style="white-space:pre-wrap;font:12px/1.5 monospace">${comeTesto}</pre>`;
}
export function htmlDiAnteprima(sorgente, Parser) {
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLITICA_HTML_ANTEPRIMA}"><base target="_blank">${senzaLinkCheNavigano(sorgente, Parser)}`;
}
