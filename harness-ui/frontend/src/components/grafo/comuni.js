/*
 * ⭐ Refactor dei grafi (26/09/2026) — gli aiuti CONDIVISI del diagramma del workflow: parole e toni degli stati, famiglie dei
 *   conteggi (D29), icone dai ruoli (D28), durate e modello (D27), numeri raggruppati. Spostati qui da `grafo-workflow.js`
 *   senza cambiarli, perché la tela, la vista Tempo e il rail li usano tutti e `grafo-workflow.js` ora importa la tela: tenerli
 *   là avrebbe fatto un ciclo di import. `grafo-workflow.js` li riesporta, così chi li importava da lì non cambia.
 */
/** Decisione 6: fino a qui ogni passo ha la sua card (mockup 14); oltre, le fasi diventano card di gruppo (mockup 200).
 *  Il numero è misurato — ledger F3-42, «La soglia»: la prova R4 limita a 25 le card visibili nei livelli raggruppati. */
export const SOGLIA_AGENTI = 25;
/** Il dettaglio per agente si può chiedere a mano fino a qui (una bozza del modello ha al più 50 passi, `DRAFT_POLICY`). */
export const MASSIMO_DETTAGLIO = 50;
export const RIGHE_CAMPIONE = 4;
export const PAGINA_ELENCO = 20;

/* Stato di un passo IN PAROLE, e il tono che lo accompagna (mai solo il colore: WCAG 1.4.1, ogni tono ha anche un'icona). */
export const STATI_PASSO = Object.freeze({
  planned: { parola: 'Pianificato', tono: 'neutro' },
  pending: { parola: 'In attesa', tono: 'attesa' },
  /* F3-52, giro VERO sul 4174 (25/09): un passo che aspetta un passo precedente è `blocked` nel riduttore (`run.mjs:134`) e a
     schermo diceva «Stato sconosciuto»; le fixture usavano solo `pending`. Per chi guarda è la stessa attesa del mockup. */
  blocked: { parola: 'In attesa', tono: 'attesa' },
  ready: { parola: 'Pronto', tono: 'attesa' },
  leased: { parola: 'In avvio', tono: 'corso' },
  running: { parola: 'In esecuzione', tono: 'corso' },
  retry_wait: { parola: 'Riprova a breve', tono: 'attesa' },
  waiting_human: { parola: 'Aspetta te', tono: 'avviso' },
  reconciling: { parola: 'In verifica', tono: 'avviso' },
  uncertain: { parola: 'Da verificare', tono: 'errore' },
  succeeded: { parola: 'Concluso', tono: 'ok' },
  failed: { parola: 'Non riuscito', tono: 'errore' },
  cancelled: { parola: 'Annullato', tono: 'neutro' },
  skipped: { parola: 'Saltato', tono: 'neutro' },
  superseded: { parola: 'Sostituito', tono: 'neutro' },
});
export const statoPasso = (stato) => STATI_PASSO[stato] ?? { parola: 'Stato sconosciuto', tono: 'neutro' };

export const STATI_RUN = Object.freeze({
  created: 'Creato', running: 'In esecuzione', paused: 'In pausa', needs_attention: 'Serve attenzione',
  succeeded: 'Riuscito', failed: 'Non riuscito', cancelled: 'Annullato', planned: 'Da avviare',
  proposed: 'Da approvare', approved: 'Approvato, da avviare',
  // F3-52: chiesti e non ancora compiuti (i passi in corso stanno finendo o si stanno fermando)
  pausing: 'Pausa in corso', cancelling: 'Annullamento in corso',
});
/*
 * F3-52 (25/09/2026): la parola dello stato del run. Una pausa o un annullamento CHIESTI valgono solo finché il run non è
 * finito: il registro tiene `cancelRequested: true` anche dopo «Annullato» (misurato sul 4174 il 25/09, run `81d33e4f`: la
 * testata restava su «Annullamento in corso» a run chiuso). Stessa regola della proiezione del riduttore (`run.mjs:620`).
 */
export function statoDelRun(panoramica, { tipo = 'run', revisione = null } = {}) {
  if (tipo !== 'run') return revisione?.status === 'approved' ? 'approved' : 'proposed';
  const p = panoramica ?? {};
  if (['succeeded', 'failed', 'cancelled'].includes(p.status)) return p.status;
  if (p.cancelRequested === true) return 'cancelling';
  if (p.status === 'running' && p.pauseRequested === true) return 'pausing';
  return p.status;
}
export const TONO_RUN = { running: 'corso', created: 'corso', paused: 'attesa', needs_attention: 'errore', succeeded: 'ok', failed: 'errore', cancelled: 'neutro',
  pausing: 'attesa', cancelling: 'neutro' };
export const ICONA_TONO = { ok: 'i-check', corso: 'i-play', attesa: 'i-clock', avviso: 'i-user', errore: 'i-x', neutro: null };

/* D29: le famiglie dei conteggi di una fase. «Errori» sta a parte, come vuole la decisione. */
export const FAMIGLIE = Object.freeze([
  ['conclusi', 'Conclusi', ['succeeded', 'skipped'], 'ok'],
  ['inCorso', 'In esecuzione', ['leased', 'running'], 'corso'],
  ['inAttesa', 'In attesa', ['pending', 'blocked', 'ready', 'retry_wait', 'waiting_human', 'reconciling', 'planned'], 'attesa'],
  ['errori', 'Errori', ['failed', 'uncertain'], 'errore'],
  ['annullati', 'Annullati', ['cancelled', 'superseded'], 'neutro'],
]);
export function conteggiFase(counts = {}) {
  const esito = {};
  for (const [chiave, , stati] of FAMIGLIE) esito[chiave] = stati.reduce((somma, stato) => somma + (counts[stato] ?? 0), 0);
  return esito;
}
/** D29: terminati/totale, per difetto — «100%» solo a fase finita. `null` nel grafo pianificato (nessuno stato inventato). */
export function percentualeFase(gruppo) {
  return typeof gruppo?.progress === 'number' ? Math.floor(gruppo.progress * 100) : null;
}
/*
 * F3-52, giro VERO sul 4174 (25/09): le testate delle fasi restavano indietro di 1-3 s rispetto alle card — le card si
 * aggiornano col fotogramma, i conteggi per fase solo con la rilettura della panoramica (al più una al secondo, più il viaggio).
 * Per un passo di cui si conosce lo stato di PRIMA (è fra le righe caricate) il conteggio della sua fase si sposta subito, come
 * la sua card; gli altri li porta la rilettura, che resta la fonte di verità e sovrascrive tutto.
 */
export const STATI_TERMINALI = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
export function spostaConteggi(gruppi = [], cambi = []) {
  for (const { phaseId, da, a } of cambi) {
    if (!da || !a || da === a) continue;
    const g = gruppi.find((x) => x.phaseId === phaseId);
    if (!g?.counts || !((g.counts[da] ?? 0) > 0)) continue; // lo stato di prima non torna coi conteggi: decide la rilettura
    g.counts = { ...g.counts, [da]: g.counts[da] - 1, [a]: (g.counts[a] ?? 0) + 1 };
    if (g.counts[da] === 0) delete g.counts[da];
    g.terminated = Object.entries(g.counts).reduce((t, [st, n]) => t + (STATI_TERMINALI.has(st) ? n : 0), 0);
    if (typeof g.progress === 'number' && g.total > 0) g.progress = g.terminated / g.total;
  }
  return gruppi;
}
export function tonoFase(gruppo) {
  const c = conteggiFase(gruppo?.counts);
  if (percentualeFase(gruppo) === null) return 'neutro';
  if (c.errori > 0) return 'errore';
  // F3-52, giro vero: una fase di soli passi ANNULLATI è terminata ma non riuscita — il verde spetta a chi è concluso
  if (gruppo.total > 0 && gruppo.terminated === gruppo.total) return c.conclusi === gruppo.total ? 'ok' : 'neutro';
  if (c.inCorso > 0) return 'corso';
  return 'attesa';
}

/* D28: icone dai ruoli del contratto; senza ruolo, dal tipo del passo; senza nessuno dei due, l'agente generico. */
export const ICONE_RUOLO = Object.freeze({
  coordinator: 'i-coordina', researcher: 'i-search', implementer: 'i-code', reviewer: 'i-shield', integrator: 'i-layers', tester: 'i-flask',
});
const ICONE_TIPO = Object.freeze({ test: 'i-flask', verify: 'i-shield', judge: 'i-shield', merge: 'i-layers', reduce: 'i-layers', artifact: 'i-doc', human: 'i-user' });
const piuFrequente = (conti, ordine) => {
  let scelta = null, massimo = 0;
  for (const chiave of ordine) if ((conti?.[chiave] ?? 0) > massimo) { scelta = chiave; massimo = conti[chiave]; }
  return scelta;
};
export function iconaDellaFase(gruppo) {
  const ruolo = piuFrequente(gruppo?.roles, Object.keys(ICONE_RUOLO));
  if (ruolo) return ICONE_RUOLO[ruolo];
  const tipo = piuFrequente(gruppo?.kinds, Object.keys(ICONE_TIPO));
  return tipo ? ICONE_TIPO[tipo] : 'i-robot';
}
export const iconaDelPasso = (riga) => ICONE_RUOLO[riga?.role] ?? ICONE_TIPO[riga?.kind] ?? 'i-robot';

export function formattaDurata(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  const secondi = Math.floor(ms / 1000);
  if (secondi < 60) return `${secondi} s`;
  const minuti = Math.floor(secondi / 60);
  if (minuti < 60) return `${minuti} min`;
  return `${Math.floor(minuti / 60)} h ${minuti % 60} min`;
}
/** D27: la durata di un passo finito la dice il server; di un passo in corso la calcola chi guarda, dall'inizio. */
export function durataDelPasso(riga, adesso = Date.now()) {
  if (typeof riga?.durationMs === 'number') return riga.durationMs;
  if (riga?.startedAt && !riga.finishedAt && statoPasso(riga.state).tono === 'corso') {
    const inizio = Date.parse(riga.startedAt);
    return Number.isFinite(inizio) ? Math.max(0, adesso - inizio) : null;
  }
  return null;
}
/** Il modello di un passo: quello EFFETTIVO se il passo è partito, poi quello scelto nella versione, poi quello della sessione. */
export const modelloDelPasso = (riga, modelloSessione = null) => riga?.effectiveModel?.model ?? riga?.model ?? modelloSessione ?? null;
export const livelloPer = (totale) => (totale <= SOGLIA_AGENTI ? 'agenti' : 'gruppi');
/* ⛔ 25/09/2026, prova nel browser: in italiano `toLocaleString` NON raggruppa i numeri di quattro cifre (CLDR, minimo due
   cifre di raggruppamento: «5000», «1120»), mentre il mockup scrive «5.000» e «1.120». `useGrouping: 'always'` (ECMA-402,
   Intl.NumberFormat v3) li raggruppa sempre. */
const NUMERO = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
export const cifra = (n) => NUMERO.format(n);
export const plurale = (n, uno, molti) => `${cifra(n)} ${n === 1 ? uno : molti}`;
export const maiuscola = (testo) => (testo ? testo[0].toLocaleUpperCase('it-IT') + testo.slice(1) : testo);
export const ora = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null;
};
