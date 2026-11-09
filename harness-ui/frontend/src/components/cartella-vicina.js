/*
 * FE-040, bozzetto 4: quando una cartella non si apre, la finestra dice perché e, se il percorso non esiste, propone la cartella più vicina.
 * Il motivo lo dà il server (`src/workspace-browser.mjs`: `folder-missing`, `folder-denied`). Il confronto dei nomi è la distanza di Damerau-Levenshtein ristretta:
 * conta anche due lettere scambiate, che è il refuso del bozzetto («Stio» per «Sito»).
 */

const MOTIVI = Object.freeze({ 'folder-missing': 'inesistente', 'folder-denied': 'negata' });

/** Il motivo di un errore di apertura, nelle parole della finestra, o `null`. */
export function motivoCartella(errore) {
  const motivo = errore?.problem?.reason ?? errore?.reason;
  return typeof motivo === 'string' && Object.hasOwn(MOTIVI, motivo) ? MOTIVI[motivo] : null;
}

/** La cartella sopra a un percorso, Windows o Linux; una radice non ne ha. */
export function cartellaGenitore(percorso) {
  const pulito = String(percorso ?? '').replace(/[\\/]+$/u, '');
  if (pulito === '' || /^[A-Za-z]:$/u.test(pulito)) return null;
  const taglio = Math.max(pulito.lastIndexOf('\\'), pulito.lastIndexOf('/'));
  if (taglio < 0) return null;
  if (taglio === 0) return '/';
  const sopra = pulito.slice(0, taglio);
  return /^[A-Za-z]:$/u.test(sopra) ? `${sopra}\\` : sopra;
}

function distanza(a, b) {
  const righe = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i += 1) {
    righe[i] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      righe[i][j] = Math.min(righe[i - 1][j] + 1, righe[i][j - 1] + 1, righe[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) righe[i][j] = Math.min(righe[i][j], righe[i - 2][j - 2] + 1);
    }
  }
  return righe[a.length][b.length];
}

/**
 * La sorella col nome più simile a quello chiesto, o `null` se nessuna somiglia a un refuso: una lettera ogni tre, almeno una.
 * A pari merito resta la prima dell'elenco.
 */
export function cartellaPiuVicina(percorso, voci) {
  const nome = String(percorso ?? '').replace(/[\\/]+$/u, '').split(/[\\/]/u).pop().toLocaleLowerCase();
  if (!nome || !Array.isArray(voci)) return null;
  const tetto = Math.max(1, Math.floor(nome.length / 3));
  let migliore = null;
  let minima = Infinity;
  for (const voce of voci) {
    const d = distanza(nome, String(voce?.name ?? '').toLocaleLowerCase());
    if (d <= tetto && d < minima) { migliore = voce; minima = d; }
  }
  return migliore;
}
