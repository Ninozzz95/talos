/**
 * automazione-foglio.js — il foglio «Nuova automazione» / «Modifica automazione» delle automazioni a due porte (owner
 * 08/10/2026 notte). Lo stesso foglio si apre da «Modifica» sulla carta in chat, già compilato con la bozza del modello.
 *
 * ⛔ Niente controlli nativi disegnati dal sistema (owner 13/09): i `<select>` stanno sotto `data-calm-controls`, che li
 *   ridisegna col sistema di casa (`calm-controls.js`, montato in `main.js`). L'interruttore è la riga `.sheet-toggle-row`.
 * ⛔ L'orario si sceglie per preset (Claude Desktop: Manual, Hourly, Daily, Weekdays, Weekly) più «Ogni tot minuti» e «Una
 *   volta»; ogni altra forma si chiede in chat (lo dice il foglio). Un orario personalizzato già esistente si mostra e si
 *   può correggere, mai si perde.
 * ⛔ Il fuso è quello del computer di chi crea (un'ora scritta è un'ora locale, Hermes #51021): lo manda solo la creazione.
 */
import { t as traduci, tn } from './lingua.js';
import { etichettaPermesso } from './chat-foot.js';
import { TETTO_AVVII_DA_SOLO } from './coordinazione.js';

export const PERMESSI_AUTOMAZIONE = Object.freeze(['Read only', 'Workspace write', 'On request', 'Full access']);
const PRESET = Object.freeze(['manuale', 'ogni-ora', 'giornaliera', 'feriali', 'settimanale', 'ogni-n-minuti', 'una-volta']);
const CHIAVE_PRESET = Object.freeze({ manuale: 'manual', 'ogni-ora': 'hourly', giornaliera: 'daily', feriali: 'weekdays', settimanale: 'weekly', 'ogni-n-minuti': 'everyMinutes', 'una-volta': 'once', cron: 'cron' });
const MINUTI_INTERVALLO = Object.freeze([5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 720]);
const RIPETIZIONI = Object.freeze([null, 1, 2, 3, 5, 10, 20, 50]);
const due = (n) => String(n).padStart(2, '0');

function el(doc, tag, classe, testo) { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; }
function campo(doc, etichetta, controllo, { id } = {}) {
  const blocco = el(doc, 'label', 'talos-automazione-campo');
  if (id) controllo.id = id;
  blocco.append(el(doc, 'span', 'sheet-label', etichetta), controllo);
  return blocco;
}
function selettore(doc, voci, valore, { dataset } = {}) {
  const s = el(doc, 'select', 'sheet-input');
  for (const [v, testo] of voci) { const o = el(doc, 'option', undefined, testo); o.value = String(v); s.append(o); }
  s.value = String(valore);
  if (dataset) s.dataset[dataset] = '';
  /* il tendina di casa (`calm-controls`, che guarda `closest('[data-calm-controls]')` — l'elemento stesso compreso): solo sui
     `<select>`, così l'interruttore della Coordinazione resta lo `talos-switch` delle altre righe a interruttore */
  s.dataset.calmControls = '';
  return s;
}

/** La data di oggi + 1 ora, nel fuso del computer: il valore iniziale di «Una volta». */
function frammentiDiDefault(adesso = new Date()) {
  const d = new Date(adesso.getTime() + 3_600_000);
  return { data: `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`, ora: d.getHours(), minuto: 0 };
}

/**
 * @param {Document} doc
 * @param {{ modo?: 'crea'|'modifica', bozza?: object, cartelle?: string[], modelloEtichetta?: string|null, adesso?: Date,
 *   onSalva: (corpo:object) => Promise<void>, onAnnulla?: () => void }} opzioni
 * @returns {{ form: HTMLFormElement, leggi: () => object, mostraErrore: (testo:string) => void }}
 */
export function creaFoglioAutomazione(doc, { modo = 'crea', bozza = {}, cartelle = [], modelloEtichetta = null, adesso = new Date(), onSalva } = {}) {
  const form = el(doc, 'form', 'sheet-section talos-automazione-foglio');
  form.dataset.c = 'AutomationSheet'; form.noValidate = true;
  const p = bozza.pianificazione ?? { tipo: 'giornaliera', ora: '09:00' };
  const def = frammentiDiDefault(adesso);

  const nome = el(doc, 'input', 'sheet-input'); nome.type = 'text'; nome.maxLength = 80; nome.required = true;
  nome.placeholder = traduci('sezioni.automations.v2.sheet.namePlaceholder'); nome.value = bozza.nome ?? ''; nome.dataset.autoFoglioNome = '';
  const istruzioni = el(doc, 'textarea', 'sheet-input talos-automazione-istruzioni'); istruzioni.rows = 6; istruzioni.maxLength = 20000; istruzioni.required = true;
  istruzioni.placeholder = traduci('sezioni.automations.v2.sheet.instructionsPlaceholder'); istruzioni.value = bozza.istruzioni ?? ''; istruzioni.dataset.autoFoglioIstruzioni = '';

  /* Quando: il preset, poi i soli campi che quel preset usa */
  const tipiOfferti = [...PRESET, ...(p.tipo === 'cron' ? ['cron'] : [])];
  const tipo = selettore(doc, tipiOfferti.map((k) => [k, traduci(`sezioni.automations.v2.sheet.when.${CHIAVE_PRESET[k]}`)]), p.tipo, { dataset: 'autoFoglioTipo' });
  const [oraH, oraM] = typeof p.ora === 'string' ? p.ora.split(':').map(Number) : [9, 0];
  const minutiOra = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), oraM, ...(Number.isInteger(p.minuto) ? [p.minuto] : [])])].sort((a, b) => a - b);
  const ora = selettore(doc, Array.from({ length: 24 }, (_, h) => [h, due(h)]), oraH ?? def.ora, { dataset: 'autoFoglioOra' });
  const minuto = selettore(doc, minutiOra.map((m) => [m, due(m)]), oraM ?? 0, { dataset: 'autoFoglioMinuto' });
  const minutoDellOra = selettore(doc, minutiOra.map((m) => [m, `:${due(m)}`]), Number.isInteger(p.minuto) ? p.minuto : 0, { dataset: 'autoFoglioMinutoOra' });
  const giorno = selettore(doc, Array.from({ length: 7 }, (_, i) => [(i + 1) % 7, traduci(`sezioni.automations.v2.day.${(i + 1) % 7}`)]), Number.isInteger(p.giorno) ? p.giorno : 1, { dataset: 'autoFoglioGiorno' });
  const intervalli = [...new Set([...MINUTI_INTERVALLO, ...(Number.isInteger(p.minuti) ? [p.minuti] : [])])].sort((a, b) => a - b);
  const parolaIntervallo = (m) => (m < 60 || m % 60 ? tn('sezioni.automations.v2.sheet.minutesOptionOne', 'sezioni.automations.v2.sheet.minutesOptionMany', m)
    : tn('sezioni.automations.v2.sheet.hoursOptionOne', 'sezioni.automations.v2.sheet.hoursOptionMany', m / 60));
  const ogni = selettore(doc, intervalli.map((m) => [m, parolaIntervallo(m)]),
    Number.isInteger(p.minuti) ? p.minuti : 30, { dataset: 'autoFoglioOgni' });
  const data = el(doc, 'input', 'sheet-input'); data.type = 'date'; data.dataset.autoFoglioData = '';
  data.value = p.tipo === 'una-volta' && typeof p.quando === 'string' ? p.quando.slice(0, 10) : def.data;
  if (p.tipo === 'una-volta' && typeof p.quando === 'string') { ora.value = String(Number(p.quando.slice(11, 13))); minuto.value = String(Number(p.quando.slice(14, 16))); }
  const espressione = el(doc, 'input', 'sheet-input'); espressione.type = 'text'; espressione.value = p.espressione ?? ''; espressione.dataset.autoFoglioCron = '';
  espressione.spellcheck = false;

  const riga = el(doc, 'div', 'talos-automazione-orario');
  const blocchi = {
    ora: campo(doc, traduci('sezioni.automations.v2.sheet.hour'), ora),
    minuto: campo(doc, traduci('sezioni.automations.v2.sheet.minute'), minuto),
    minutoDellOra: campo(doc, traduci('sezioni.automations.v2.sheet.minuteOfHour'), minutoDellOra),
    giorno: campo(doc, traduci('sezioni.automations.v2.sheet.day'), giorno),
    ogni: campo(doc, traduci('sezioni.automations.v2.sheet.every'), ogni),
    data: campo(doc, traduci('sezioni.automations.v2.sheet.date'), data),
    cron: campo(doc, traduci('sezioni.automations.v2.sheet.cron'), espressione),
  };
  riga.append(blocchi.giorno, blocchi.data, blocchi.ora, blocchi.minuto, blocchi.minutoDellOra, blocchi.ogni, blocchi.cron);
  const VISIBILI = { manuale: [], 'ogni-ora': ['minutoDellOra'], giornaliera: ['ora', 'minuto'], feriali: ['ora', 'minuto'], settimanale: ['giorno', 'ora', 'minuto'],
    'ogni-n-minuti': ['ogni'], 'una-volta': ['data', 'ora', 'minuto'], cron: ['cron'] };
  const aggiornaOrario = () => { for (const [k, blocco] of Object.entries(blocchi)) blocco.hidden = !VISIBILI[tipo.value]?.includes(k); riga.hidden = !VISIBILI[tipo.value]?.length; };
  tipo.addEventListener('change', aggiornaOrario);
  aggiornaOrario();

  /* Dove: la cartella (con quelle usate di recente a un clic), e che cosa può fare lì */
  const cartella = el(doc, 'input', 'sheet-input'); cartella.type = 'text'; cartella.spellcheck = false; cartella.required = true;
  cartella.value = bozza.cartella ?? cartelle[0] ?? ''; cartella.dataset.autoFoglioCartella = '';
  const suggerite = el(doc, 'div', 'talos-automazione-cartelle');
  for (const c of cartelle.filter((x) => x && x !== cartella.value).slice(0, 4)) {
    // `--secondary`: col bordo si capisce che è un pulsante (ghost sembrava testo, foto dell'08/10)
    const b = el(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', c); b.type = 'button'; b.dataset.autoFoglioCartellaSuggerita = '';
    b.addEventListener('click', () => { cartella.value = c; cartella.focus(); });
    suggerite.append(b);
  }
  const permessi = selettore(doc, PERMESSI_AUTOMAZIONE.map((v) => [v, etichettaPermesso(v)]), bozza.permessi ?? 'Workspace write', { dataset: 'autoFoglioPermessi' });
  const ripeti = selettore(doc, [...new Set([...RIPETIZIONI, ...(Number.isInteger(bozza.ripeti) ? [bozza.ripeti] : [])])].sort((a, b) => (a ?? -1) - (b ?? -1))
    .map((v) => [v ?? '', v === null ? traduci('sezioni.automations.v2.sheet.repeatForever') : v === 1 ? traduci('sezioni.automations.v2.sheet.repeatOnce') : tn('sezioni.automations.v2.sheet.repeatTimesOne', 'sezioni.automations.v2.sheet.repeatTimesMany', v)]),
  bozza.ripeti ?? '', { dataset: 'autoFoglioRipeti' });

  const rigaCoordinazione = el(doc, 'label', 'sheet-toggle-row');
  const testiCoordinazione = el(doc, 'span');
  testiCoordinazione.append(el(doc, 'strong', '', traduci('app.automations.coordination')), el(doc, 'small', '', traduci('app.automations.coordinationHint', { n: TETTO_AVVII_DA_SOLO })));
  const coordinazione = el(doc, 'input', 'talos-switch'); coordinazione.type = 'checkbox'; coordinazione.setAttribute('role', 'switch');
  coordinazione.checked = bozza.coordinazione === true; coordinazione.dataset.nuovaAutomazioneCoordinazione = '';
  rigaCoordinazione.append(testiCoordinazione, coordinazione);

  const errore = el(doc, 'p', 'sheet-hint talos-automazione-errore'); errore.setAttribute('role', 'alert'); errore.hidden = true; errore.dataset.autoFoglioErrore = '';
  const invia = el(doc, 'button', 'primary-btn compact full', traduci(modo === 'crea' ? 'sezioni.automations.v2.sheet.create' : 'sezioni.automations.v2.sheet.save'));
  invia.type = 'submit'; invia.dataset.autoFoglioInvia = '';

  form.append(
    campo(doc, traduci('sezioni.automations.v2.sheet.name'), nome),
    campo(doc, traduci('sezioni.automations.v2.sheet.instructions'), istruzioni),
    el(doc, 'small', 'sheet-hint', traduci('sezioni.automations.v2.sheet.instructionsHint')),
    campo(doc, traduci('sezioni.automations.v2.sheet.when'), tipo), riga,
    el(doc, 'small', 'sheet-hint', traduci('sezioni.automations.v2.sheet.whenHint')),
    campo(doc, traduci('sezioni.automations.v2.sheet.folder'), cartella), suggerite,
    el(doc, 'small', 'sheet-hint', traduci('sezioni.automations.v2.sheet.folderHint')),
    campo(doc, traduci('sezioni.automations.v2.sheet.permissions'), permessi),
    campo(doc, traduci('sezioni.automations.v2.sheet.repeat'), ripeti),
    rigaCoordinazione,
    /* ⛔ In creazione la frase è quella decisa dall'owner il 24/09 («come il mobile»): il modello è quello scelto nella chat, o il
       predefinito del server detto a parole. In modifica è il modello dell'automazione, che resta il suo. */
    el(doc, 'small', 'sheet-hint', modo === 'crea'
      ? `${modelloEtichetta ? traduci('app.automations.selectedModel', { modello: modelloEtichetta }) : traduci('app.automations.serverDefaultModel')} ${traduci('sezioni.automations.v2.sheet.startsOn')}`
      : (modelloEtichetta ? traduci('sezioni.automations.v2.sheet.model', { model: modelloEtichetta }) : traduci('sezioni.automations.v2.sheet.modelDefault'))),
    errore, invia);

  function pianificazione() {
    const t = tipo.value;
    const hhmm = `${due(ora.value)}:${due(minuto.value)}`;
    if (t === 'manuale') return { tipo: t };
    if (t === 'ogni-ora') return { tipo: t, minuto: Number(minutoDellOra.value) };
    if (t === 'giornaliera' || t === 'feriali') return { tipo: t, ora: hhmm };
    if (t === 'settimanale') return { tipo: t, ora: hhmm, giorno: Number(giorno.value) };
    if (t === 'ogni-n-minuti') return { tipo: t, minuti: Number(ogni.value) };
    if (t === 'una-volta') return { tipo: t, quando: `${data.value}T${hhmm}` };
    if (t === 'cron') return { tipo: 'cron', espressione: espressione.value.trim() };
    return { tipo: t }; // mai un ripiego silenzioso su cron: un tipo ignoto lo rifiuta il server, e il foglio lo dice
  }
  function leggi() {
    return {
      nome: nome.value.trim(), istruzioni: istruzioni.value, pianificazione: pianificazione(), cartella: cartella.value.trim(),
      permessi: permessi.value, coordinazione: coordinazione.checked === true, ripeti: ripeti.value === '' ? null : Number(ripeti.value),
      ...(modo === 'crea' ? { fusoOrario: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}),
    };
  }
  function mostraErrore(testo) { errore.textContent = testo || ''; errore.hidden = !testo; }
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const corpo = leggi();
    if (!corpo.nome || !corpo.istruzioni.trim() || !corpo.cartella) { mostraErrore(traduci('sezioni.automations.v2.sheet.required')); (corpo.nome ? (corpo.istruzioni.trim() ? cartella : istruzioni) : nome).focus(); return; }
    mostraErrore('');
    invia.disabled = true;
    try { await onSalva?.(corpo); } catch (e) { mostraErrore(e?.message ?? String(e)); } finally { invia.disabled = false; }
  });
  return { form, leggi, mostraErrore };
}
