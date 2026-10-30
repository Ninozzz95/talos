/*
 * La scheda File e i cambiamenti sul disco (owner 28/10/2026: «la tab file a destra flickera come se si aggiornasse ogni tot»).
 * Misurato sul 4174 con una sonda in sola lettura: una conversazione sulla cartella Desktop, un file che cambiava DENTRO una
 * cartella chiusa ⇒ 1.896 mutazioni del DOM in 34 s, la lista dell'albero rifatta da capo ogni secondo. `WorkspaceChanged`
 * buttava tutta la cache dei livelli e ridisegnava, qualunque cosa fosse cambiata e dovunque.
 *
 * Qui sta la domanda pura, senza DOM: dato ciò che il watcher dice cambiato, QUALI livelli già letti vanno ricontrollati perché
 * la persona li vede, e quali si possono solo dimenticare (letti ma chiusi: si rileggono quando si riaprono).
 * Come VS Code (`src/vs/workbench/contrib/files/browser/explorerService.ts`, letto il 28/10/2026): i cambiamenti si raccolgono
 * in una finestra di 500 ms (`EXPLORER_FILE_CHANGES_REACT_DELAY = 500`, armata solo se non lo è già), e si reagisce solo a ciò
 * che tocca un elemento visibile e già risolto (`doesFileEventAffect` scende solo nei figli `isItemVisible` e
 * `isDirectoryResolved`; un'aggiunta conta solo se il genitore è risolto e il figlio manca).
 * ⭐ Un passo oltre: un livello a vista si rilegge e si CONFRONTA con quello a schermo — se l'elenco è lo stesso (un file
 *   cambiato dentro, non aggiunto né tolto) l'albero non si tocca affatto.
 */

/** Il ritardo di VS Code fra un cambiamento sul disco e la reazione dell'albero. */
export const RITARDO_CAMBIAMENTI_ALBERO_MS = 500;

/** Un percorso del watcher nella forma delle chiavi di `treeCache`: '' è la radice, e anche «non so dove» ('.'). */
export function normalizzaPercorsoAlbero(percorso) {
  if (typeof percorso !== 'string') return null;
  const normale = percorso.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  return normale === '.' ? '' : normale;
}

export function genitoreNellAlbero(percorso) {
  const i = percorso.lastIndexOf('/');
  return i === -1 ? '' : percorso.slice(0, i);
}

/** Un livello è a vista se è la radice, o se lui e TUTTE le cartelle sopra di lui sono aperte (`treeOpen` ricorda anche le
 *  cartelle aperte dentro una madre chiusa: quelle non si vedono). */
export function livelloAVista(livello, aperti) {
  for (let corrente = livello; corrente !== ''; corrente = genitoreNellAlbero(corrente)) {
    if (!aperti.has(corrente)) return false;
  }
  return true;
}

/**
 * @param {unknown} percorsi i percorsi relativi di `WorkspaceChanged`; '.' o un elenco che manca = il watcher non sa dire dove
 * @param {Iterable<string>} livelliLetti le chiavi di `treeCache`
 * @param {Set<string>} aperti `treeOpen`
 * @returns {{ daRicontrollare: string[], daDimenticare: string[] }}
 */
export function livelliToccatiDalCambiamento(percorsi, livelliLetti, aperti) {
  const letti = new Set(livelliLetti);
  const toccati = new Set();
  for (const grezzo of Array.isArray(percorsi) ? percorsi : ['.']) {
    const percorso = normalizzaPercorsoAlbero(grezzo);
    if (percorso === null) continue;
    if (percorso === '') {
      for (const livello of letti) toccati.add(livello);
      continue;
    }
    toccati.add(genitoreNellAlbero(percorso)); // la riga del file sta nel livello di sua madre
    toccati.add(percorso); // e se è una cartella già letta, il suo elenco (Windows la segnala quando nasce o muore un figlio)
  }
  const daRicontrollare = [];
  const daDimenticare = [];
  for (const livello of toccati) {
    if (!letti.has(livello)) continue; // mai letto: lo si legge fresco quando la persona ci arriva
    (livelloAVista(livello, aperti) ? daRicontrollare : daDimenticare).push(livello);
  }
  return { daRicontrollare: daRicontrollare.sort(), daDimenticare: daDimenticare.sort() };
}

/** Lo stesso elenco a schermo? La riga dell'albero si disegna da nome e «cartella o no» (`costruisciNodoAlbero`), nell'ordine
 *  in cui arrivano: tutto il resto di una voce non si vede. */
export function stessoLivello(prima, dopo) {
  if (!Array.isArray(prima) || !Array.isArray(dopo) || prima.length !== dopo.length) return false;
  return prima.every((voce, i) => voce?.nome === dopo[i]?.nome && Boolean(voce?.cartella) === Boolean(dopo[i]?.cartella));
}

/** Le cartelle di `livello` che non ci sono più (o non sono più cartelle): i loro elenchi letti, e quelli sotto, sono vecchi.
 *  Il confine è la barra: «src/deep» porta via «src/deep/a», mai «src/deep2». */
export function livelliSottoCartelleSparite(livello, prima, dopo, livelliLetti) {
  const restano = new Set((dopo ?? []).filter((v) => v?.cartella).map((v) => v.nome));
  const sparite = (prima ?? []).filter((v) => v?.cartella && !restano.has(v.nome))
    .map((v) => (livello ? `${livello}/${v.nome}` : v.nome));
  if (!sparite.length) return [];
  return [...livelliLetti].filter((letto) => sparite.some((s) => letto === s || letto.startsWith(`${s}/`))).sort();
}
