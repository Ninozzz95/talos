/**
 * F5 File reader — la CORNICE OSPITE di Word e PowerPoint, lato pagina di TALOS (26/09/2026, owner: «ora, prima di F6»).
 *
 * La pagina di TALOS non costruisce più il documento: manda i BYTE alla pagina ospite (`GET /api/v1/lettore/ospite`), e
 * quella carica la sua resa (`/lettore-ospite-<formato>.js`, uno script classico col nonce della sua CSP), costruisce e
 * ripulisce il documento nel PROPRIO documento — dove la CSP ammette gli stili in linea — e lo mostra. È il disegno delle
 * webview di VS Code (code.visualstudio.com/api/extension-guides/webview, letto il 26/09/2026): `default-src 'none'`, script
 * propri col nonce, i dati via `postMessage`.
 * ⛔ Perché, misurato il 26/09 sul 4174: costruito nella pagina di TALOS, ogni attributo `style` del documento faceva
 *   scattare la CSP di quella pagina («Applying inline style violates…», 39 avvisi per il Word di prova, 59 per la
 *   presentazione) anche su nodi mai mostrati — la resa era giusta (l'attributo resta nel testo serializzato), la console
 *   no. E in più ora il file non fidato si legge nella cornice a origine nulla, non nella pagina che parla col server.
 * ⛔ I byte si COPIANO (clonazione strutturata), non si trasferiscono: spostando il lettore dal rail allo schermo intero la
 *   cornice si ricarica e li richiede, e la pagina deve averli ancora.
 */
export const FORMATI_OSPITE = Object.freeze(['documento', 'presentazione']);
const TITOLI = Object.freeze({ documento: 'Documento', presentazione: 'Presentazione' });

export function corniceOspite({ doc, finestra = globalThis, formato, byte, nome, onErrore }) {
  if (!FORMATI_OSPITE.includes(formato)) throw new Error(`nessuna resa in cornice per «${formato}»`);
  const cornice = doc.createElement('iframe');
  cornice.className = 'talos-lettore__office';
  cornice.title = `${TITOLI[formato]}: ${nome}`;
  cornice.setAttribute('sandbox', 'allow-scripts');
  cornice.setAttribute('referrerpolicy', 'no-referrer');
  cornice.setAttribute('allow', '');
  const suMessaggio = (evento) => {
    if (!cornice.contentWindow || evento.source !== cornice.contentWindow) return;
    const tipo = evento.data?.tipo;
    if (tipo === 'talos-lettore-ospite-pronto') {
      cornice.dataset.consegnato = String(Number(cornice.dataset.consegnato || 0) + 1);
      // l'origine della pagina ospite è nulla: `'*'` è l'unico bersaglio possibile, e il destinatario è QUESTA cornice
      cornice.contentWindow.postMessage({ tipo: 'talos-lettore-documento', formato, byte, nome }, '*');
    } else if (tipo === 'talos-lettore-ospite-errore') {
      onErrore?.(String(evento.data?.messaggio || 'motivo non registrato'));
    }
  };
  finestra.addEventListener('message', suMessaggio);
  cornice.smontaTalos = () => finestra.removeEventListener('message', suMessaggio);
  cornice.src = '/api/v1/lettore/ospite';
  return cornice;
}
