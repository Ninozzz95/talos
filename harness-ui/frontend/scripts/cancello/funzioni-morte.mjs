/*
 * Sesto controllo del cancello: una funzione dichiarata che nessuno chiama.
 *
 * ⛔ 06/9 — nato da un difetto trovato mentre provavo gli altri cinque. La classe
 * `.conversation-hero` risultava «senza regola CSS» e sull'app viva non compariva mai: ho creduto
 * a un difetto di stile, e l'ho pure scritto in un commit poi rettificato. Non lo era. La funzione
 * che costruisce quella schermata — `costruisciConversationHero` — **non è mai chiamata**: una sola
 * occorrenza in 15.000 righe, la sua dichiarazione. Il difetto non era il CSS mancante: era che
 * quel pezzo di interfaccia non esiste per nessuno.
 * ⇒ «Un nome che punta al nulla» e «un nome che nessuno chiama» sono lo stesso difetto visto dai
 *   due lati, e il secondo si trova solo cercandolo.
 *
 * ## Perché scritto a mano invece di usare Knip
 * Ricerca 06/09/2026 (knip.dev; Pi Stack, «knip vs ts-prune vs Vulture vs unimported»;
 * effectivetypescript, «Use knip to detect dead code»): **Knip** è lo strumento di riferimento e il
 * successore di ts-prune, ormai in sola manutenzione. Ma Knip ragiona su MODULI ed EXPORT, partendo
 * dai punti d'ingresso: le funzioni che ci interessano qui vivono **dentro una sola IIFE** del
 * monolite `legacy/app.js`, non sono esportate da nessuna parte, e Knip non le vede. Questo
 * controllo copre esattamente il buco che lui lascia — e quando il monolite sarà finito di
 * smontare in moduli, Knip lo sostituirà.
 *
 * ## La guardia contro i falsi positivi, che qui è tutto
 * Le stesse fonti dicono che ts-prune «segnalava falsi positivi di continuo, e si passava più tempo
 * a triare l'output che a correggere»: è il modo in cui uno strumento del genere muore. La causa
 * dichiarata sono le invocazioni **dinamiche** — un nome dentro una mappa, un `window[nome]`, un
 * gestore montato da un attributo.
 * ⇒ Per questo qui si contano le OCCORRENZE DEL NOME, non le chiamate. Un controllo che cercasse
 *   `nome(` accuserebbe ogni funzione richiamata indirettamente; contando il nome, basta che
 *   qualcuno lo scriva una volta — anche dentro una stringa — perché non venga accusata.
 *   È volutamente conservativo: preferisce non vedere un morto che accusare un vivo.
 */

/** I nomi delle funzioni dichiarate con `function nome(...)`, comprese le `async`. */
export function funzioniDichiarate(codice) {
  const testo = String(codice || '');
  const trovate = [...testo.matchAll(/^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/gm)];
  return [...new Set(trovate.map((m) => m[1]))];
}

/** Quante volte quel nome compare nel testo, in qualunque forma — stringhe comprese, di proposito. */
export function quanteVolteNominata(codice, nome) {
  const sicuro = String(nome).replace(/[$]/g, '\\$');
  return (String(codice || '').match(new RegExp(`\\b${sicuro}\\b`, 'g')) || []).length;
}

/**
 * Le funzioni che nessuno nomina fuori dalla propria dichiarazione.
 * @param {string} codice il sorgente
 * @param {{esenti?: string[]}} [opzioni] nomi da non accusare — chi ne aggiunge uno scrive perché
 * @returns {Array<{nome:string, perche:string}>}
 */
export function funzioniMaiChiamate(codice, { esenti = [] } = {}) {
  const testo = String(codice || '');
  const morte = [];
  for (const nome of funzioniDichiarate(testo)) {
    if (esenti.includes(nome)) continue;
    const sicuro = nome.replace(/[$]/g, '\\$');
    const occorrenze = quanteVolteNominata(testo, nome);
    const dichiarazioni = (testo.match(new RegExp(`function[ \\t]+${sicuro}[ \\t]*\\(`, 'g')) || []).length;
    if (occorrenze - dichiarazioni === 0) {
      morte.push({ nome, perche: 'dichiarata e mai nominata altrove: il codice che contiene non gira per nessuno' });
    }
  }
  return morte.sort((a, b) => a.nome.localeCompare(b.nome));
}
