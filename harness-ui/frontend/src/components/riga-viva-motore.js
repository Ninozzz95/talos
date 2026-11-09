/*
 * ⭐ The live row of the local engine (FE-050, design approved by the owner on 01/11/2026; form `FORMA-STOP-E-CARICAMENTO-2026-11-01.md`,
 *   OK from Desktop, Mobile, CLI and Performance). While a local model opens, the chat says what is happening instead of «still working».
 *
 * Same pieces as the summary row: `.talos-riga-viva`, `data-context-chat-status`, `data-riga-viva-tempo`, the plain `<progress>`
 *   (`context-progress.js`). No value on the bar without a real percent: the router alone gives one.
 *
 * It reads `GET /api/v1/runtime/caricamento`, state in memory only, so it also holds with the turn closed and after a page reload.
 *   Performance and Desktop, all binding:
 *   - never two reads in flight: the next one leaves 500 ms after the previous answer, no `setInterval`;
 *   - it ends on every way out: first word, end or error of the turn, a change of chat, a failed read, the page hidden;
 *   - with a cloud model, or with no turn waiting, no read at all;
 *   - no redraw if the state did not change.
 *
 * Owner's decision on Stop («Dipende dal caso»): a first load or a change of model is cancelled and the row goes; a growing window or a
 *   wake-up finishes opening, and the row stays with no «Stop» until it is done. Only a Stop goes that way (`fermata`): at the first
 *   word or at an error the row simply leaves (revision of Frontend).
 * The state is the engine's, not the chat's: a row shows only for the model of this chat, and without a turn here there is nothing to
 *   stop, so no «Stop» (revision of Frontend).
 * Seconds: `iniziatoIl` and `observedAt` are both the server's clock, so they survive a reload and do not depend on the browser's.
 */
import { t } from './lingua.js';
import { durataBreveRigaViva } from './durata-breve.js';
import { conosceIlFileDelModello, nomeModelloUmano } from './chat-foot.js';

const RITARDO_MS = 500;
const FINISCONO_DA_SOLI = new Set(['allargamento', 'risveglio']);
const PREFISSO_LOCALE = 'local:';
const idLocale = (modello) => (typeof modello === 'string' && modello.startsWith(PREFISSO_LOCALE) ? modello.slice(PREFISSO_LOCALE.length) : null);

/* Frontend, live review of 01/11: the row and the model chip must say the same name. Once the chip knows the model's FILE it names it
   from there (`nomeModelloUmano`, chat-foot.js, 27/10), and so does the row; before that the server's `nome` (from the repository). */
function nomeDelModello(caricamento, nomeDi, conosce) {
  const id = typeof caricamento?.modelId === 'string' && caricamento.modelId ? `${PREFISSO_LOCALE}${caricamento.modelId}` : null;
  let dalChip = '';
  try { dalChip = id && conosce(id) ? nomeDi(id) : ''; } catch { dalChip = ''; }
  return dalChip || caricamento?.nome || '';
}

/** The sentence of the row for a load, as approved. `finendo`: the model finishes opening for the next message. */
export function testoDellaRiga(caricamento, { finendo = false, traduci = t, nomeDi = nomeModelloUmano, conosce = conosceIlFileDelModello } = {}) {
  const modello = nomeDelModello(caricamento, nomeDi, conosce) || traduci('chat.engine.live.modelGeneric');
  if (finendo) return traduci('chat.engine.live.finishing', { modello });
  if (caricamento?.fase === 'waiting') return traduci('chat.engine.live.waiting');
  if (caricamento?.fase === 'freeing') return traduci('chat.engine.live.freeing');
  if (caricamento?.altroMotore) return traduci('chat.engine.live.otherEngine');
  if (caricamento?.motivo === 'allargamento') return traduci('chat.engine.live.reopening', { modello });
  if (caricamento?.motivo === 'risveglio') return traduci('chat.engine.live.waking', { modello });
  if (caricamento?.fase === 'mmproj_model') return traduci('chat.engine.live.loadingImages');
  if (Number.isFinite(caricamento?.percentuale)) return traduci('chat.engine.live.loading', { modello });
  return traduci('chat.engine.live.opening', { modello });
}

/** Reads the state one answer at a time. `alCambio(caricamento, risposta)` only when something changed; a failed read ends the watch. */
export function creaLetturaCaricamento({ leggi, alCambio, alRisposta, alGuasto, ritardoMs = RITARDO_MS, nascosta = () => false, pianifica = setTimeout, annulla = clearTimeout }) {
  let attiva = false;
  let timer = null;
  let giro = 0;
  let inVolo = false;
  let ultima;

  async function passo(mio) {
    timer = null;
    if (!attiva || mio !== giro || inVolo) return;
    if (nascosta()) return; // `riprendi` restarts it when the page is seen again
    inVolo = true;
    let risposta;
    let fallita = false;
    try { risposta = await leggi(); }
    catch { fallita = true; }
    inVolo = false;
    if (!attiva) return;
    if (mio !== giro) { passo(giro); return; } // watched again while this read was out: the new watch starts now, never beside it
    if (fallita) { ferma(); alGuasto?.(); return; }
    const caricamento = risposta?.caricamento ?? null;
    const impronta = JSON.stringify(caricamento);
    if (impronta !== ultima) { ultima = impronta; alCambio?.(caricamento, risposta); }
    if (!attiva || mio !== giro) return;
    alRisposta?.();
    timer = pianifica(() => { passo(mio); }, ritardoMs);
  }

  function avvia() {
    if (attiva) return;
    attiva = true;
    giro += 1;
    ultima = undefined;
    passo(giro);
  }
  function ferma() {
    attiva = false;
    giro += 1;
    if (timer !== null) { annulla(timer); timer = null; }
  }
  function riprendi() {
    if (!attiva || timer !== null || inVolo) return;
    giro += 1;
    passo(giro);
  }
  return Object.freeze({ avvia, ferma, riprendi, attiva: () => attiva });
}

/**
 * The row in the chat. `leggi` the route; `inserisci(riga)` where it goes, at the end of the chat when no wait is open; `onFerma` the
 * composer's own Stop; `alTogli` the row left, the plain wait may show again; `modelloDellaChat()` the model of the chat on screen.
 * Hooks from the chat, one line each: `giroAvviato`, `attesaFinita`, `fermata`, `chatCambiata`, `ridisegnaLingua`.
 */
export function creaRigaVivaMotore({ leggi, inserisci, alTogli, onFerma, modelloDellaChat = () => null, documento = globalThis.document, nascosta = () => documento?.hidden === true, adesso = () => Date.now(), pianifica = setTimeout, annulla = clearTimeout, ritmoSecondi = setInterval, fermaSecondi = clearInterval } = {}) {
  let riga = null;
  let ultimo = null;
  let attesa = false;
  let finendo = false;
  let modelloAtteso = null;
  let orologio = null;
  let lettoIl = 0;
  let trascorsi = null;

  function togli() {
    if (orologio !== null) { fermaSecondi(orologio); orologio = null; }
    if (riga) { riga.remove(); alTogli?.(); }
    riga = null;
    ultimo = null;
    finendo = false;
    trascorsi = null;
  }

  function disegnaSecondi() {
    if (!riga || trascorsi === null) return;
    const testo = durataBreveRigaViva(Math.max(0, trascorsi + adesso() - lettoIl));
    const campo = riga.querySelector('[data-riga-viva-tempo]');
    if (campo && campo.textContent !== testo) campo.textContent = testo;
  }

  function aggiornaAzione() {
    if (!riga) return;
    const vuole = attesa && !finendo;
    const azioni = riga.querySelector('.talos-riga-viva__azioni');
    if (!vuole) { azioni?.remove(); return; }
    if (azioni) { const ferma = azioni.querySelector('[data-riga-viva="ferma"]'); ferma.textContent = t('chat.context.live.stop'); ferma.setAttribute('aria-label', t('chat.context.live.stopLabel')); return; }
    const nuove = documento.createElement('span');
    nuove.className = 'talos-riga-viva__azioni';
    const ferma = documento.createElement('button');
    ferma.type = 'button';
    ferma.className = 'talos-riga-viva__azione';
    ferma.dataset.rigaViva = 'ferma';
    ferma.textContent = t('chat.context.live.stop');
    ferma.setAttribute('aria-label', t('chat.context.live.stopLabel'));
    ferma.addEventListener('click', () => onFerma?.());
    nuove.append(ferma);
    riga.querySelector('[data-context-chat-text]').after(nuove);
  }

  function costruisci() {
    const nuova = documento.createElement('section');
    nuova.className = 'talos-riga-viva talos-riga-viva--motore';
    nuova.dataset.rigaMotore = '';
    const testo = documento.createElement('span');
    testo.dataset.contextChatText = '';
    const stato = documento.createElement('span');
    stato.dataset.contextChatStatus = '';
    stato.setAttribute('role', 'status');
    const dettaglio = documento.createElement('span');
    dettaglio.dataset.contextChatEta = '';
    dettaglio.setAttribute('aria-live', 'off');
    const tempo = documento.createElement('span');
    tempo.className = 'talos-mono talos-measure';
    tempo.dataset.rigaVivaTempo = '';
    tempo.setAttribute('aria-hidden', 'true');
    testo.append(stato, dettaglio, tempo);
    const barra = documento.createElement('progress');
    barra.className = 'talos-riga-viva__barra';
    nuova.append(testo, barra);
    return nuova;
  }

  function scriviFrase() {
    if (!riga) return;
    riga.querySelector('[data-context-chat-status]').textContent = testoDellaRiga(ultimo, { finendo });
    riga.querySelector('progress').setAttribute('aria-label', t('chat.engine.live.barLabel'));
  }

  function disegna(caricamento, risposta) {
    if (!attesa) finendo = true; // no turn here: the model is opening for the next message
    if (!riga) {
      riga = costruisci();
      inserisci?.(riga);
      orologio = ritmoSecondi(disegnaSecondi, 1000);
    }
    ultimo = caricamento;
    const inizio = Date.parse(caricamento.iniziatoIl);
    const letto = Date.parse(risposta?.observedAt);
    trascorsi = Number.isFinite(inizio) && Number.isFinite(letto) ? letto - inizio : null;
    lettoIl = adesso();
    scriviFrase();
    aggiornaAzione();
    const percento = Number.isFinite(caricamento.percentuale) ? `${caricamento.percentuale}%` : '';
    riga.querySelector('[data-context-chat-eta]').textContent = percento;
    const barra = riga.querySelector('progress');
    if (percento) { barra.max = 100; barra.value = caricamento.percentuale; barra.setAttribute('aria-valuetext', percento); }
    else { barra.removeAttribute('value'); barra.removeAttribute('max'); barra.removeAttribute('aria-valuetext'); }
    disegnaSecondi();
  }

  const lettura = creaLetturaCaricamento({ leggi, nascosta, pianifica, annulla,
    alCambio: (caricamento, risposta) => {
      if (caricamento && (modelloAtteso === null || caricamento.modelId === modelloAtteso)) { disegna(caricamento, risposta); return; }
      /* this chat is in line behind another opening: its own row, same seconds, same Stop */
      if (caricamento?.inCoda?.includes(modelloAtteso)) { disegna({ ...caricamento, modelId: modelloAtteso, nome: null, fase: 'waiting', percentuale: null, motivo: 'cambio' }, risposta); return; }
      togli();
      if (!attesa) lettura.ferma(); // nothing was opening for this chat, or it has finished: no more reads
    },
    /* after a Stop the note of the turn lands under the row: the row goes back to the end, as in the approved design */
    alRisposta: () => { if (finendo && riga?.nextElementSibling) inserisci?.(riga); },
    alGuasto: togli });

  const seVista = () => { lettura.riprendi(); };
  documento?.addEventListener?.('visibilitychange', seVista);

  return Object.freeze({
    /** A turn is waiting for its first word. `modello`: the model of the turn. Only for a local one: a cloud model never reads. */
    giroAvviato({ modello } = {}) {
      const id = idLocale(modello);
      if (id === null) return;
      attesa = true;
      modelloAtteso = id;
      if (riga) { finendo = false; inserisci?.(riga); scriviFrase(); aggiornaAzione(); } // one row: the new message takes over the one finishing
      lettura.avvia();
    },
    /** First word, end or error of the turn: the row leaves. A row finishing after a Stop goes on by itself. */
    attesaFinita() {
      attesa = false;
      if (finendo) return;
      lettura.ferma();
      togli();
    },
    /** The turn is being stopped. The only way to «finishing»: a load that was the person's to cancel is cancelled by the server. */
    fermata() {
      attesa = false;
      if (ultimo && FINISCONO_DA_SOLI.has(ultimo.motivo)) {
        finendo = true;
        scriviFrase();
        aggiornaAzione();
        return;
      }
      lettura.ferma();
      togli();
    },
    /** Another chat is on screen: this row is gone. A local chat looks once, on the next tick, when the chat has its model. */
    chatCambiata() {
      attesa = false;
      lettura.ferma();
      togli();
      pianifica(() => {
        if (lettura.attiva()) return;
        const id = idLocale(modelloDellaChat());
        if (id === null) return;
        modelloAtteso = id;
        lettura.avvia();
      }, 0);
    },
    ridisegnaLingua() {
      scriviFrase();
      aggiornaAzione();
    },
    /** For the tests and a page that goes away. */
    chiudi() {
      lettura.ferma();
      togli();
      documento?.removeEventListener?.('visibilitychange', seVista);
    },
    leggendo: () => lettura.attiva(),
  });
}
