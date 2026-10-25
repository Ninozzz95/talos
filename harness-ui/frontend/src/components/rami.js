/*
 * 24/10/2026 — «Riprova» e «Modifica e rimanda» come RAMI (owner, quattro consigliate sul bozzetto; contratto
 *   `CONTRATTO-RIPROVA-MODIFICA-RAMI-2026-10-24.md`). La parte pura: niente DOM, niente rete, così si prova da sola.
 *
 * Un PUNTO è la coppia (sessione, giro): la sessione in cui quel giro è nato e il suo `runId`. Le VERSIONI di un punto sono la
 *   sorgente stessa (versione 1) e i rami tagliati subito prima di quel giro (`forkDa` = sorgente, `forkPrimaDelGiro` = giro),
 *   in ordine di nascita. Come ChatGPT e Claude (frecce ‹ n / N › sul messaggio dove le strade si separano), più la vista
 *   d'insieme che loro non hanno: l'albero dei rami.
 *
 * La STORIA EREDITATA: un ramo nasce senza eventi (il kernel gli dà la conversazione, non gli eventi da disegnare — misurato il
 *   24/10, `eventi-ramo` → []). La finestra la ricostruisce: gli eventi del padre fino al giro del taglio, e così via all'indietro
 *   se il padre è a sua volta un ramo. Da lì si leggono solo: un evento ereditato non porta la sua sequenza, quindi «Elimina» e
 *   «Annulla le modifiche ai file» restano spente su di lui (non si cancella nel padre stando nel ramo).
 */

const PROFONDITA_MASSIMA = 8;

/**
 * Le versioni del punto (sorgente, giro): la sorgente prima, poi i rami di quel punto in ordine di nascita.
 * ⛔ REV4-R7 (revisione a blocco 4, 24/10 sera): una sorgente che l'elenco non ha più (eliminata) NON è una versione — prima era
 *   sempre la versione 1, e «‹» portava a una sessione che non c'è. I fratelli restano versioni fra loro; meno di due ⇒ niente frecce.
 *   Come LibreChat (`SiblingSwitch.tsx:38`, `siblingCount > 1 ? … : null`): si conta solo ciò che si può aprire.
 */
export function versioniDelPunto(righe, sorgente, giro) {
  if (typeof sorgente !== 'string' || typeof giro !== 'string' || !Array.isArray(righe)) return [];
  const rami = righe
    .filter((r) => r && r.forkDa === sorgente && r.forkPrimaDelGiro === giro && typeof r.sessionId === 'string')
    .sort((a, b) => String(a.avviataAlle ?? '').localeCompare(String(b.avviataAlle ?? '')) || a.sessionId.localeCompare(b.sessionId));
  const sorgenteInElenco = righe.some((r) => r?.sessionId === sorgente);
  const versioni = [...(sorgenteInElenco ? [sorgente] : []), ...rami.map((r) => r.sessionId)];
  return rami.length && versioni.length >= 2 ? versioni : [];
}

/**
 * REV4-R1 (24/10 sera) — da dove taglia «Riprova» / «Modifica e rimanda». Il giro di un messaggio è nato nella sessione `giroDi`;
 * ma la PRIMA domanda propria di un ramo «da un punto» è la stessa domanda del punto del suo taglio (`forkDa`, `forkPrimaDelGiro`):
 * tagliare da lì fa del secondo «Riprova» la TERZA versione dello stesso punto (prima nasceva un gruppo nuovo da «2 / 2», e la terza
 * versione non si raggiungeva dalle frecce delle prime due). Il contenuto è lo stesso: la conversazione fino a quel giro. Se la
 * sorgente non è più in elenco si ripiega sul ramo stesso — il kernel taglierebbe da una sessione che non c'è.
 */
export function puntoDelTaglio({ giroDi, giro, primaPropria = false, rigaCorrente = null, righe = [] } = {}) {
  if (primaPropria && typeof rigaCorrente?.forkDa === 'string' && typeof rigaCorrente?.forkPrimaDelGiro === 'string'
    && Array.isArray(righe) && righe.some((r) => r?.sessionId === rigaCorrente.forkDa)) {
    return { sorgente: rigaCorrente.forkDa, giro: rigaCorrente.forkPrimaDelGiro };
  }
  return { sorgente: giroDi, giro };
}

/**
 * La catena da disegnare prima degli eventi di `sessionId`: dal più antico al più vicino, ognuno con il giro prima del quale ci si
 * ferma. `[]` per una sessione che non è un ramo «da un punto» (o se l'elenco non la conosce). Un ciclo o una catena troppo lunga
 * si ferma: si disegna quello che si è trovato, mai un giro infinito.
 */
export function catenaDellaStoria(righe, sessionId) {
  return storiaDelRamo(righe, sessionId).catena;
}

/**
 * La catena e se è stata TAGLIATA dal tetto (riserva S4 della revisione a blocco 4, 24/10 sera): con più di 8 anelli la parte più
 * vecchia della conversazione non si disegna, e la finestra lo deve dire («La conversazione più vecchia non è mostrata») invece di
 * cominciare a metà. Un ciclo si ferma senza che manchi niente: non è un taglio.
 */
export function storiaDelRamo(righe, sessionId) {
  if (!Array.isArray(righe)) return { catena: [], troncata: false };
  const perId = new Map(righe.filter((r) => r && typeof r.sessionId === 'string').map((r) => [r.sessionId, r]));
  const catena = [];
  const visti = new Set([sessionId]);
  let corrente = perId.get(sessionId);
  while (corrente && typeof corrente.forkDa === 'string' && typeof corrente.forkPrimaDelGiro === 'string' && catena.length < PROFONDITA_MASSIMA) {
    if (visti.has(corrente.forkDa)) break;
    visti.add(corrente.forkDa);
    catena.unshift({ sessionId: corrente.forkDa, primaDelGiro: corrente.forkPrimaDelGiro });
    corrente = perId.get(corrente.forkDa);
  }
  const troncata = catena.length >= PROFONDITA_MASSIMA && typeof corrente?.forkDa === 'string' && typeof corrente?.forkPrimaDelGiro === 'string'
    && !visti.has(corrente.forkDa);
  return { catena, troncata };
}

/**
 * Gli eventi di una sessione da disegnare come storia ereditata: quelli PRIMA del `RunStarted` del giro del taglio, senza la sequenza
 * (così non diventano bersagli di «Elimina» nel ramo) e senza i marcatori di fine rigiocata (li manda il ramo, alla fine).
 * Se il giro non c'è, `null`: meglio nessuna storia che una storia sbagliata.
 */
export function eventiFinoAlGiro(eventi, giro) {
  if (!Array.isArray(eventi) || typeof giro !== 'string') return null;
  const fine = eventi.findIndex((e) => e?.type === 'RunStarted' && e.runId === giro);
  if (fine < 0) return null;
  return eventi.slice(0, fine)
    .filter((e) => !(e?.type === 'CUSTOM' && e.name === 'talos.fine-rigiocata'))
    .map((e) => {
      if (!e || typeof e !== 'object' || !Object.hasOwn(e, '_sequenza')) return e;
      const { _sequenza, ...resto } = e;
      return resto;
    });
}

/**
 * Riprova o modifica? Il ramo ha la stessa domanda del giro tagliato ⇒ è un «Riprova», e le frecce vanno sulla RISPOSTA; testo
 * diverso ⇒ «Modifica e rimanda», frecce sul messaggio della persona. Spazi in testa e in coda non contano.
 */
export function eUnRiprova(testoOriginale, testoDelRamo) {
  return typeof testoOriginale === 'string' && typeof testoDelRamo === 'string' && testoOriginale.trim() === testoDelRamo.trim();
}

/*
 * REV4-R4 (revisione a blocco 4, 24/10 sera; owner 24/10: «le immagini ripartono e si possono togliere», la stessa decisione per i
 *   file) — gli allegati NON immagine di un messaggio ripartono con «Modifica e rimanda». Il testo per il modello è la frase della
 *   persona, poi l'intestazione degli allegati, una riga «- » per file e, per chi ha un contenuto (una pagina, un file letto), il suo
 *   blocco «--- nome (percorso) ---» (`testoConAllegati` in app.js). Qui si stacca quel pezzo per file, così uno tolto non riparte
 *   e quelli tenuti ripartono identici, contenuto compreso — come LibreChat (`EditMessage.tsx:40-43`, `keptFiles`: «removing one
 *   only shapes the new version of the turn»), open-webui (`UserMessage.svelte:98`, `editedFiles = [...message.files]`) e
 *   assistant-ui (`default-edit-composer-runtime-core.ts:107`, gli allegati del messaggio nel compositore della modifica).
 *   ⛔ Una forma che non si riconosce dà `null`: meglio dire che il file non riparte che mandarne un pezzo (Hermes, al contrario,
 *   rifiuta `/retry` con gli allegati: «Media cannot be replayed by /retry, so fail closed», `cli_session_mixin.py:796-797`).
 */
const nomeDalPercorso = (percorso) => String(percorso).split(/[\\/]/u).pop() || String(percorso);

export function pezziDegliAllegati(consegna, testoDellaBolla, { intestazioni = [], prefissiFile = [] } = {}) {
  if (typeof consegna !== 'string' || typeof testoDellaBolla !== 'string') return null;
  for (const intestazione of intestazioni.filter((x) => typeof x === 'string' && x)) {
    const apertura = `${testoDellaBolla}\n\n${intestazione}\n`;
    if (!consegna.startsWith(`${apertura}- `)) continue;
    const dopo = consegna.slice(apertura.length);
    const righe = [];
    for (const riga of dopo.split('\n')) { if (!riga.startsWith('- ')) break; righe.push(riga); }
    const resto = dopo.slice(righe.join('\n').length);
    if (resto !== '' && !resto.startsWith('\n\n--- ')) return null;
    const blocchi = resto.slice(2);
    const testate = (riga) => { const corpo = riga.slice(2); return [`--- ${corpo} `, `--- ${corpo} () `]; };
    const file = righe.map((riga) => {
      const corpo = riga.slice(2);
      const prefisso = prefissiFile.find((p) => p && corpo.startsWith(p));
      if (prefisso) { const percorso = corpo.slice(prefisso.length); return { tipo: 'file', nome: nomeDalPercorso(percorso), percorso, riga, blocco: null }; }
      const conPercorso = /^(.*) \(([^()]*)\)$/u.exec(corpo);
      return { tipo: 'file', nome: conPercorso ? conPercorso[1] : corpo, percorso: conPercorso ? conPercorso[2] : '', riga, blocco: null };
    });
    let cursore = 0;
    for (let i = 0; i < file.length && cursore < blocchi.length; i++) {
      if (!testate(file[i].riga).some((t) => blocchi.startsWith(t, cursore))) continue;
      /* il blocco finisce dove comincia quello di un file DOPO: un «---» dentro il contenuto non lo spezza */
      let fine = blocchi.length;
      for (const dopoDiLui of file.slice(i + 1)) {
        const trovate = testate(dopoDiLui.riga).map((t) => blocchi.indexOf(`\n\n${t}`, cursore)).filter((x) => x >= 0);
        if (trovate.length) { fine = Math.min(...trovate); break; }
      }
      file[i].blocco = blocchi.slice(cursore, fine);
      cursore = fine === blocchi.length ? fine : fine + 2;
    }
    if (cursore < blocchi.length) return null;
    return { intestazione, file };
  }
  return null;
}

/** Il testo per il modello con la frase nuova e i soli file tenuti, nella stessa forma di `testoConAllegati`. Nessun file ⇒ la frase. */
export function consegnaConAllegati(testo, intestazione, tenuti) {
  const file = Array.isArray(tenuti) ? tenuti.filter((f) => typeof f?.riga === 'string') : [];
  if (!file.length || typeof intestazione !== 'string') return testo;
  const testa = `${testo}\n\n${intestazione}\n${file.map((f) => f.riga).join('\n')}`;
  const blocchi = file.filter((f) => typeof f.blocco === 'string' && f.blocco).map((f) => f.blocco);
  return blocchi.length ? `${testa}\n\n${blocchi.join('\n\n')}` : testa;
}
