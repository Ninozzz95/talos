/*
 * P0-bis corsia C — OSS-1 e OSS-2, LE OSSERVAZIONI DEL GIRO VERO DEL 17/09/2026.
 *
 * ⛔ IL DIFETTO, letto nel codice del 17/09 (`components/inspector.js`):
 *   (1) `processiDagliEventi` calcolava la durata come `e.ricevutoA - p.avviatoA`, cioè la
 *       differenza fra due istanti di ARRIVO LOCALE. Alla RIGIOCATA di una sessione dal disco
 *       tutti gli eventi arrivano insieme: i due istanti coincidono, la differenza è **0**, e
 *       `datiProcesso` la stampava come «0 s» — un numero, non un vuoto. Un comando che è durato
 *       diciotto secondi dichiarava di essere durato zero, e nessuno poteva accorgersene perché
 *       «0 s» somiglia a una misura riuscita. È la stessa forma delle tredici del 13/09: il
 *       risultato sbagliato coincide con uno plausibile.
 *   (2) `nomiComando` non conteneva `prova`: l'attrezzo che lancia la suite di test non compariva
 *       affatto nella scheda «Processi», pur essendo il comando più lungo di una sessione.
 *   (3) La riga del dettaglio diceva `['Cartella', '—']` SEMPRE, con un commento che spiegava che
 *       `ToolCallResult` non porta il `cwd`. Da oggi lo porta (corsia B).
 *
 * ⇒ Il contratto con la corsia B, che implementa il lato server: `ToolCallStart` porta `avviatoA`
 *   (epoch ms del server) e `ToolCallResult` porta `durataMs` (interi), `comando` e `cwd`.
 *   ⛔ Qui si LEGGONO quei campi se ci sono e si DEGRADA onestamente se mancano: finché la corsia B
 *   non è fusa, questi test girano sugli eventi vecchi e devono restare verdi lo stesso.
 *
 * RICERCA 17/09/2026, prima di scrivere (regola zero):
 *  · OpenTelemetry, «Trace Semantic Conventions» (opentelemetry.io/docs/specs/semconv/general/trace):
 *    la durata di uno span è portata dallo span stesso (start/end sul clock di CHI esegue), non
 *    ricostruita da chi riceve i dati — ed è la ragione per cui un backend può rigiocare una traccia
 *    a distanza di giorni senza che le durate cambino. ⇒ `durataMs` dal server vince sempre sul
 *    delta locale, e il delta locale vale solo quando è l'unico dato che c'è.
 *  · MDN, «Performance.now()» e «DOMHighResTimeStamp» (developer.mozilla.org, letto 17/09/2026):
 *    un orologio monotono e un orologio di parete non si mescolano; il tempo di arrivo di un evento
 *    non è il tempo in cui il fatto è accaduto.
 *  · WCAG 1.4.1 e la regola di casa sulle misure: un valore sotto la risoluzione dello strumento
 *    non si arrotonda a zero — si dichiara sotto soglia («<0,1 s»), perché «0 s» è un'affermazione
 *    falsa mentre «<0,1 s» è vera.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { datiProcesso, processiDagliEventi } from '../../src/components/inspector.js';

/** Gli eventi di un comando andato a buon fine, con gli istanti che decide il chiamante. */
function giroShell({ id = 'c1', comando = 'npm run build', avviatoA = null, ricevutoAStart, ricevutoAFine, durataMs = null, cwd = null } = {}) {
  const start = { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: ricevutoAStart };
  if (avviatoA !== null) start.avviatoA = avviatoA;
  const fine = { type: 'ToolCallResult', toolCallId: id, ricevutoA: ricevutoAFine, uscita: 0 };
  if (durataMs !== null) fine.durataMs = durataMs;
  if (cwd !== null) fine.cwd = cwd;
  return [start, { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) }, fine];
}

/* ────────────────────────────────────────────── OSS-1 · la durata al replay ─── */

test('OSS-1 · RIGIOCATA: stesso `ricevutoA` per tutti ⇒ nessuna durata, e la riga NON dice «0 s»', () => {
  const adesso = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: adesso, ricevutoAFine: adesso }), { adesso });
  assert.equal(p.durataMs, null, 'una differenza di zero fra due arrivi non è una durata misurata');
  const d = datiProcesso(p);
  assert.doesNotMatch(d.misura, /0 s/u, `la riga diceva: «${d.misura}»`);
  assert.equal(d.dettaglio.find(([k]) => k === 'Durata')[1], '—');
});

test('OSS-1 · DAL VIVO: due arrivi distinti restano una misura buona (nessuna regressione)', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t + 18_100 }), { adesso: t + 20_000 });
  assert.equal(p.durataMs, 18_100);
  assert.equal(datiProcesso(p).misura, '18,1 s · uscita 0');
});

test('OSS-1 · un delta di UN MILLISECONDO fra due arrivi non è una durata: la riga tace', () => {
  /*
   * ⛔ Trovato dalla prova end-to-end, non pensato a tavolino: sugli STESSI eventi la riga di una
   *   `prova` mai eseguita diceva «<0,1 s · uscita 127» nel tema scuro e «uscita 127» nel chiaro —
   *   un millisecondo di scarto fra due `Date.now()` nello stesso giro di eventi. Due misure che
   *   non tornavano fra loro, ed è l'unico modo in cui un difetto così si fa vedere.
   */
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'x1', toolCallName: 'prova', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 'x1', delta: '{}' },
    { type: 'ToolCallResult', toolCallId: 'x1', ricevutoA: t + 1, uscita: 127, errore: true, comando: 'npm test' },
  ], { adesso: t + 1 });
  assert.equal(p.durataMs, null);
  const d = datiProcesso(p);
  assert.equal(d.misura, 'uscita 127');
  /* ⛔ E lo STATO dice «non eseguito», non «non riuscito»: 127 è «command not found» — non è che i
     test siano andati male, è che non c'era niente da lanciare. Due fatti opposti, due parole. */
  assert.equal(d.etichetta, 'Non eseguito');
  assert.equal(d.tono, 'warning');
});

test('OSS-2 · una `shell` RIFIUTATA all’approvazione dice «Non eseguito», col comando dagli ARGOMENTI', () => {
  /*
   * ⛔ Il contratto vero: una shell negata torna con `content: 'REFUSED. …'` e SENZA `comando`,
   *   `cwd` e `durataMs` — non è mai partita. Il pallino rosso di «Non riuscito» le darebbe la
   *   colpa di un guasto che non c'è: la decisione l'ha presa la persona.
   */
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'r1', toolCallName: 'shell', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 'r1', delta: JSON.stringify({ comando: 'rm -rf build' }) },
    { type: 'ToolCallResult', toolCallId: 'r1', ricevutoA: t, errore: true, uscita: null, rifiutato: true },
  ], { adesso: t });
  const d = datiProcesso(p);
  assert.equal(d.comando, 'rm -rf build', 'il comando viene dagli argomenti, come sempre');
  assert.equal(d.etichetta, 'Non eseguito');
  assert.equal(d.cartella, '—');
  assert.doesNotMatch(d.misura, /\bs\b/u, 'nessuna durata per qualcosa che non è partito');
});

test('OSS-2 · AL CONTRARIO: un rifiuto NON dichiarato lascia lo stato al codice di uscita', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'r2', toolCallName: 'shell', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 'r2', delta: JSON.stringify({ comando: 'rm -rf build' }) },
    { type: 'ToolCallResult', toolCallId: 'r2', ricevutoA: t, errore: true, uscita: 1 },
  ], { adesso: t });
  assert.equal(datiProcesso(p).etichetta, 'Non riuscito');
});

test('OSS-2 · AL CONTRARIO: un’uscita diversa da zero che NON è 127 resta «Non riuscito»', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'x2', toolCallName: 'prova', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 'x2', delta: '{}' },
    { type: 'ToolCallResult', toolCallId: 'x2', ricevutoA: t, uscita: 1, errore: true, comando: 'npm test' },
  ], { adesso: t });
  assert.equal(datiProcesso(p).etichetta, 'Non riuscito', 'un test che fallisce davvero deve continuare a dirlo');
});

test('OSS-1 · sopra la risoluzione degli arrivi il ripiego torna a valere', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t + 100 }), { adesso: t + 100 });
  assert.equal(p.durataMs, 100, 'cento millisecondi sono la soglia, e la soglia è inclusa');
});

test('OSS-1 · `durataMs` del server VINCE sul delta locale, anche quando il delta esiste', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t + 9_999, durataMs: 300 }), { adesso: t });
  assert.equal(p.durataMs, 300);
  assert.match(datiProcesso(p).misura, /^0,3 s/u);
});

test('OSS-1 · `durataMs` sotto la risoluzione si dichiara «<0,1 s», mai «0 s»', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t, durataMs: 40 }), { adesso: t });
  assert.equal(p.durataMs, 40);
  assert.match(datiProcesso(p).misura, /^<0,1 s/u);
});

test('OSS-1/B2 · uno ZERO dichiarato dal server è una MISURA: «<0,1 s», non silenzio', () => {
  /*
   * ⛔ B2, bocciatura del controllore: `processiDagliEventi` accettava `durataMs >= 0` e
   *   `datiProcesso` pretendeva `> 0`. Due soglie diverse sullo stesso campo, e quella stretta
   *   rendeva un comando istantaneo MISURATO identico a uno NON misurato — cioè cancellava
   *   esattamente la distinzione per cui questa cura esiste.
   */
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t, durataMs: 0 }), { adesso: t });
  assert.equal(p.durataMs, 0);
  const d = datiProcesso(p);
  assert.match(d.misura, /^<0,1 s/u);
  assert.equal(d.dettaglio.find(([k]) => k === 'Durata')[1], '<0,1 s');
});

test('OSS-1/B2 · AL CONTRARIO: nessun dato resta silenzio — `null` non è `0`', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t }), { adesso: t });
  assert.equal(p.durataMs, null);
  assert.equal(datiProcesso(p).dettaglio.find(([k]) => k === 'Durata')[1], '—');
  assert.doesNotMatch(datiProcesso(p).misura, /s\b/u);
});

test('OSS-1 · `avviatoA` del server è l’ORA di avvio mostrata, e la rigiocata non la sposta ad adesso', () => {
  const avviatoA = Date.UTC(2026, 8, 17, 12, 0, 0);
  const rigiocataA = avviatoA + 6 * 3_600_000;
  const [p] = processiDagliEventi(
    giroShell({ avviatoA, ricevutoAStart: rigiocataA, ricevutoAFine: rigiocataA, durataMs: 2_500 }),
    { adesso: rigiocataA },
  );
  assert.equal(p.avviatoA, avviatoA, 'l’avvio dichiarato dal server non si sostituisce con l’ora di arrivo');
  assert.equal(datiProcesso(p).quando, new Date(avviatoA).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
});

test('OSS-1 · un processo ancora aperto conta il silenzio dall’ARRIVO, non dall’avvio del server', () => {
  const avviatoA = Date.UTC(2026, 8, 17, 12, 0, 0);
  const arrivo = avviatoA + 6 * 3_600_000;
  const [p] = processiDagliEventi(
    [{ type: 'ToolCallStart', toolCallId: 'vivo', toolCallName: 'shell', ricevutoA: arrivo, avviatoA },
      { type: 'ToolCallArgs', toolCallId: 'vivo', delta: JSON.stringify({ comando: 'npm run dev' }) }],
    { adesso: arrivo + 1_000 },
  );
  assert.equal(p.fermoDaMs, 1_000, 'sei ore fa il server l’ha avviato, ma noi l’abbiamo visto un secondo fa');
});

/* ──────────────────────────────────────── OSS-2 · `prova`, `comando` e `cwd` ─── */

test('OSS-2 · `prova` con argomenti vuoti e `comando` nel risultato diventa una riga di processo', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'prova', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 't1', delta: '{}' },
    { type: 'ToolCallResult', toolCallId: 't1', ricevutoA: t, uscita: 0, durataMs: 41_000, comando: 'npm test', cwd: 'C:\\progetti\\talos' },
  ], { adesso: t });
  assert.ok(p, 'la riga esiste');
  assert.equal(p.comando, 'npm test');
  const d = datiProcesso(p);
  assert.equal(d.famiglia, 'test', 'la famiglia della riga è «prove»');
  assert.equal(d.cartella, 'C:\\progetti\\talos');
  assert.equal(d.dettaglio.find(([k]) => k === 'Cartella')[1], 'C:\\progetti\\talos');
  assert.match(d.misura, /^41 s/u);
});

test('OSS-2 · `prova` senza comando dichiarato resta una riga della famiglia «prove», senza inventare un comando', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'prova', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 't2', delta: '{}' },
  ], { adesso: t });
  const d = datiProcesso(p);
  assert.equal(d.famiglia, 'test');
  assert.equal(d.comando, '—', 'nessun comando fabbricato');
});

test('OSS-2 · VERSO CONTRARIO: senza `cwd` la cartella resta «—», e senza `comando` non si inventa niente', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi(giroShell({ ricevutoAStart: t, ricevutoAFine: t + 5 }), { adesso: t });
  const d = datiProcesso(p);
  assert.equal(d.cartella, '—');
  assert.equal(d.dettaglio.find(([k]) => k === 'Cartella')[1], '—');
  assert.equal(d.comando, 'npm run build');
});

test('OSS-2 · un `comando` dal risultato non SOVRASCRIVE gli argomenti quando il modello li ha mandati', () => {
  const t = 1_700_000_000_000;
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 's9', toolCallName: 'shell', ricevutoA: t },
    { type: 'ToolCallArgs', toolCallId: 's9', delta: JSON.stringify({ comando: 'git status --short' }) },
    { type: 'ToolCallResult', toolCallId: 's9', ricevutoA: t, uscita: 0, comando: 'altro' },
  ], { adesso: t });
  assert.equal(p.comando, 'git status --short');
});
