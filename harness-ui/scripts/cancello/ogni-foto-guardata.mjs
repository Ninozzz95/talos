/**
 * IL CANCELLO DELL'OCCHIO: una foto scattata e mai guardata non è una verifica.
 *
 * ⛔⛔⛔ 07/09/2026, owner: «io spero veramente che tu stia ispezionando ogni singolo screenshot
 *   personalmente ed esaminando ogni singolo pixel fuori posto… ispezionare ogni singola prova
 *   immagine DEVE ESSERE TRASFORMATO IN UN CANCELLO, ricordatelo».
 *
 * Il difetto che lo fa nascere è mio, dello stesso giorno: la prova del browser scattava otto foto e
 * io ne guardavo tre, poi dichiaravo «PASSA». Le altre cinque contenevano quattro difetti veri —
 * un fumetto che copriva la barra delle viste, un riquadro grigio vuoto, «Il browser non risponde»
 * scritto due volte, e un rimedio falso. Nessun numero li avrebbe trovati: si vedevano e basta.
 *
 * ⇒ Come si misura «l'ho guardata»? Non si misura l'occhio: si misura la TRACCIA. Ogni foto che
 *   conta deve essere NOMINATA in un'ispezione scritta, con dentro cosa ci si è visto. Una foto che
 *   nessun testo nomina è una foto che nessuno ha guardato — e il cancello lo dice.
 *
 * ⛔ Le foto che «contano» sono quelle più recenti dell'ultima modifica al codice: lo storico non si
 *   riguarda a ogni commit, ma la verifica di ADESSO sì, tutta.
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Il nome di una foto senza cartella: è così che la si nomina in un'ispezione. */
export function nomeDellaFoto(percorso) {
  return String(percorso).split(/[\\/]/).pop();
}

/**
 * Le foto da guardare: quelle scattate dopo l'ultima modifica al codice.
 * @returns {{percorso:string, nome:string, quando:number}[]}
 */
export function fotoDaGuardare(cartelle, dopo = 0, deps = {}) {
  const elenca = deps.readdirSync ?? readdirSync;
  const leggiStat = deps.statSync ?? statSync;
  const esiste = deps.existsSync ?? existsSync;
  const fuori = [];
  const visita = (dove) => {
    if (!esiste(dove)) return;
    for (const voce of elenca(dove, { withFileTypes: true })) {
      const intero = join(dove, voce.name);
      if (voce.isDirectory()) { visita(intero); continue; }
      if (!/\.(png|jpe?g|webp)$/i.test(voce.name)) continue;
      let quando = 0;
      try { quando = leggiStat(intero).mtimeMs; } catch { continue; }
      if (quando >= dopo) fuori.push({ percorso: intero, nome: voce.name, quando });
    }
  };
  for (const c of cartelle) visita(c);
  return fuori;
}

/**
 * Le ispezioni scritte: ogni riga che nomina una foto vale come «l'ho guardata», purché dica anche
 * qualcosa. ⛔ Una riga col solo nome del file non è un'ispezione: sarebbe un elenco, e un elenco lo
 * scrive anche chi non ha aperto niente.
 * @returns {Set<string>} i nomi delle foto nominate con almeno una parola di verdetto accanto
 */
export function fotoNominate(testi, minimoParole = 4) {
  const nominate = new Set();
  for (const testo of testi) {
    for (const riga of String(testo || '').split('\n')) {
      const trovata = /([\w.-]+\.(?:png|jpe?g|webp))/i.exec(riga);
      if (!trovata) continue;
      const resto = riga.replace(trovata[0], ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
      if (resto.split(/\s+/).filter(Boolean).length >= minimoParole) nominate.add(trovata[1]);
    }
  }
  return nominate;
}

/** @returns {{ok:boolean, mancanti:string[], guardate:number, totali:number}} */
export function giudicaLeFoto({ cartelle, dopo = 0, testi = [], deps = {} }) {
  const foto = fotoDaGuardare(cartelle, dopo, deps);
  const nominate = fotoNominate(testi);
  const mancanti = foto.filter((f) => !nominate.has(f.nome)).map((f) => f.nome);
  return { ok: mancanti.length === 0, mancanti, guardate: foto.length - mancanti.length, totali: foto.length };
}

/** Legge i file di ispezione (taccuini e registro), saltando quelli che non ci sono. */
export function testiDelleIspezioni(percorsi, leggi = readFileSync, esiste = existsSync) {
  const fuori = [];
  for (const percorso of percorsi) {
    try { if (esiste(percorso)) fuori.push(String(leggi(percorso, 'utf8'))); } catch { /* illeggibile: non vale */ }
  }
  return fuori;
}
