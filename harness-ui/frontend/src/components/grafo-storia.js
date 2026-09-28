/**
 * Il grafo di «Commit recenti» — il ramo attuale e il suo remoto, con «In arrivo» e «In uscita» (F6-2 passo 3, decisione 21
 * dell'owner del 27/09: «ramo attuale e suo remoto, come VS Code "Auto", nel gruppo Commit recenti»).
 *
 * ⭐ Porto di VS Code `src/vs/workbench/contrib/scm/browser/scmHistory.ts` (MIT, clone `vscode-2026-09-23`):
 *   - le corsie: `toISCMHistoryItemViewModelArray` (`:292-406`) — le corsie d'ingresso di un commit sono quelle d'uscita del
 *     precedente; il primo genitore prende il posto del commit nella sua corsia, gli altri genitori ne aprono di nuove;
 *   - «In arrivo» / «In uscita»: `addIncomingOutgoingChangesHistoryItems` (`:420-530`) — righe inserite DOPO il calcolo delle
 *     corsie: «In arrivo» subito sopra la base comune, sulla corsia del remoto, e mai se è già stata unita (vscode#276064,
 *     `:436-441`); «In uscita» subito sopra HEAD, in una corsia sua;
 *   - il disegno: `renderSCMHistoryItemGraph` (`:124-275`) — corsie da 11 px, curve di raggio 5, cerchi di raggio 4 (`:20-24`).
 *
 * Adattato alla nostra struttura, non incollato:
 *   - niente registro dei colori: il colore è un NOME (`locale`, `remoto`, `altro-0…4`) che il CSS traduce nei token del tema;
 *   - l'altezza della riga è un parametro: VS Code disegna righe da 22 px (il centro coincide con la larghezza della corsia,
 *     `cy = SWIMLANE_WIDTH`), le nostre hanno due righe di testo, quindi le curve si chiudono attorno a `altezza / 2` con un
 *     tratto verticale in più;
 *   - un commit senza genitori (una radice) conserva le ALTRE corsie: VS Code le lascia cadere (`:314-330` le copia solo se il
 *     commit ha genitori), e in una storia con due radici la seconda linea si interromperebbe a metà;
 *   - il modulo è puro (niente DOM): calcola righe e primitive, e la scheda le trasforma in SVG.
 */

export const LARGHEZZA_CORSIA = 11;
const RAGGIO_CURVA = 5;
const RAGGIO_CERCHIO = 4;
const SPESSORE_CERCHIO = 2;
const COLORI_ALTRI = 5;

export const ID_IN_ARRIVO = 'talos:in-arrivo';
export const ID_IN_USCITA = 'talos:in-uscita';

const copia = (nodo) => ({ id: nodo.id, colore: nodo.colore });

function ultimoIndice(elenco, prova) {
  for (let i = elenco.length - 1; i >= 0; i -= 1) if (prova(elenco[i])) return i;
  return -1;
}

/**
 * Le righe del grafo.
 * @param {Array<{commit: string, padri: string[]}>} commit in ordine topologico, dal più nuovo (`git log --topo-order`)
 * @param {{testa?: string|null, remoto?: string|null, base?: string|null}} rif HEAD, la punta del remoto, la base comune
 * @returns {Array<{tipo: 'testa'|'nodo'|'unione'|'in-arrivo'|'in-uscita', id: string, padri: string[], ingresso: object[], uscita: object[], voce?: object}>}
 */
export function righeDelGrafo(commit, { testa = null, remoto = null, base = null } = {}) {
  const colorePerRif = (id) => (id && id === testa ? 'locale' : id && id === remoto ? 'remoto' : undefined);
  let indiceColore = -1;
  const righe = [];
  for (const voce of commit) {
    const padri = Array.isArray(voce.padri) ? voce.padri : [];
    const ingresso = (righe.at(-1)?.uscita ?? []).map(copia);
    const uscita = [];
    let primoPadre = false;
    for (const nodo of ingresso) {
      if (nodo.id === voce.commit) {
        if (!primoPadre && padri.length > 0) {
          uscita.push({ id: padri[0], colore: colorePerRif(voce.commit) ?? nodo.colore });
          primoPadre = true;
        }
        continue;
      }
      uscita.push(copia(nodo));
    }
    for (let i = primoPadre ? 1 : 0; i < padri.length; i += 1) {
      let colore = colorePerRif(i === 0 ? voce.commit : padri[i]);
      if (!colore) {
        indiceColore = (indiceColore + 1) % COLORI_ALTRI;
        colore = `altro-${indiceColore}`;
      }
      uscita.push({ id: padri[i], colore });
    }
    const tipo = voce.commit === testa ? 'testa' : padri.length > 1 ? 'unione' : 'nodo';
    righe.push({ tipo, id: voce.commit, padri, ingresso, uscita, voce });
  }
  if (!base || testa === remoto) return righe;

  // «In arrivo»: subito sopra la base comune, sulla corsia del remoto (VS Code `:428-484`)
  if (remoto && remoto !== base) {
    const prima = ultimoIndice(righe, (r) => r.uscita.some((n) => n.id === base));
    const dopo = righe.findIndex((r) => r.id === base);
    if (prima !== -1 && dopo !== -1) {
      const giaUnito = righe[prima].padri.length === 2 && righe[prima].padri.includes(base);
      if (!giaUnito) {
        const rinomina = (n) => (n.id === base && n.colore === 'remoto' ? { id: ID_IN_ARRIVO, colore: n.colore } : n);
        righe[prima] = { ...righe[prima], ingresso: righe[prima].ingresso.map(rinomina), uscita: righe[prima].uscita.map(rinomina) };
        righe.splice(dopo, 0, {
          tipo: 'in-arrivo', id: ID_IN_ARRIVO, padri: [base],
          ingresso: righe[prima].uscita.map(copia), uscita: righe[dopo].ingresso.map(copia),
        });
      }
    }
  }
  // «In uscita»: subito sopra HEAD, in una corsia sua che scende su HEAD (VS Code `:486-528`)
  if (testa && testa !== base) {
    const i = righe.findIndex((r) => r.tipo === 'testa' && r.id === testa);
    if (i !== -1) {
      const ingresso = righe[i].ingresso.map(copia);
      const uscita = ingresso.map(copia).concat({ id: testa, colore: 'locale' });
      righe.splice(i, 0, { tipo: 'in-uscita', id: ID_IN_USCITA, padri: [testa], ingresso, uscita });
      righe[i + 1] = { ...righe[i + 1], ingresso: [...righe[i + 1].ingresso, { id: testa, colore: 'locale' }] };
    }
  }
  return righe;
}

/**
 * Le primitive di una riga (VS Code `renderSCMHistoryItemGraph`, `:124-275`, con l'altezza come parametro).
 * @returns {{larghezza: number, altezza: number, tratti: Array<{d: string, colore: string, spessore?: number}>, cerchi: Array<{cx: number, cy: number, r: number, colore?: string, spessore: number, ruolo: string}>}}
 */
export function disegnoDellaRiga(riga, altezza = 22) {
  const W = LARGHEZZA_CORSIA;
  const meta = altezza / 2;
  const { ingresso, uscita } = riga;
  const tratti = [];
  const cerchi = [];
  const indiceIngresso = ingresso.findIndex((n) => n.id === riga.id);
  const indice = indiceIngresso !== -1 ? indiceIngresso : ingresso.length;
  const colore = indice < uscita.length ? uscita[indice].colore : indice < ingresso.length ? ingresso[indice].colore : 'locale';

  let indiceUscita = 0;
  for (let i = 0; i < ingresso.length; i += 1) {
    const c = ingresso[i].colore;
    if (ingresso[i].id === riga.id) {
      if (i !== indice) {
        // un doppione della stessa corsia che confluisce nel cerchio: «/» poi «-» (`:147-160`)
        tratti.push({ colore: c, d: `M ${W * (i + 1)} 0 V ${meta - W} A ${W} ${W} 0 0 1 ${W * i} ${meta} H ${W * (indice + 1)}` });
      } else {
        indiceUscita += 1;
      }
    } else if (indiceUscita < uscita.length && ingresso[i].id === uscita[indiceUscita].id) {
      if (i === indiceUscita) {
        tratti.push({ colore: c, d: `M ${W * (i + 1)} 0 V ${altezza}` });
      } else {
        // la corsia si sposta a sinistra: «|» «/» «-» «/» «|» (`:171-196`)
        const x = W * (i + 1);
        const x2 = W * (indiceUscita + 1);
        tratti.push({
          colore: c,
          d: `M ${x} 0 V ${meta - RAGGIO_CURVA} A ${RAGGIO_CURVA} ${RAGGIO_CURVA} 0 0 1 ${x - RAGGIO_CURVA} ${meta} H ${x2 + RAGGIO_CURVA} A ${RAGGIO_CURVA} ${RAGGIO_CURVA} 0 0 0 ${x2} ${meta + RAGGIO_CURVA} V ${altezza}`,
        });
      }
      indiceUscita += 1;
    }
  }
  // gli altri genitori: «-\» verso la loro corsia (`:202-222`)
  for (let p = 1; p < riga.padri.length; p += 1) {
    const j = ultimoIndice(uscita, (n) => n.id === riga.padri[p]);
    if (j === -1) continue;
    tratti.push({ colore: uscita[j].colore, d: `M ${W * j} ${meta} A ${W} ${W} 0 0 1 ${W * (j + 1)} ${meta + W} V ${altezza} M ${W * j} ${meta} H ${W * (indice + 1)}` });
  }
  if (indiceIngresso !== -1) tratti.push({ colore: ingresso[indiceIngresso].colore, d: `M ${W * (indice + 1)} 0 V ${meta}` });
  if (riga.padri.length > 0) tratti.push({ colore, d: `M ${W * (indice + 1)} ${meta} V ${altezza}` });

  const cx = W * (indice + 1);
  if (riga.tipo === 'testa') {
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO + 3, colore, spessore: SPESSORE_CERCHIO, ruolo: 'esterno' });
    cerchi.push({ cx, cy: meta, r: SPESSORE_CERCHIO, spessore: RAGGIO_CERCHIO, ruolo: 'foro' });
  } else if (riga.tipo === 'in-arrivo' || riga.tipo === 'in-uscita') {
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO + 3, colore, spessore: SPESSORE_CERCHIO, ruolo: 'esterno' });
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO + 1, spessore: SPESSORE_CERCHIO + 1, ruolo: 'foro' });
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO + 1, colore, spessore: SPESSORE_CERCHIO - 1, ruolo: 'tratteggio' });
  } else if (riga.padri.length > 1) {
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO + 2, colore, spessore: SPESSORE_CERCHIO, ruolo: 'esterno' });
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO - 1, colore, spessore: SPESSORE_CERCHIO, ruolo: 'interno' });
  } else {
    cerchi.push({ cx, cy: meta, r: RAGGIO_CERCHIO + 1, colore, spessore: SPESSORE_CERCHIO, ruolo: 'nodo' });
  }
  return { larghezza: W * (Math.max(ingresso.length, uscita.length, 1) + 1), altezza, tratti, cerchi };
}

/**
 * I commit della finestra che discendono dalla punta del remoto e NON da HEAD: quelli «da scaricare».
 * ⭐ Esatto sulla finestra: con `--topo-order` nessun genitore compare prima di tutti i suoi figli, quindi ogni commit fra una
 *   punta e un commit della finestra è anch'esso nella finestra (la finestra è chiusa verso l'alto).
 */
export function soloDelRemoto(commit, { testa = null, remoto = null } = {}) {
  if (!remoto || remoto === testa) return new Set();
  const padriDi = new Map(commit.map((c) => [c.commit, Array.isArray(c.padri) ? c.padri : []]));
  const raggiunti = (da) => {
    const visti = new Set();
    const pila = da ? [da] : [];
    while (pila.length) {
      const id = pila.pop();
      if (visti.has(id) || !padriDi.has(id)) continue;
      visti.add(id);
      pila.push(...padriDi.get(id));
    }
    return visti;
  };
  const dallaTesta = raggiunti(testa);
  return new Set([...raggiunti(remoto)].filter((id) => !dallaTesta.has(id)));
}

/**
 * Il segnaposto delle corsie per le righe che si aprono SOTTO un commit (i suoi file): le corsie d'uscita della riga
 * proseguono in verticale, come VS Code `renderSCMHistoryGraphPlaceholder` (`scmHistory.ts:277-290`) sulle righe dei file.
 */
export function disegnoSegnaposto(corsie, altezza) {
  const elenco = Array.isArray(corsie) ? corsie : [];
  return {
    larghezza: LARGHEZZA_CORSIA * (elenco.length + 1),
    altezza,
    tratti: elenco.map((n, i) => ({ colore: n.colore, d: `M ${LARGHEZZA_CORSIA * (i + 1)} 0 V ${altezza}` })),
    cerchi: [],
  };
}
