/*
 * Il testo pulito delle notifiche — contratto «notifiche» (31/10/2026, bozza 2): lo fa chi scrive nel registro (il nativo Android non
 * può ripulire). Lettore di Markdown = `markdown-it` alla STESSA versione del telefono, 14.3.0 esatta, con le condizioni di
 * Performance accolte nel contratto:
 *   (a) import PIGRO, alla prima voce che ha davvero dei segni di Markdown — mai in testa a `server.mjs` né all'avvio;
 *   (b) solo nel pacchetto del server, mai in `src/kernel` (il pacchetto della CLI non cresce).
 * Tabelle saltate intere, blocchi di codice saltati, HTML saltato; il codice in linea resta (è parte della frase).
 *
 * Se la libreria non c'è (un pacchetto che non la porta, un'installazione rotta) il registro non si ferma: un ripiego semplice toglie
 * recinti di codice, righe di tabella e segni, e lo dice una volta in console. Il tetto dei 240 caratteri lo mette il registro.
 */

const SEGNI = /[*_`#>|~[\]!<-]|^\s*\d+\.\s/mu;

function ripiego(testo) {
  return testo
    .replace(/```[\s\S]*?(```|$)/gu, ' ')
    .split('\n').filter((riga) => !/^\s*\|/.test(riga)).join('\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gmu, '')
    .replace(/[*_~`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Il testo visibile di un elenco di token in linea di markdown-it (le immagini col loro testo alternativo). */
function testoInLinea(figli) {
  let fuori = '';
  for (const t of figli ?? []) {
    if (t.type === 'text' || t.type === 'code_inline') fuori += t.content;
    else if (t.type === 'softbreak' || t.type === 'hardbreak') fuori += ' ';
    else if (t.type === 'image') fuori += testoInLinea(t.children);
  }
  return fuori;
}

/**
 * @param {{ carica?: () => Promise<any>, avvisa?: (messaggio: string) => void }} [p]
 * @returns {(testo: string) => Promise<string>}
 */
export function creaPulitoreMarkdown({ carica = () => import('markdown-it'), avvisa = (m) => console.warn(m) } = {}) {
  let lettore = null;
  let caricamento = null;
  const prepara = () => {
    caricamento ??= Promise.resolve().then(carica).then((modulo) => {
      const MarkdownIt = modulo?.default ?? modulo;
      lettore = new MarkdownIt({ html: true, linkify: false });
    }).catch((errore) => {
      lettore = null;
      avvisa(`[notifiche] markdown-it not available, plain cleanup: ${errore instanceof Error ? errore.message : errore}`);
    });
    return caricamento;
  };

  return async function pulisci(testo) {
    if (typeof testo !== 'string' || !testo.trim()) return '';
    if (!SEGNI.test(testo)) return testo.replace(/\s+/gu, ' ').trim(); // niente Markdown: niente libreria
    await prepara();
    if (!lettore) return ripiego(testo);
    const pezzi = [];
    let dentroTabella = 0;
    for (const t of lettore.parse(testo, {})) {
      if (t.type === 'table_open') { dentroTabella += 1; continue; }
      if (t.type === 'table_close') { dentroTabella = Math.max(0, dentroTabella - 1); continue; }
      if (dentroTabella > 0) continue;
      if (t.type === 'inline') pezzi.push(testoInLinea(t.children));
    }
    return pezzi.join(' ').replace(/\s+/gu, ' ').trim();
  };
}
