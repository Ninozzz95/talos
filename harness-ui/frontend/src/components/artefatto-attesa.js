/*
 * 0.2.1-ART D3 (owner 09/11/2026 19:55): la riga dell'attrezzo «Artefatto: …» sopra la carta se ne va, e il suo stato passa nella
 * carta («Sto creando…»). La riga nasce come sempre (la chat la conosce, il diario pure) ma nascosta; al suo posto nasce una carta
 * in attesa, che l'evento `ArtifactCreated` riempie. Se l'attrezzo finisce senza artefatto (rifiuto, errore, giro interrotto) la
 * carta se ne va e la riga torna, col suo esito: un errore non si perde mai.
 *
 * ⛔ L'evento `ArtifactCreated` non porta l'id della chiamata: il server lo manda fra l'inizio e l'esito dell'attrezzo, nell'ordine
 *   delle chiamate. Le carte in attesa si riempiono quindi in fila, la prima nata per prima.
 * Hermes fa lo stesso per le sue carte: lo stato dell'attrezzo vive nella carta e non in una riga a parte
 *   (`apps/desktop/src/components/assistant-ui/artifact-card.tsx:98-104`).
 */

const TIPI = { artifact_create: 'creating', artifact_update: 'updating' };
/* il titolo sta in testa agli argomenti: non si rilegge un artefatto intero a ogni pezzo che arriva */
const TESTA = 600;
const TITOLO = /"titolo"\s*:\s*("(?:[^"\\]|\\.)*")/u;

export function creaAttesaArtefatti() {
  /** id della chiamata → { carta, riga, batch, presa, titolata } */
  const attese = new Map();

  /**
   * Il contenitore delle righe si nasconde solo finché non ha niente da mostrare.
   * ⛔ Nella pagina vera ogni riga ha dopo di sé il suo corpo (`pre.talos-tool-row__body`), chiuso dal CSS della riga e mai da
   *   `hidden`: non è una riga, e contato teneva accesa la testa «Sto creando un artefatto…» sopra la carta (foto del 09/11/2026).
   */
  function aggiornaBatch(batch) {
    if (!batch?.card || !batch.contenitore) return;
    const righe = [...batch.contenitore.children].filter((r) => !r.classList?.contains('talos-tool-row__body'));
    batch.card.hidden = righe.length > 0 && righe.every((r) => r.hidden);
  }

  return {
    /**
     * Un attrezzo parte. `true` se è un attrezzo degli artefatti: la sua riga è nascosta e c'è una carta in attesa.
     * @param {string} id l'id della chiamata
     * @param {{ nome: string, riga: HTMLElement, batch: { card: HTMLElement, contenitore: HTMLElement }, creaCarta: (attesa: { tipo: string, titolo: string }) => object }} o
     */
    inizia(id, { nome, riga, batch, creaCarta }) {
      const tipo = Object.hasOwn(TIPI, nome) ? TIPI[nome] : null;
      if (!tipo || attese.has(id)) { aggiornaBatch(batch); return false; }
      riga.hidden = true;
      attese.set(id, { carta: creaCarta({ tipo, titolo: '' }), riga, batch, presa: false, titolata: false });
      aggiornaBatch(batch);
      return true;
    },

    /** Gli argomenti arrivano a pezzi: appena il titolo è intero la carta lo mostra, una volta sola. */
    argomenti(id, testo) {
      const a = attese.get(id);
      if (!a || a.titolata || a.presa || typeof testo !== 'string') return;
      const trovato = TITOLO.exec(testo.slice(0, TESTA));
      if (!trovato) { if (testo.length >= TESTA) a.titolata = true; return; }
      a.titolata = true;
      try {
        const titolo = JSON.parse(trovato[1]);
        if (typeof titolo === 'string') a.carta.titolo?.(titolo);
      } catch { /* una sequenza di escape a metà: resta il titolo di ripiego, l'evento porta quello vero */ }
    },

    /** L'artefatto è nato: la carta in attesa più vecchia ancora nella pagina, o `null` (ne nasce una nuova). */
    prendi() {
      for (const a of attese.values()) {
        if (a.presa) continue;
        a.presa = true;
        if (a.carta?.card?.isConnected) return a.carta;
      }
      return null;
    },

    /** L'attrezzo ha finito (esito, o giro interrotto). Senza artefatto la carta se ne va e la riga torna. */
    finisci(id) {
      const a = attese.get(id);
      if (!a) return;
      attese.delete(id);
      if (a.presa) return;
      a.carta?.card?.remove();
      a.riga.hidden = false;
      aggiornaBatch(a.batch);
    },

    /** La chat cambia o si ridisegna: le attese erano della pagina di prima. */
    azzera() { attese.clear(); },
  };
}
