import { t, tn, linguaCorrenteDiT } from './lingua.js';
/*
 * ⭐ F3-52 (25/09/2026) — i controlli del run del workflow (Pausa, Riprendi, Annulla, Riprova), nella testata del diagramma.
 *   Decisioni owner del 25/09 sera (ricerca `.claude/RICERCA-10x4-F3-52-CONTROLLI-2026-09-25.md`):
 *     21. accanto a «Torna alla chat»: un pulsante secondo lo stato più un «…» (anche col tasto destro) con gli altri, e
 *         Annulla in fondo — come il menu del loop di Hermes (`session-control-loop.tsx:121-145`) e «Re-run jobs» di GitHub;
 *     22. Annulla chiede conferma e dice le conseguenze (NN/g: la conferma ripete la richiesta e dice cosa succederà);
 *         Pausa e Riprendi no, sono reversibili;
 *     23. Riprova chiede conferma col CONTO: quanti passi, tentativi da capo, di quanto sale il tetto (decisione F3-51:
 *         «il tetto che si alza, detto prima»).
 *   ⛔ Si offre solo ciò che il server accetterebbe adesso: le regole sono quelle di `rifiutoDelControllo`
 *     (`workflow-orchestrator.mjs:396-412`), lette dalla panoramica (`status`, `pauseRequested`, `cancelRequested`).
 */
import { CAMPI_TETTI } from './workflow-proposal-card.js';

const cifra = (n) => new Intl.NumberFormat(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT', { useGrouping: 'always' }).format(n);
const somma = (panoramica, stati) => (panoramica?.groups ?? []).reduce((tot, g) => tot + stati.reduce((s, st) => s + (g.counts?.[st] ?? 0), 0), 0);
const RUN_FINITI = new Set(['succeeded', 'succeeded_with_set_aside', 'failed', 'cancelled']);

/*
 * ⭐ C3 (09/10/2026, «talos desktop») — le azioni della PERSONA su un passo fallito: Segna come fatto · Metti da parte · Rifai con
 *   un altro modello (decisione owner 07/10, come Hermes). Si offrono solo quando il server le accetterebbe: passo `failed`, run in
 *   corsa o in «Serve attenzione», nessun annullamento chiesto (`workflow-orchestrator.mjs` `resolveFailedStep`).
 */
export const AZIONI_SUL_PASSO = Object.freeze(['mark-done', 'set-aside', 'retry-other-model']);
export function passoRisolvibile(panoramica, statoDelPasso) {
  if (!panoramica?.runId || panoramica.cancelRequested === true) return false;
  if (statoDelPasso === 'failed') return ['running', 'needs_attention'].includes(panoramica.status);
  /* C3 tappa 2a: un passo INCERTO si decide quando il run chiede attenzione (il sistema ha rinunciato a riconciliarlo). Se il
     server non lo aspetta ancora, il comando torna 409 e lo si dice: è il server a sapere il motivo esatto. */
  return statoDelPasso === 'uncertain' && panoramica.status === 'needs_attention';
}

/** Le azioni offerte in questo stato: una principale (o nessuna), le altre per il «…», e una nota quando si aspetta. */
export function azioniDelRun(panoramica) {
  const vuoto = { principale: null, menu: [], nota: null };
  if (!panoramica?.runId || RUN_FINITI.has(panoramica.status)) return vuoto;
  const falliti = somma(panoramica, ['failed']);
  const annulla = { azione: 'cancel', etichetta: t('chat.run.cancel'), pericolo: true };
  const riprova = falliti > 0 ? { azione: 'retry', etichetta: tn('chat.run.retryOne', 'chat.run.retryMany', falliti, { n: cifra(falliti) }), falliti } : null;
  if (panoramica.cancelRequested) return { ...vuoto, nota: t('chat.run.note.cancelling') };
  if (panoramica.status === 'running' && panoramica.pauseRequested) {
    return { principale: null, menu: [annulla], nota: t('chat.run.note.pausing') };
  }
  if (panoramica.status === 'running') return { principale: { azione: 'pause', etichetta: t('chat.run.pause') }, menu: [...(riprova ? [riprova] : []), annulla], nota: null };
  if (panoramica.status === 'paused') return { principale: { azione: 'resume', etichetta: t('chat.run.resume') }, menu: [annulla], nota: null };
  /* C3 tappa 3 (09/10/2026, owner «quanto serve per finire»): se il run aspetta per il budget, la prima azione è «Alza il tetto
     e riprendi» (la cifra la dice la conferma, dall'anteprima del server); Riprova, se ci sono passi falliti, va nel «…». */
  if (panoramica.status === 'needs_attention' && (panoramica.attentionReasons ?? []).includes('budget_overrun')) {
    return { principale: { azione: 'raise-ceiling', etichetta: t('chat.run.raiseCeiling') }, menu: [...(riprova ? [riprova] : []), annulla], nota: null };
  }
  if (panoramica.status === 'needs_attention') return { principale: riprova, menu: [annulla], nota: null };
  return { principale: null, menu: [annulla], nota: null }; // «created»: solo Annulla
}

/** Le conseguenze di Annulla, dai conteggi veri (decisione owner 22). */
export function conseguenzeAnnulla(panoramica) {
  const inCorso = somma(panoramica, ['leased', 'running']);
  const nonPartiti = somma(panoramica, ['pending', 'blocked', 'ready', 'retry_wait', 'waiting_human', 'reconciling', 'planned']);
  const frasi = [];
  if (inCorso > 0) frasi.push(tn('chat.run.confirm.runningOne', 'chat.run.confirm.runningMany', inCorso, { n: cifra(inCorso) }));
  if (nonPartiti > 0) frasi.push(tn('chat.run.confirm.pendingOne', 'chat.run.confirm.pendingMany', nonPartiti, { n: cifra(nonPartiti) }));
  frasi.push(t('chat.run.confirm.resultsRemain'));
  return frasi.join(' ');
}

/** Di quanto sale il tetto con Riprova (anteprima del server), nelle parole dei tetti della card. Solo ciò che sale. */
export function righeAumento(ceilingRaise = {}) {
  const righe = [];
  for (const campo of CAMPI_TETTI) {
    const valore = ceilingRaise?.[campo.chiave];
    if (!(typeof valore === 'number' && Number.isFinite(valore) && valore > 0)) continue;
    righe.push([campo.etichetta, `+ ${campo.chiave === 'knownCostUsd' ? `${valore.toFixed(2)} $` : campo.mostra(valore)}`]);
  }
  return righe;
}

const TESTI_ERRORE = Object.freeze({
  get WORKFLOW_RUN_STATE_CONFLICT() { return t('chat.run.error.stateConflict'); },
  get WORKFLOW_COMMAND_CONFLICT() { return t('chat.run.error.commandConflict'); },
  get WORKFLOW_COMMAND_ORIGIN_FORBIDDEN() { return t('chat.run.error.originForbidden'); },
  get WORKFLOW_RUNTIME_NOT_READY() { return t('chat.run.error.notReady'); },
  get WORKFLOW_STORE_UNAVAILABLE() { return t('chat.run.error.storeUnavailable'); },
  get WORKFLOW_STORE_NEEDS_ATTENTION() { return t('chat.run.error.storeNeedsAttention'); },
  get NOT_FOUND() { return t('chat.run.error.notFound'); },
});
export const testoErroreRun = (code) => TESTI_ERRORE[code] ?? t('chat.run.error.generic');
export const TESTO_RIUSCITO = Object.freeze({
  get pause() { return t('chat.run.note.pausing'); },
  get resume() { return t('chat.run.ack.resumed'); },
  get cancel() { return t('chat.run.ack.cancelRequested'); },
  get retry() { return t('chat.run.ack.retryStarted'); },
  get 'raise-ceiling'() { return t('chat.run.ack.ceilingRaised'); },
});
export const testoAmbiguo = (azione) => (azione === 'retry'
  ? t('chat.run.unclear.retry')
  : t('chat.run.unclear.command'));

/**
 * La finestra di conferma: un `<dialog>` modale agganciato a `body` (⛔ `legacy-dom.js:68`: un `showModal()` dentro un
 * antenato nascosto rende inerte tutta la pagina), col gestore degli overlay per il fuoco e l'uscita, come `immagini-chat.js`.
 * Risolve `true` solo col pulsante di conferma; Esc, «Non ora» e la chiusura risolvono `false`.
 * ⭐ F6-2 (27/09/2026) — `scelte` facoltativo, `{ etichetta, voci: [{ valore, testo, dettaglio }], valore }`: una scelta dentro la
 *   conferma (owner, punto 22: «la conferma ha l'elenco dei remoti, preselezionato»). Un gruppo di radio NOSTRO, non un controllo
 *   nativo (regola dell'owner 13/09), col modello WAI-ARIA «Radio Group»: un solo punto di tabulazione, le frecce spostano e
 *   scelgono. La scelta si scrive in `scelte.valore`; senza una scelta il pulsante di conferma resta spento.
 */
/*
 * ⭐ C3 (09/10/2026) — due aggiunte facoltative, per le azioni sul passo:
 *   - `campo`, `{ etichetta, segnaposto, massimo, valore }`: un'area di testo (la `talos-textarea` del sistema). Il pulsante di
 *     conferma resta spento finché il testo è vuoto o fatto di soli spazi — «Segna come fatto» vuole un riassunto, come
 *     `complete_task` di Hermes (`kanban_db.py:2731`). Il testo si scrive in `campo.valore`.
 *   - `scelte.altro`, `{ testo, monta(contenitore, alScelto) }`: un'ultima voce («Altro modello…») che, scelta, monta sotto il
 *     selettore della chat; quando lì si sceglie, quel valore diventa la scelta (decisione owner 09/10: lista corta + selettore).
 */
export function apriConfermaRun(doc, { sopra, titolo, testo, righe = [], scelte = null, campo = null, conferma, pericolo = false, opener = null, gestore = null } = {}) {
  return new Promise((risolvi) => {
    const el = (tag, classe, t) => { const n = doc.createElement(tag); if (classe) n.className = classe; if (t != null) n.textContent = t; return n; };
    const id = `conferma-run-${Math.random().toString(36).slice(2, 9)}`;
    const dialogo = el('dialog', 'talos-wfg-conferma');
    dialogo.setAttribute('role', 'alertdialog'); dialogo.setAttribute('aria-labelledby', `${id}-titolo`); dialogo.setAttribute('aria-describedby', `${id}-testo`);
    const scatola = el('div', 'talos-dialog talos-wfg-conferma__scatola');
    const testa = el('div', 'talos-dialog__header');
    const titoli = el('div', 'talos-grow');
    if (sopra) titoli.append(el('span', 'talos-eyebrow', sopra));
    const h = el('h2', 'talos-dialog__title', titolo); h.id = `${id}-titolo`;
    titoli.append(h); testa.append(titoli);
    const corpo = el('div', 'talos-dialog__body');
    const p = el('p', 'talos-wfg-conferma__testo', testo); p.id = `${id}-testo`;
    corpo.append(p);
    if (righe.length) {
      const dl = el('dl', 'talos-wfg-conferma__righe');
      for (const [chiave, valore] of righe) { const r = el('div', 'talos-wfg-conferma__riga'); r.append(el('dt', null, chiave), el('dd', null, valore)); dl.append(r); }
      corpo.append(dl);
    }
    const piede = el('div', 'talos-dialog__footer');
    const no = el('button', 'talos-button talos-button--secondary', t('chat.run.confirm.notNow')); no.type = 'button';
    const si = el('button', `talos-button ${pericolo ? 'talos-button--secondary talos-button--danger' : 'talos-button--primary'}`, conferma); si.type = 'button';
    // il pulsante di conferma si accende quando OGNI richiesta della finestra è soddisfatta: la scelta, e il testo non vuoto
    // una scelta CHIESTA e senza voci non si può soddisfare: il pulsante resta spento (review del bugfixer, osservazione)
    const richieste = { scelta: !scelte, testo: true };
    const aggiornaConferma = () => { si.disabled = !(richieste.scelta && richieste.testo); };
    const conAltro = Boolean(scelte?.altro && typeof scelte.altro.monta === 'function');
    if (scelte && Array.isArray(scelte.voci) && (scelte.voci.length || conAltro)) {
      const gruppo = el('div', 'talos-wfg-conferma__scelte');
      gruppo.setAttribute('role', 'radiogroup');
      if (scelte.etichetta) gruppo.setAttribute('aria-label', scelte.etichetta);
      const opzione = (valore, testo, dettaglio) => {
        const b = el('button', 'talos-wfg-conferma__scelta');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.valore = valore;
        b.append(el('span', 'talos-wfg-conferma__scelta-nome', testo ?? valore));
        if (dettaglio) b.append(el('span', 'talos-wfg-conferma__scelta-dettaglio', dettaglio));
        return b;
      };
      const opzioni = scelte.voci.map((voce) => opzione(voce.valore, voce.testo, voce.dettaglio));
      // C3: «Altro modello…» è una voce del gruppo; il suo valore vero arriva dal selettore montato sotto
      const ALTRO = '\u0000altro';
      let valoreAltro = null;
      const voceAltro = conAltro ? opzione(ALTRO, scelte.altro.testo) : null;
      const montaggioAltro = conAltro ? el('div', 'talos-wfg-conferma__altro') : null;
      if (montaggioAltro) montaggioAltro.hidden = true;
      if (voceAltro) opzioni.push(voceAltro);
      let altroMontato = false;
      const segna = (valore) => {
        const suAltro = valore === ALTRO;
        scelte.valore = suAltro ? valoreAltro : valore;
        const scelto = opzioni.find((b) => b.dataset.valore === valore) ?? null;
        opzioni.forEach((b, i) => {
          b.setAttribute('aria-checked', String(b === scelto));
          // un solo punto di tabulazione: quello scelto, o il primo se non c'è ancora una scelta
          b.tabIndex = (scelto ? b === scelto : i === 0) ? 0 : -1;
        });
        if (montaggioAltro) {
          montaggioAltro.hidden = !suAltro;
          if (suAltro && !altroMontato) {
            altroMontato = true;
            scelte.altro.monta(montaggioAltro, (id) => {
              if (typeof id !== 'string' || !id.trim()) return;
              valoreAltro = id;
              voceAltro.querySelector('.talos-wfg-conferma__scelta-dettaglio')?.remove();
              voceAltro.append(el('span', 'talos-wfg-conferma__scelta-dettaglio', id));
              segna(ALTRO);
            });
          }
        }
        richieste.scelta = Boolean(scelte.valore);
        aggiornaConferma();
      };
      opzioni.forEach((b, i) => {
        b.addEventListener('click', () => segna(b.dataset.valore));
        b.addEventListener('keydown', (e) => {
          const passo = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!passo) return;
          e.preventDefault();
          const prossimo = opzioni[(i + passo + opzioni.length) % opzioni.length];
          segna(prossimo.dataset.valore);
          prossimo.focus();
        });
      });
      gruppo.append(...opzioni);
      corpo.append(gruppo);
      if (montaggioAltro) corpo.append(montaggioAltro);
      segna(scelte.voci.some((v) => v.valore === scelte.valore) ? scelte.valore : null);
    }
    let areaCampo = null;
    if (campo) {
      const contenitore = el('label', 'talos-field--stack talos-wfg-conferma__campo');
      const area = el('textarea', 'talos-textarea');
      area.id = `${id}-campo`;
      if (campo.segnaposto) area.placeholder = campo.segnaposto;
      if (Number.isSafeInteger(campo.massimo)) area.maxLength = campo.massimo;
      area.value = campo.valore ?? '';
      const leggi = () => { campo.valore = area.value; richieste.testo = area.value.trim().length > 0; aggiornaConferma(); };
      area.addEventListener('input', leggi);
      areaCampo = area;
      contenitore.append(el('span', 'talos-field__label', campo.etichetta), area);
      corpo.append(contenitore);
      leggi();
    }
    piede.append(el('span', 'talos-grow'), no, si);
    scatola.append(testa, corpo, piede); dialogo.append(scatola);
    const manager = gestore;
    let esito = false;
    no.addEventListener('click', () => dialogo.close());
    si.addEventListener('click', () => { esito = true; dialogo.close(); });
    dialogo.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.stopPropagation(); });
    dialogo.addEventListener('close', () => { manager?.deactivate(dialogo); dialogo.remove(); if (!manager) opener?.focus?.(); risolvi(esito); }, { once: true });
    doc.body.append(dialogo);
    dialogo.showModal();
    // il fuoco parte da «Non ora»: con un'azione che non si disfa, Invio a vuoto non deve confermare (NN/g). Con un campo da
    // scrivere (C3, «Segna come fatto») parte dal campo: è la prima cosa da fare, e Invio lì va a capo, non conferma.
    const primo = areaCampo ?? no;
    if (manager) manager.activate(dialogo, { opener, initialFocus: primo, requestClose: () => dialogo.close() });
    else primo.focus();
  });
}
