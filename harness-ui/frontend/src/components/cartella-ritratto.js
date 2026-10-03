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
import { linguaCorrenteDiT, t, tn } from './lingua.js';
export function numeroItaliano(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.trunc(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, v < 0 ? '-' : '');
}

/** La riga di fatti: quello che c'è, in ordine di importanza per chi sta per premere «Continua». */
/** Il separatore delle migliaia della lingua corrente, con la stessa disciplina di `numeroItaliano` (niente dati locali del runtime). */
const numero = (n) => (linguaCorrenteDiT() === 'en' ? numeroItaliano(n).replaceAll('.', ',') : numeroItaliano(n));

/* 03/10/2026, seconda ondata della lingua: ogni pezzo è una voce del dizionario (`varie.folderPortrait.*`, inglese prima); il
   singolare e il plurale li sceglie `tn`. I pezzi restano separati da « · », come prima. */
export function frasiRitratto(ritratto) {
  if (!ritratto || ritratto.leggibile !== true) return '';
  const pezzi = [];
  pezzi.push(ritratto.oltreIlTetto
    ? t('varie.folderPortrait.moreThanFiles', { n: numero(ritratto.tetto) })
    : tn('varie.folderPortrait.filesOne', 'varie.folderPortrait.files', Number(ritratto.file) || 0, { n: numero(ritratto.file) }));
  if (Number(ritratto.cartelle) > 0) pezzi.push(tn('varie.folderPortrait.foldersOne', 'varie.folderPortrait.folders', Number(ritratto.cartelle), { n: numero(ritratto.cartelle) }));
  if (ritratto.git?.ramo) pezzi.push(t('varie.folderPortrait.branch', { name: ritratto.git.ramo }));
  if (Number.isFinite(Number(ritratto.git?.nonSalvate))) {
    const n = Number(ritratto.git.nonSalvate);
    pezzi.push(n === 0 ? t('varie.folderPortrait.nothingToSave') : tn('varie.folderPortrait.unsavedOne', 'varie.folderPortrait.unsaved', n, { n: numero(n) }));
  }
  const annidati = ritratto.git?.repoAnnidati?.length || 0;
  if (annidati > 0) pezzi.push(tn('varie.folderPortrait.nestedOne', 'varie.folderPortrait.nested', annidati, { n: numero(annidati) }));
  if (ritratto.istruzioni?.length) pezzi.push(t('varie.folderPortrait.instructions', { list: ritratto.istruzioni.join(', ') }));
  return pezzi.join(' · ');
}

/**
 * L'avviso, solo quando serve davvero: due casi, e nient'altro. Un avviso che compare sempre non
 * viene più letto — questo compare quando stai per dare a un agente più di quanto volessi.
 */
export function avvisoRitratto(ritratto) {
  if (!ritratto || ritratto.leggibile !== true) return '';
  if (ritratto.radice === true) return t('varie.folderPortrait.rootWarning');
  if (ritratto.oltreIlTetto === true) return t('varie.folderPortrait.tooManyWarning', { n: numero(ritratto.tetto) });
  return '';
}
