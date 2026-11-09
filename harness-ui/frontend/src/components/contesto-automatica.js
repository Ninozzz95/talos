/*
 * Pannello calmo (owner 06/11/2026, decisione 315): le regole della compattazione automatica che `legacy/app.js` usa, fuori dal file
 * gigante (decisione 304: app.js non cresce). Lì restano solo le chiamate. Moduli piccoli e puri: si provano da soli
 * (`tests/unit/contesto-automatica.test.mjs`).
 *
 * La regola dell'interruttore è quella del motore e di `context-compactor.js`: la compattazione automatica è accesa salvo
 * `settings.auto === false`.
 */
import { EVENTO_APRI_SCELTA_DAL_CONTESTO } from './motivi-compattazione.js';

/* Owner 06/11 14:20: col motore la compattazione è AUTOMATICA, e oltre la soglia il riassunto è già partito: l'avviso di soglia resta
   solo a chi l'ha spenta. Senza istantanea del motore non si sa: vale «accesa», come il motore. */
export const automaticaDelMotore = (snapshot) => snapshot?.settings?.auto !== false;

/* Revisore avversario 06/11 (punti 1 e 2): l'avviso di soglia e «Richiede attenzione» solo quando il motore di QUESTA sessione dice che la
   persona ha spento la compattazione automatica. Senza istantanea (ricarica, cambio sessione, GET /context in ritardo o fallita) non si
   sa ancora niente e non si mostra niente: prima l'avviso lampeggiava ~2,4 s e con un 500 restava. Le sessioni legacy (vecchie
   conversazioni, motore «legacy») compattano da sole anche loro: il kernel lo fa alla soglia (`session-registry.mjs`,
   `decidiCompattazione`), senza interruttore. Owner 06/11 14:20: «deve essere gestita automaticamente». */
export const compattaDaSola = (snapshot, sessionId) => !(snapshot?.sessionId === sessionId && snapshot?.settings?.auto === false);

/* Owner 06/11 14:20: l'avviso di soglia dipende dall'interruttore e dalla soglia del motore. Se uno dei due cambia (la persona la spegne
   o la riaccende, arriva il primo budget) o cambia la sessione, l'avviso si rivaluta subito: una lettura per cambio, non a ogni giro
   del monitor. */
const chiaveAvviso = (s) => `${automaticaDelMotore(s)}|${s?.budget?.triggerTokens ?? ''}`;
export const avvisoDaRivalutare = (prima, dopo) => prima?.sessionId !== dopo?.sessionId || chiaveAvviso(prima) !== chiaveAvviso(dopo);

/* Coordinatore 06/11: la scheda Contesto dice la stessa pausa della chat (`context-engine/src/engine.mjs:328`,
   `context.compaction.cooling`); un riassunto applicato o una versione ripristinata la chiudono; ogni altro evento la lascia com'è.
   Il ridisegno lo fa `contextMonitor.refresh()` subito dopo, in app.js. */
export function pausaDopoEvento(prima, value) {
  if (value?.kind === 'context.compaction.cooling') {
    const p = value.payload;
    return { retryAfter: p?.retryAfter ?? null, attempts: p?.attempts ?? null, code: p?.code ?? null };
  }
  if (value?.kind === 'context.version.committed' || value?.kind === 'context.version.restored') return null;
  return prima ?? null;
}

/* Revisore 06/11 (punto 4): la pausa scade all'ora del nuovo tentativo, ma il pannello la guarda solo quando ridisegna e a riposo nessuno
   ridisegna: «In attesa di riprovare» e la linguetta ambra restavano oltre l'ora detta. Un timer all'ora del nuovo tentativo ridisegna
   (`pausaDellaCompattazione` la trova scaduta e torna la riga calma), solo se la pausa è ancora quella. */
export const MARGINE_FINE_PAUSA_MS = 250;
/* Revisore 06/11, terzo giro: il timer conta il tempo vero, l'ora del nuovo tentativo è dell'orologio di sistema. Se l'orologio torna
   indietro durante la pausa il timer scatta prima di quell'ora: si riarma per il tempo che manca, invece di ridisegnare una pausa ancora
   viva e lasciarla a schermo. Hermes `agent/chat_completion_helpers.py:2438`: a ogni risveglio si ricalcola quanto manca. */
/* Revisore 06/11, quarto giro: setTimeout tiene il ritardo in 32 bit. Oltre 2^31-1 ms (~24,8 giorni: orologio della pagina indietro di
   settimane rispetto al server) Chromium scatta subito e Node dopo 1 ms; il timer trovava la pausa ancora viva e si riarmava senza fine.
   Il ritardo si ferma al massimo che setTimeout accetta: una pausa così lontana si ricontrolla ogni ~24,8 giorni. Hermes
   `agent/turn_recovery_autorecover.py:55`: l'ora di riprova del fornitore si limita prima di aspettarla. */
export const RITARDO_MASSIMO_TIMER_MS = 2 ** 31 - 1;
function armaFinePausa(sessione, pausa, ridisegna, orologio) {
  const fra = Date.parse(pausa.retryAfter) - orologio.Date.now();
  if (!(Number.isFinite(fra) && fra > 0)) return false;
  orologio.setTimeout(() => {
    if (sessione.pausaContesto !== pausa) return;
    if (!armaFinePausa(sessione, pausa, ridisegna, orologio)) ridisegna();
  }, Math.min(fra + MARGINE_FINE_PAUSA_MS, RITARDO_MASSIMO_TIMER_MS));
  return true;
}
export function seguiPausaContesto(sessione, value, ridisegna, orologio = globalThis) {
  const prima = sessione.pausaContesto ?? null;
  const pausa = pausaDopoEvento(prima, value);
  sessione.pausaContesto = pausa;
  if (pausa && pausa !== prima) armaFinePausa(sessione, pausa, ridisegna, orologio);
  return pausa;
}

/* Pannello calmo (owner 06/11 14:50): i due campi della scheda Contesto che `pannello/contesto.js` legge (`automatica`, `pausa`).
   Senza motore (legacy, o istantanea non ancora arrivata) si compatta da sola lo stesso (revisore 06/11, punto 2); la pausa è solo
   del motore.
   Revisore 06/11, secondo giro (R2-6): la scheda salta il ridisegno se la firma JSON dei suoi dati non cambia (`pannello/contesto.js`,
   A16-INDICE-02), e al timer della pausa la `pausa` era lo stesso oggetto: «In attesa di riprovare» restava oltre l'ora detta. La pausa
   entra nei dati solo finché l'ora del nuovo tentativo è nel futuro (la regola di `pausaDellaCompattazione`): scaduta, i dati cambiano e
   torna la riga calma. Hermes `agent/context_compressor.py:2561`: un raffreddamento scaduto non è più un dato. */
const pausaAncoraAttiva = (pausa, ora) => (pausa && Date.parse(pausa.retryAfter) > ora ? pausa : null);
export const campiSchedaAutomatica = (motore, sessione, ora = Date.now()) => ({
  automatica: motore ? automaticaDelMotore(motore) : true,
  pausa: motore ? pausaAncoraAttiva(sessione?.pausaContesto ?? null, ora) : null,
});

/* Parte 2 del pannello calmo (owner 06/11): la riga del riassunto automatico non riuscito offre un altro modello, come la finestra
   (`context-compactor.js`, `scegliNelleImpostazioni`). */
export function sceltaModelloDalContesto(doc = globalThis.document) {
  const Evento = doc?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
  doc.dispatchEvent(new Evento(EVENTO_APRI_SCELTA_DAL_CONTESTO, { detail: { scelta: 'modello' } }));
}
