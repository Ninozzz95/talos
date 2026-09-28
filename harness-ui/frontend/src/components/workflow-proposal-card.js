/*
 * ⭐ F3 Workflow UI, fetta F3-33a (25/09/2026) — la CARD della proposta di workflow nel transcript, nel punto dell'attrezzo
 *   (decisione owner D20). Sorella della scheda del Piano (`plan-artifact.js`): stesse classi di base, stessa gerarchia —
 *   testata con lo stato a parole, corpo, piede — e le azioni del Workflow (decisione 5: Approva congela la versione e
 *   l'impronta, Avvia è un passo separato).
 * Fonti (dossier `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md`, 23/09/2026): Claude Code dynamic workflow — card di
 *   approvazione nel transcript con le fasi e l'avviso sui token prima dell'esecuzione (D2); VS Code «approving a plan and
 *   approving tool actions are separate decisions» (D5); avanzamento e costi onesti (B7, B8: un costo ignoto resta ignoto).
 * ⛔ Lo stato si legge SEMPRE dal server (revisione e run), mai dagli eventi della conversazione: alla ricarica la card si
 *   ricostruisce uguale. ⛔ Nessun nome tecnico a schermo: gli avvisi del controllo preliminare arrivano in inglese tecnico e
 *   si traducono per codice; un codice sconosciuto diventa una frase generica, mai il testo grezzo.
 */
export const RICEVUTA_PROPOSTA = 'talos.workflow-proposal-receipt.v1';
export const VISTA_PROPOSTA = 'talos.workflow-proposal-view.v2';
const IMPRONTA = /^sha256:[0-9a-f]{64}$/u;
const ID = /^[0-9a-f-]{36}$/u;

/** La ricevuta dell'attrezzo (`ToolCallResult`): l'unica cosa che la card prende dalla conversazione. */
export function leggiRicevutaProposta(contenuto) {
  let valore = contenuto;
  if (typeof contenuto === 'string') { try { valore = JSON.parse(contenuto); } catch { return null; } }
  if (!valore || typeof valore !== 'object') return null;
  if (valore.schema !== RICEVUTA_PROPOSTA) return typeof valore.schema === 'string' && /workflow-proposal-receipt/u.test(valore.schema) ? { nonSupportata: true } : null;
  if (typeof valore.workflowId !== 'string' || !ID.test(valore.workflowId) || !Number.isSafeInteger(valore.version) || valore.version < 1
    || typeof valore.definitionHash !== 'string' || !IMPRONTA.test(valore.definitionHash)) return null;
  return { workflowId: valore.workflowId, version: valore.version, definitionHash: valore.definitionHash };
}

const TESTI_AVVISI = Object.freeze({
  PREFLIGHT_UNKNOWN_COST: 'Il costo non si può stimare in anticipo: resta sconosciuto, non zero.',
});
const testoAvviso = (voce) => TESTI_AVVISI[voce?.code] ?? 'Il controllo preliminare ha un avviso su questa proposta.';

const STATI_RUN = Object.freeze({
  created: { chiave: 'avviato', etichetta: 'Avviato' },
  running: { chiave: 'in-esecuzione', etichetta: 'In esecuzione' },
  paused: { chiave: 'in-pausa', etichetta: 'In pausa' },
  needs_attention: { chiave: 'attenzione', etichetta: 'Serve attenzione' },
  succeeded: { chiave: 'riuscito', etichetta: 'Riuscito' },
  failed: { chiave: 'non-riuscito', etichetta: 'Non riuscito' },
  cancelled: { chiave: 'annullato', etichetta: 'Annullato' },
});

/** Lo stato della card, in una chiave stabile (per il CSS e le prove) e in parole (per le persone). Puro. */
export function statoCardProposta({ revisione = null, run = null, nonDisponibile = false, carica = false } = {}) {
  if (nonDisponibile) return { chiave: 'non-disponibile', etichetta: 'Non disponibile' };
  if (carica || !revisione) return { chiave: 'carica', etichetta: 'Carico la proposta' };
  if (run) return STATI_RUN[run.status] ?? { chiave: 'avviato', etichetta: 'Avviato' };
  if (revisione.status === 'approved') return { chiave: 'approvato', etichetta: 'Approvato, da avviare' };
  if (revisione.status === 'proposed') return { chiave: 'da-approvare', etichetta: 'Da approvare' };
  return { chiave: 'non-disponibile', etichetta: 'Non disponibile' };
}

// quattro cifre raggruppate anche in italiano («1.000 attrezzi»), come nel diagramma (F3-42, ECMA-402 `useGrouping: 'always'`)
const numero = (n) => new Intl.NumberFormat('it-IT', { useGrouping: 'always' }).format(n);
function durata(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minuti = Math.round(ms / 60_000);
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60); const resto = minuti % 60;
  return resto ? `${ore} h ${resto} min` : `${ore} h`;
}
const costo = (usd) => (typeof usd === 'number' ? `fino a ${usd.toFixed(2)} $` : 'non stimabile in anticipo');

/*
 * ⭐ F3-33b (25/09/2026) — i SEI tetti del run che una persona può cambiare (decisione owner: «i sei del run»), nell'ordine
 *   in cui li pesa. Ogni campo sa come si scrive a schermo, come si legge da un campo di testo e in che unità: il tempo in
 *   minuti, il costo in dollari (facoltativo: vuoto = non impostato), il resto in numeri interi. Nessun massimo e mai spento:
 *   un valore vuoto o non valido si RIFIUTA (decisione owner; openai-agents-js #1819, un NaN spegneva il tetto).
 */
export const CAMPI_TETTI = Object.freeze([
  { chiave: 'wallMs', etichetta: 'Tempo massimo', unita: 'min', mostra: (v) => durata(v), inCampo: (v) => String(Math.round(v / 60_000)), daCampo: (n) => n * 60_000 },
  { chiave: 'modelRequests', etichetta: 'Richieste al modello', unita: 'richieste', mostra: (v) => numero(v) },
  { chiave: 'promptTokens', etichetta: 'Token letti', unita: 'token', mostra: (v) => numero(v) },
  { chiave: 'completionTokens', etichetta: 'Token scritti', unita: 'token', mostra: (v) => numero(v) },
  { chiave: 'toolCalls', etichetta: 'Attrezzi usati', unita: 'chiamate', mostra: (v) => numero(v) },
  { chiave: 'knownCostUsd', etichetta: 'Costo', unita: '$', facoltativo: true, decimale: true, mostra: (v) => costo(v),
    inCampo: (v) => (typeof v === 'number' ? String(v) : ''), daCampo: (n) => n },
]);
const valoreInCampo = (campo, valore) => (campo.inCampo ? campo.inCampo(valore) : (Number.isSafeInteger(valore) ? String(valore) : ''));

/** I tetti in parole: quelli che una persona sa pesare, nell'ordine in cui li pesa. Un valore assente non si inventa. */
export function righeTetti(budgets = {}) {
  const righe = [];
  for (const campo of CAMPI_TETTI) {
    if (campo.chiave === 'knownCostUsd') { righe.push([campo.etichetta, costo(budgets.knownCostUsd)]); continue; }
    const testo = Number.isFinite(budgets[campo.chiave]) ? campo.mostra(budgets[campo.chiave]) : null;
    if (testo) righe.push([campo.etichetta, testo]);
  }
  return righe;
}

/** La bozza dei campi, dai tetti della versione: stringhe, come stanno nei campi di testo. */
export const bozzaDaiTetti = (budgets = {}) => Object.fromEntries(CAMPI_TETTI.map((campo) => [campo.chiave, valoreInCampo(campo, budgets[campo.chiave])]));

/**
 * Legge la bozza: per ogni campo il valore del server (`budgets`) o un errore in parole; e i soli tetti CAMBIATI, da mandare.
 * Intero > 0 (il costo: numero > 0 con al più due decimali, oppure vuoto = non impostato). Virgola o punto per i decimali.
 */
export function leggiBozzaTetti(bozza = {}, budgets = {}) {
  const cambiati = {}; const errori = {};
  for (const campo of CAMPI_TETTI) {
    const grezzo = String(bozza[campo.chiave] ?? '').trim().replace(',', '.');
    if (grezzo === '' && campo.facoltativo) {
      if (budgets[campo.chiave] !== null && budgets[campo.chiave] !== undefined) cambiati[campo.chiave] = null;
      continue;
    }
    const forma = campo.decimale ? /^\d+(?:\.\d{1,2})?$/u : /^\d+$/u;
    const numeroLetto = forma.test(grezzo) ? Number(grezzo) : Number.NaN;
    if (!Number.isFinite(numeroLetto) || numeroLetto <= 0 || (!campo.decimale && !Number.isSafeInteger(numeroLetto))) {
      errori[campo.chiave] = campo.facoltativo ? 'Un importo maggiore di zero, oppure vuoto.' : 'Un numero intero maggiore di zero.';
      continue;
    }
    const valore = campo.daCampo ? campo.daCampo(numeroLetto) : numeroLetto;
    if (!campo.decimale && !Number.isSafeInteger(valore)) { errori[campo.chiave] = 'Numero troppo grande.'; continue; }
    if (valore !== budgets[campo.chiave]) cambiati[campo.chiave] = valore;
  }
  return { cambiati, errori, valida: Object.keys(errori).length === 0, vuota: Object.keys(cambiati).length === 0 };
}

function ora(at) {
  const data = typeof at === 'string' ? new Date(at) : null;
  if (!data || Number.isNaN(data.getTime())) return null;
  return String(data.getHours()).padStart(2, '0') + ':' + String(data.getMinutes()).padStart(2, '0');
}

/** La card vuota, subito al posto dell'attrezzo; il contenuto arriva con `disegnaCardProposta` quando il server risponde. */
export function creaCardProposta({ document = globalThis.document, ricevuta } = {}) {
  const section = document.createElement('section');
  section.className = 'talos-plan-artifact talos-workflow-proposal';
  section.dataset.c = 'WorkflowProposalCard';
  if (ricevuta?.workflowId) { section.dataset.workflowId = ricevuta.workflowId; section.dataset.version = String(ricevuta.version); }
  disegnaCardProposta(section, { document, nonDisponibile: Boolean(ricevuta?.nonSupportata), carica: !ricevuta?.nonSupportata });
  return section;
}

/**
 * Ridisegna la card da capo (idempotente): `revisione` è la vista del server (`VISTA_PROPOSTA`) dell'ULTIMA versione, `run`
 * il run di questo workflow se esiste, `inVolo` il gesto in corso («approva» | «avvia» | «salva»), `errore` una frase per la
 * persona. F3-33b: `precedente` sono i tetti della versione prima (le differenze si vedono, D19 a), `avviabilePrima` la
 * versione approvata che resta avviabile finché questa non è approvata, `bozzaTetti` (non nullo) la modifica in corso.
 */
export function disegnaCardProposta(section, {
  document = globalThis.document, revisione = null, run = null, nonDisponibile = false, carica = false,
  inVolo = null, errore = null, onApprova = null, onAvvia = null, onApriDiagramma = null,
  precedente = null, avviabilePrima = null, bozzaTetti = null, onModifica = null, onSalvaTetti = null, onAnnullaModifica = null,
  onAvviaPrima = null,
} = {}) {
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const schemaNoto = !revisione || revisione.schema === VISTA_PROPOSTA;
  const stato = statoCardProposta({ revisione, run, nonDisponibile: nonDisponibile || !schemaNoto, carica });
  section.dataset.status = stato.chiave;
  const titoloTesto = stato.chiave === 'non-disponibile' ? 'Workflow non disponibile'
    : revisione?.title ? revisione.title : 'Workflow proposto';
  section.setAttribute('aria-label', `Workflow: ${titoloTesto}, ${stato.etichetta.toLowerCase()}`);
  if (inVolo) section.setAttribute('aria-busy', 'true'); else section.removeAttribute?.('aria-busy');

  const testata = make('div', 'talos-plan-artifact__heading');
  const titolo = make('h3', null, titoloTesto);
  const chip = make('span', 'talos-plan-artifact__state', stato.etichetta);
  chip.setAttribute('role', 'status');
  testata.append(titolo, chip);
  const parti = [testata];

  if (stato.chiave === 'non-disponibile') {
    const corpo = make('div', 'talos-plan-artifact__body');
    corpo.append(make('p', null, 'Questa proposta non si può mostrare: il server non la riconosce o non la trova più. Chiedi al modello di riproporla.'));
    parti.push(corpo);
  } else if (stato.chiave === 'carica') {
    const corpo = make('div', 'talos-plan-artifact__body');
    corpo.append(make('p', 'talos-workflow-proposal__loading', 'Carico la proposta dal server…'));
    parti.push(corpo);
  } else {
    const corpo = make('div', 'talos-plan-artifact__body talos-workflow-proposal__body');
    if (revisione.objective) corpo.append(make('p', 'talos-workflow-proposal__objective', revisione.objective));
    // le fasi SONO una sequenza (ogni fase aspetta la precedente): l'elenco numerato dice un fatto, non decora
    const fasi = make('ol', 'talos-workflow-proposal__phases');
    fasi.setAttribute('aria-label', 'Fasi');
    for (const fase of revisione.phases ?? []) {
      const voce = make('li', 'talos-workflow-proposal__phase');
      voce.append(make('span', 'talos-workflow-proposal__phase-label', fase.label),
        make('span', 'talos-workflow-proposal__phase-count', fase.total === 1 ? ' 1 passo' : ` ${fase.total} passi`));
      // lo spazio sta nel TESTO, non solo nel margine: un lettore di schermo leggeva «Riassunti2 passi» (foto sul 4174, 25/09)
      fasi.append(voce);
    }
    corpo.append(fasi);
    /* F3-33b: i tetti hanno una testata con «Modifica» (solo prima dell'avvio, decisione owner) e, in modifica, diventano
       campi in loco; su una versione nata da una modifica ogni tetto cambiato dice il valore di prima (D19 a). */
    const modificabile = (stato.chiave === 'da-approvare' || stato.chiave === 'approvato') && !run;
    const inModifica = modificabile && bozzaTetti && typeof bozzaTetti === 'object';
    const testaTetti = make('div', 'talos-workflow-proposal__limits-head');
    testaTetti.append(make('span', 'talos-workflow-proposal__limits-title', 'Tetti'));
    if (modificabile && !inModifica && typeof onModifica === 'function') {
      const modifica = make('button', 'talos-button talos-button--ghost talos-button--sm', 'Modifica');
      modifica.type = 'button'; modifica.dataset.azione = 'modifica-tetti'; modifica.disabled = Boolean(inVolo);
      modifica.setAttribute('aria-label', 'Modifica i tetti: nasce una versione nuova da approvare');
      modifica.addEventListener?.('click', () => onModifica());
      testaTetti.append(modifica);
    }
    corpo.append(testaTetti);
    const tetti = make('dl', inModifica ? 'talos-workflow-proposal__limits talos-workflow-proposal__limits--edit' : 'talos-workflow-proposal__limits');
    tetti.setAttribute('aria-label', 'Tetti del workflow');
    let salva = null; let esitoBozza = null;
    const campiErrore = new Map();
    const aggiornaSalva = () => {
      esitoBozza = leggiBozzaTetti(bozzaTetti, revisione.budgets);
      for (const [chiave, riga] of campiErrore) {
        const messaggio = esitoBozza.errori[chiave] ?? '';
        riga.errore.textContent = messaggio;
        riga.input.setAttribute('aria-invalid', String(Boolean(messaggio)));
        const campo = CAMPI_TETTI.find((voce) => voce.chiave === chiave);
        const cambiato = Object.hasOwn(esitoBozza.cambiati, chiave);
        riga.prima.textContent = cambiato ? `prima: ${campo.mostra(revisione.budgets[chiave]) ?? 'non impostato'}` : '';
      }
      if (salva) salva.disabled = Boolean(inVolo) || !esitoBozza.valida || esitoBozza.vuota;
    };
    if (inModifica) {
      for (const campo of CAMPI_TETTI) {
        const riga = make('div', 'talos-workflow-proposal__limit talos-workflow-proposal__limit--edit');
        const id = `talos-wf-tetto-${revisione.workflowId}-${campo.chiave}`;
        const etichetta = make('dt', null); const label = make('label', null, campo.etichetta); label.setAttribute('for', id); etichetta.append(label);
        const valore = make('dd', 'talos-workflow-proposal__limit-field');
        const input = make('input', 'talos-workflow-proposal__limit-input');
        input.type = 'text'; input.id = id; input.inputMode = campo.decimale ? 'decimal' : 'numeric'; input.autocomplete = 'off';
        input.value = bozzaTetti[campo.chiave] ?? '';
        if (campo.facoltativo) input.placeholder = 'non impostato';
        const unita = make('span', 'talos-workflow-proposal__limit-unit', campo.unita);
        const prima = make('span', 'talos-workflow-proposal__limit-before');
        const erroreCampo = make('span', 'talos-workflow-proposal__limit-error'); erroreCampo.id = `${id}-errore`;
        input.setAttribute('aria-describedby', erroreCampo.id);
        // la bozza si aggiorna mentre si scrive, SENZA ridisegnare la card: il campo non perde né il fuoco né il cursore
        input.addEventListener?.('input', () => { bozzaTetti[campo.chiave] = input.value; aggiornaSalva(); });
        input.addEventListener?.('keydown', (evento) => {
          if (evento.key === 'Enter' && salva && !salva.disabled) { evento.preventDefault?.(); onSalvaTetti?.(esitoBozza.cambiati); }
          if (evento.key === 'Escape') { evento.preventDefault?.(); onAnnullaModifica?.(); }
        });
        valore.append(input, unita, prima, erroreCampo);
        riga.append(etichetta, valore);
        tetti.append(riga);
        campiErrore.set(campo.chiave, { input, errore: erroreCampo, prima });
      }
    } else {
      for (const [etichetta, testo] of righeTetti(revisione.budgets)) {
        const riga = make('div', 'talos-workflow-proposal__limit');
        const campo = CAMPI_TETTI.find((voce) => voce.etichetta === etichetta);
        const era = precedente && campo && precedente[campo.chiave] !== revisione.budgets[campo.chiave]
          ? (campo.mostra(precedente[campo.chiave]) ?? 'non impostato') : null;
        const dd = make('dd', null, testo);
        if (era) { const nota = make('span', 'talos-workflow-proposal__limit-was', ` (era ${era})`); dd.append?.(nota); dd.dataset.cambiato = 'true'; }
        riga.append(make('dt', null, etichetta), dd);
        tetti.append(riga);
      }
    }
    corpo.append(tetti);
    const avvisi = revisione.preflight?.warnings ?? [];
    const problemi = revisione.preflight?.errors ?? [];
    if (problemi.length || avvisi.length) {
      const note = make('ul', 'talos-workflow-proposal__notes');
      note.setAttribute('aria-label', 'Controllo preliminare');
      for (const voce of problemi) { const li = make('li', 'talos-workflow-proposal__note', `Da correggere: ${testoAvviso(voce)}`); li.dataset.kind = 'error'; note.append(li); }
      for (const voce of avvisi) { const li = make('li', 'talos-workflow-proposal__note', testoAvviso(voce)); li.dataset.kind = 'warning'; note.append(li); }
      corpo.append(note);
    }
    parti.push(corpo);

    const azioni = make('div', 'talos-workflow-proposal__actions');
    azioni.setAttribute('role', 'group');
    azioni.setAttribute('aria-label', 'Azioni sul workflow');
    const bottone = (testo, classe, azione, spento) => {
      const b = make('button', `talos-button ${classe} talos-button--sm`, testo);
      b.type = 'button';
      b.dataset.azione = azione;
      b.disabled = Boolean(spento);
      return b;
    };
    if (inModifica) {
      const prossima = (revisione.version ?? 1) + 1;
      salva = bottone(inVolo === 'salva' ? 'Salvo…' : `Salva come versione ${prossima}`, 'talos-button--primary', 'salva-tetti', true);
      salva.addEventListener?.('click', () => { if (esitoBozza?.valida && !esitoBozza.vuota) onSalvaTetti?.(esitoBozza.cambiati); });
      const annulla = bottone('Annulla', 'talos-button--ghost', 'annulla-modifica', Boolean(inVolo));
      annulla.addEventListener?.('click', () => onAnnullaModifica?.());
      azioni.append(salva, annulla, make('p', 'talos-workflow-proposal__hint',
        `Nasce la versione ${prossima}, da approvare. I passi restano ai loro tetti prudenti: se un tetto del run scende sotto quello di un passo, il passo si stringe.`));
      aggiornaSalva();
    } else if (stato.chiave === 'da-approvare') {
      const bloccata = problemi.length > 0;
      const approva = bottone(inVolo === 'approva' ? 'Approvo…' : 'Approva', 'talos-button--primary', 'approva', bloccata || inVolo || typeof onApprova !== 'function');
      approva.addEventListener?.('click', () => onApprova?.());
      azioni.append(approva);
      azioni.append(make('p', 'talos-workflow-proposal__hint', bloccata
        ? 'Non si può approvare finché il controllo preliminare trova problemi: chiedi al modello di correggerla.'
        : avviabilePrima
          ? `Approvare fissa questa versione. Finché non la approvi, la versione ${avviabilePrima.version} resta approvata e puoi avviarla.`
          : 'Approvare fissa questa versione. L\'avvio è un passo a parte.'));
      // F3-33b, decisione owner: la versione approvata prima resta avviabile finché questa non è approvata
      if (avviabilePrima && typeof onAvviaPrima === 'function') {
        const prima = bottone(inVolo === 'avvia-prima' ? 'Avvio…' : `Avvia la versione ${avviabilePrima.version}`, 'talos-button--ghost', 'avvia-prima', Boolean(inVolo));
        prima.addEventListener?.('click', () => onAvviaPrima());
        azioni.append(prima);
      }
    } else if (stato.chiave === 'approvato') {
      const avvia = bottone(inVolo === 'avvia' ? 'Avvio…' : 'Avvia', 'talos-button--primary', 'avvia', inVolo || typeof onAvvia !== 'function');
      avvia.addEventListener?.('click', () => onAvvia?.());
      azioni.append(avvia);
      const quando = ora(revisione.approval?.approvedAt);
      // la frase sulla sola lettura viene dalla POLITICA della versione, non da un testo fisso: un giorno gli scrittori arriveranno
      const soloLettura = revisione.policy?.capabilityCeiling === 'read' ? ' I passi leggono e cercano, non scrivono.' : '';
      azioni.append(make('p', 'talos-workflow-proposal__hint', (quando ? `Approvato alle ${quando}.` : 'Approvato.') + soloLettura));
    } else {
      const quando = ora(run?.createdAt);
      azioni.append(make('p', 'talos-workflow-proposal__hint', quando ? `Avviato alle ${quando}.` : 'Avviato.'));
    }
    // F3-42 (25/09/2026), D20: dalla card si apre il diagramma di QUESTO workflow — pianificato prima dell'avvio, il run dopo
    if (typeof onApriDiagramma === 'function' && !inModifica) {
      const diagramma = bottone('Apri diagramma', 'talos-button--ghost', 'diagramma', false);
      diagramma.addEventListener?.('click', () => onApriDiagramma());
      azioni.append(diagramma);
    }
    if (errore) {
      const riga = make('p', 'talos-plan-artifact__error', errore);
      riga.setAttribute('role', 'alert');
      azioni.append(riga);
    }
    parti.push(azioni);
    if (typeof revisione.definitionHash === 'string' && IMPRONTA.test(revisione.definitionHash)) {
      parti.push(make('p', 'talos-plan-artifact__footer', `Versione ${revisione.version} · impronta ${revisione.definitionHash.slice(7, 19)}`));
    }
  }
  if (typeof section.replaceChildren === 'function') section.replaceChildren(...parti);
  else { section.children = []; section.append(...parti); }
  return section;
}
