/*
 * ⛔ 24/09/2026 — L'AVANZAMENTO di una ricerca approfondita in corso, decisione owner («Barra + fase e conteggi», memoria
 *   `ricerca-approfondita-barra-di-avanzamento`). Prima la riga diceva solo «In corso» e l'owner non sapeva a che punto
 *   fosse. Il server calcola `avanzamento` (harness-ui/src/research/avanzamento.mjs) dai fatti che ha: piano, passi del
 *   giornale, parti del rapporto. Qui si disegna e basta.
 * - La barra è il `<progress>` a tema del sistema (`talos-context__progress`, index.css), la stessa della compattazione:
 *   nessuna barra nuova. Senza una frazione nota non c'è barra: una barra inventata direbbe un falso.
 * - Sotto, la fase in parole e i conteggi veri. Lo stato si legge anche senza colore (è testo) e senza movimento.
 * - `aria-valuetext` porta il conteggio a chi usa un lettore di schermo (MDN `<progress>`; W3C APG «Range Related
 *   Properties», già citati in context-progress.js). La riga non è una regione viva: un numero che cambia ogni 30 s non
 *   deve farsi annunciare.
 * Fonti: dossier `.claude/RICERCA-CARTELLE-E-AVANZAMENTO-RICERCA-2026-09-24.md` (ChatGPT deep research, mobile
 *   `researchRun.ts:457`).
 */
const FRASI_FASE = Object.freeze({
  piano: 'Prepara il piano',
  ricerca: 'Cerca e legge le fonti',
  scrittura: 'Scrive il rapporto',
  verifica: 'Verifica le citazioni',
  pausa: 'In pausa',
  conclusa: 'Conclusa',
});

const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

/** I testi dell'avanzamento, puri: la fase, i conteggi e la frase per chi non vede la barra. */
export function testiAvanzamentoRicerca(av) {
  if (!av || typeof av !== 'object') return null;
  const fase = FRASI_FASE[av.fase] ?? null;
  const conteggi = [];
  if (Number.isInteger(av.lineeTotali) && av.lineeTotali > 0 && Number.isInteger(av.lineaCorrente) && av.fase === 'ricerca') {
    conteggi.push(`linea ${av.lineaCorrente} di ${av.lineeTotali}`);
  }
  if (Number.isInteger(av.fontiLette) && av.fontiLette > 0) conteggi.push(plurale(av.fontiLette, 'fonte letta', 'fonti lette'));
  if (Number.isInteger(av.partiRapporto) && av.partiRapporto > 0) conteggi.push(plurale(av.partiRapporto, 'parte del rapporto scritta', 'parti del rapporto scritte'));
  const frazione = typeof av.frazione === 'number' && av.frazione >= 0 && av.frazione <= 1 ? av.frazione : null;
  const finiti = (Number(av.passiFatti) || 0) + (Number(av.passiFalliti) || 0);
  const accessibile = [
    fase,
    Number.isInteger(av.passiStimati) ? `${finiti} passi su circa ${av.passiStimati} previsti dal piano` : null,
    ...conteggi,
  ].filter(Boolean).join(', ');
  return { fase, conteggi, frazione, percento: frazione === null ? null : Math.round(frazione * 100), accessibile };
}

/** Il blocco da mettere sotto il titolo di una ricerca in corso: barra (se nota) e una riga di testo. */
export function creaAvanzamentoRicerca(doc, av, { etichetta = 'Avanzamento della ricerca' } = {}) {
  const t = testiAvanzamentoRicerca(av);
  if (!t || (!t.fase && t.frazione === null)) return null;
  const blocco = doc.createElement('span');
  blocco.className = 'talos-research-progress';
  blocco.dataset.researchProgress = av.fase ?? '';
  if (t.frazione !== null) {
    const barra = doc.createElement('progress');
    barra.className = 'talos-context__progress';
    barra.max = 100;
    barra.value = t.percento;
    barra.setAttribute('aria-label', etichetta);
    barra.setAttribute('aria-valuetext', t.accessibile || `${t.percento}%`);
    blocco.append(barra);
  }
  const riga = doc.createElement('span');
  riga.className = 'talos-research-progress__text';
  riga.textContent = [t.fase, ...t.conteggi].filter(Boolean).join(' · ');
  blocco.append(riga);
  return blocco;
}
