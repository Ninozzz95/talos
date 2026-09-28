/*
 * ⛔ 24/09/2026 — L'AVANZAMENTO di una ricerca approfondita, decisione owner («Barra + fase e conteggi», memoria
 *   `ricerca-approfondita-barra-di-avanzamento`). Prima una ricerca «in corso» diceva solo lo stato: l'owner non vedeva
 *   a che punto fosse (sessione f2424a97…, ricerca 92536781…: 2 linee, 7 passi, 2 parti del rapporto).
 *
 * Tutto DERIVATO dai fatti che il server ha già: il piano su disco (le linee e la loro stima), i passi del giro ricostruito
 * dal giornale (`talosResearchReplay`) e gli eventi `deposit_part`. Niente di stimato a occhio:
 *   - `frazione` = passi finiti (fatti o falliti) sui passi STIMATI dal piano (ricerche + pagine per linea), compressa
 *     sotto 0,9 finché la ricerca raccoglie, 0,93 mentre scrive il rapporto, 0,96 mentre verifica; 1 solo a `done`.
 *     «Mai al 100% prima della fine» è la regola dell'owner: la stima del piano è una stima, i passi veri possono essere
 *     di più, e una barra piena su una ricerca ancora viva mentirebbe.
 *   - `null` dove non si sa (una ricerca senza piano, o ferma): una barra inventata è peggio di nessuna barra.
 * Fonti: mobile `researchRun.ts:457` (fatti di totale); ChatGPT deep research (passi e fonti mentre gira), help.openai.com
 * 10500283, letto 24/09/2026; dossier `.claude/RICERCA-CARTELLE-E-AVANZAMENTO-RICERCA-2026-09-24.md`.
 */

const FASI = Object.freeze({
  planning: 'piano', awaiting_plan_approval: 'piano',
  collecting: 'ricerca', synthesising: 'scrittura', verifying: 'verifica',
  pause_requested: 'pausa', paused: 'pausa',
  done: 'conclusa', cancelled: 'annullata', failed: 'fallita',
});

const TETTO_PER_FASE = Object.freeze({ piano: 0.02, ricerca: 0.9, scrittura: 0.93, verifica: 0.96 });

export function avanzamentoRicerca({ piano = [], passi = [], eventi = [], statoGiro = null, stato = null } = {}) {
  const linee = Array.isArray(piano) ? piano : [];
  const tuttiIPassi = Array.isArray(passi) ? passi : [];
  const stimati = linee.reduce((t, l) => t + (Number(l?.estimate?.searches) || 0) + (Number(l?.estimate?.pages) || 0), 0);
  const fatti = tuttiIPassi.filter((p) => p?.state === 'done').length;
  const falliti = tuttiIPassi.filter((p) => p?.state === 'failed').length;
  const fontiLette = tuttiIPassi.filter((p) => p?.kind === 'read' && p?.state === 'done').length;
  const partiRapporto = (Array.isArray(eventi) ? eventi : []).filter((e) => e?.kind === 'deposit_part').length;
  const lineeIniziate = new Set(tuttiIPassi.map((p) => p?.branchId).filter(Boolean));
  const ultimo = [...tuttiIPassi].filter((p) => p?.startedAt).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))).at(-1);
  const lineaCorrente = ultimo ? linee.findIndex((l) => l?.id === ultimo.branchId) + 1 : 0;
  let fase = FASI[statoGiro] ?? null;
  // Un deposito del rapporto vuol dire che la raccolta è finita, anche se il giro non lo ha ancora scritto.
  if (fase === 'ricerca' && partiRapporto > 0) fase = 'scrittura';
  if (stato === 'done') fase = 'conclusa';
  let frazione = null;
  if (fase === 'conclusa') frazione = 1;
  else if (stato === 'running' && fase === 'ricerca' && stimati > 0) frazione = Math.min(TETTO_PER_FASE.ricerca, TETTO_PER_FASE.ricerca * ((fatti + falliti) / stimati));
  // Piano, scrittura e verifica hanno un punto fisso; la raccolta SENZA stima non ne ha uno (visto dalla prova al contrario).
  else if (stato === 'running' && fase !== 'ricerca' && Object.hasOwn(TETTO_PER_FASE, fase)) frazione = TETTO_PER_FASE[fase];
  return {
    fase,
    frazione: frazione === null ? null : Math.round(frazione * 1000) / 1000,
    passiFatti: fatti,
    passiFalliti: falliti,
    passiStimati: stimati > 0 ? stimati : null,
    lineeTotali: linee.length,
    lineeIniziate: lineeIniziate.size,
    lineaCorrente: lineaCorrente > 0 ? lineaCorrente : null,
    fontiLette,
    partiRapporto,
  };
}
