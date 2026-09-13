/*
 * Le due frasi che la modale «Nuova sessione» scrive sotto la cartella scelta.
 *
 * ⛔ Il conto lo fa il server (`harness-ui/src/workspace-info.mjs`): quanti file, se è una radice,
 * il ramo git, le modifiche non salvate, i repo annidati, le istruzioni dell'agente già presenti.
 * Qui vivono solo le PAROLE, e vivono nel frontend per due motivi: sono testo che si legge a schermo
 * (quindi appartiene alla lingua dell'interfaccia, non al server) e così si provano senza toccare il
 * disco. Le stesse frasi esistono anche lato server per chi userà la rotta da fuori: se un giorno
 * divergono, quella giusta è questa — è quella che la persona legge.
 *
 * Decisioni del 04/09: F9 (avvisa se è una radice), F10 (dì quanti file ha), F19-F21 (ramo,
 * modifiche non salvate, repo annidati). Erano tutte ❌ nell'audit del 06/09.
 */

/** I numeri all'italiana, senza dipendere dai dati locali compilati nel runtime. */
export function numeroItaliano(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.trunc(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, v < 0 ? '-' : '');
}

/** La riga di fatti: quello che c'è, in ordine di importanza per chi sta per premere «Continua». */
export function frasiRitratto(ritratto) {
  if (!ritratto || ritratto.leggibile !== true) return '';
  const pezzi = [];
  pezzi.push(ritratto.oltreIlTetto
    ? `più di ${numeroItaliano(ritratto.tetto)} file`
    : `${numeroItaliano(ritratto.file)} file`);
  if (Number(ritratto.cartelle) > 0) pezzi.push(`${numeroItaliano(ritratto.cartelle)} cartelle`);
  if (ritratto.git?.ramo) pezzi.push(`ramo ${ritratto.git.ramo}`);
  if (Number.isFinite(Number(ritratto.git?.nonSalvate))) {
    const n = Number(ritratto.git.nonSalvate);
    pezzi.push(n === 0 ? 'niente da salvare' : `${numeroItaliano(n)} modifiche non salvate`);
  }
  const annidati = ritratto.git?.repoAnnidati?.length || 0;
  if (annidati > 0) pezzi.push(annidati === 1 ? '1 repo annidato' : `${numeroItaliano(annidati)} repo annidati`);
  if (ritratto.istruzioni?.length) pezzi.push(`istruzioni: ${ritratto.istruzioni.join(', ')}`);
  return pezzi.join(' · ');
}

/**
 * L'avviso, solo quando serve davvero: due casi, e nient'altro. Un avviso che compare sempre non
 * viene più letto — questo compare quando stai per dare a un agente più di quanto volessi.
 */
export function avvisoRitratto(ritratto) {
  if (!ritratto || ritratto.leggibile !== true) return '';
  if (ritratto.radice === true) {
    return 'Questa è una cartella radice: l’agente vedrebbe tutto quello che c’è sotto. Scegli il progetto, non il disco.';
  }
  if (ritratto.oltreIlTetto === true) {
    return `Qui ci sono più di ${numeroItaliano(ritratto.tetto)} file: l’albero pesa a ogni giro. Se puoi, scegli una sottocartella.`;
  }
  return '';
}
