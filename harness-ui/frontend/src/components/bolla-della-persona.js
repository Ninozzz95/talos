/*
 * ⭐ C09 (owner 10/10/2026, «Come Hermes, completo») — LA BOLLA DELLA PERSONA, DAL VIVO E DOPO UNA RICARICA.
 *
 * Con un allegato partono DUE testi: quello per il modello (la frase, l'intestazione degli allegati, i percorsi, il
 * contenuto dei file) e quello della persona (la sua frase, più i chip). Dal vivo la bolla mostrava il secondo (O-41);
 * dopo una ricarica la storia aveva solo il primo, e la bolla rigiocata mostrava i file incollati e perdeva i chip.
 * Come Hermes (`agent/turn_context.py:686-691`, `persist_user_message` + `display_metadata`): la copia per lo schermo
 * viaggia accanto al messaggio, il server la conserva, la rigiocata la usa. Per le sessioni salvate prima, un lettore
 * stacca il blocco allegati dal testo per il modello riconoscendo le intestazioni che l'interfaccia ha scritto (IT ed EN).
 */

/** La forma minima di un allegato non immagine per i chip: le immagini viaggiano già a parte (`immagini`). */
export function allegatiPerBolla(allegati) {
  return (Array.isArray(allegati) ? allegati : [])
    .filter((a) => a && a.tipo !== 'immagine')
    .map((a) => ({
      ...(typeof a.tipo === 'string' ? { tipo: a.tipo } : {}),
      ...(typeof a.nome === 'string' && a.nome ? { nome: a.nome } : {}),
      ...((a.assoluto || a.percorso) ? { percorso: String(a.assoluto || a.percorso) } : {}),
      ...(a.daBrowser === true ? { daBrowser: true } : {}),
      ...(Number.isSafeInteger(a.caratteri) && a.caratteri >= 0 ? { caratteri: a.caratteri } : {}),
    }))
    .filter((a) => a.nome || a.percorso);
}

/** La bolla che accompagna un invio, solo quando ciò che la persona vede è diverso da ciò che parte per il modello. */
export function bollaDaInviare(mostra, perIlModello, allegati) {
  if (mostra === null || mostra === undefined || mostra === perIlModello) return null;
  const testo = String(mostra);
  const file = allegatiPerBolla(allegati);
  return testo.trim() === '' && file.length === 0 ? null : { testo, allegati: file };
}

const nomeDalPercorso = (percorso) => String(percorso).split(/[\\/]/).pop() || String(percorso);

/**
 * ⛔ Le sessioni salvate PRIMA della cura: la bolla non c'è, c'è solo il testo per il modello. Si stacca il blocco
 *   `\n\n<intestazione>\n- …` (un'intestazione che l'interfaccia ha scritto in una delle sue lingue, e almeno una riga «- »
 *   subito sotto: senza, il testo resta intero). Le righe diventano chip: «- nome (percorso)» per un file col suo testo,
 *   «- <prefisso><percorso>» per un file indicato col solo percorso.
 * @param {string} consegna
 * @param {{ intestazioni: string[], prefissiFile: string[] }} lingue
 * @returns {{ testo: string, allegati: object[] } | null}
 */
export function bollaDaConsegna(consegna, { intestazioni = [], prefissiFile = [] } = {}) {
  if (typeof consegna !== 'string' || consegna === '') return null;
  for (const intestazione of intestazioni.filter(Boolean)) {
    const segno = `\n\n${intestazione}\n- `;
    const dove = consegna.indexOf(segno);
    if (dove < 0) continue;
    const righe = consegna.slice(dove + segno.length - 2).split('\n');
    const allegati = [];
    for (const riga of righe) {
      if (!riga.startsWith('- ')) break;
      const corpo = riga.slice(2);
      const prefisso = prefissiFile.find((p) => p && corpo.startsWith(p));
      if (prefisso) { const percorso = corpo.slice(prefisso.length); allegati.push({ tipo: 'file', nome: nomeDalPercorso(percorso), percorso }); continue; }
      const conPercorso = /^(.*) \(([^()]*)\)$/u.exec(corpo);
      allegati.push(conPercorso ? { tipo: 'file', nome: conPercorso[1], percorso: conPercorso[2] } : { tipo: 'file', nome: corpo });
    }
    if (allegati.length) return { testo: consegna.slice(0, dove), allegati };
  }
  return null;
}

/**
 * Ciò che la bolla rigiocata deve mostrare: la bolla conservata se c'è, altrimenti quella ricostruita dal testo per il
 * modello; le immagini del giro si aggiungono ai chip. `null` = il testo così com'è (nessun allegato da staccare).
 */
export function bollaPerLaRigiocata({ bolla = null, consegna = '', immagini = [], lingue } = {}) {
  const base = bolla && typeof bolla === 'object' && typeof bolla.testo === 'string' ? bolla : bollaDaConsegna(consegna, lingue);
  if (!base) return null;
  return { testo: base.testo, allegati: [...(Array.isArray(base.allegati) ? base.allegati : []), ...(Array.isArray(immagini) ? immagini : [])] };
}
