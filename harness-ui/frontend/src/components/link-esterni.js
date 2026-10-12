/*
 * I LINK ESTERNI DELLA CHAT — owner 11/10/2026: «i link non vengono evidenziati automaticamente per andarci con click»; decisione
 * «Clic + conferma del sito». Qui sta la LOGICA, senza interfaccia: che cos'è un indirizzo che si può aprire, e quali siti la
 * persona ha detto di aprire senza chiedere.
 *
 * ⛔ PERCHÉ LA CONFERMA. Il testo di una risposta lo scrive un modello, e un modello può essere manipolato da ciò che legge (una
 *   pagina, un file): un link può dire «Leggi la ricetta» e portare altrove. Hermes apre con un clic qualunque indirizzo web
 *   (`apps/desktop/electron/external-open.ts`: una porta sola, solo schemi web); VS Code chiede conferma mostrando il sito e ricorda i
 *   domini fidati. Qui il clic mostra il SITO vero prima di aprire, e la fiducia si dà sito per sito.
 * ⛔ IL SITO SI MOSTRA IN ASCII. `URL.hostname` restituisce la forma punycode (`xn--…`) di un nome con lettere di altri alfabeti:
 *   «аpple.com» con una «а» cirillica non può sembrare «apple.com» nella domanda (attacco omografo, WHATWG URL §3.3 «host parsing»).
 * ⛔ Un indirizzo con credenziali (`https://google.com@evil.test/`) inganna proprio sul sito: non si apre.
 * ⛔ La fiducia è per NOME ESATTO: fidarsi di `example.com` non vuol dire fidarsi di `qualcosa.example.com`, che può essere di altri.
 */
const CHIAVE_SITI_FIDATI = 'talos.harness.desktop.link-fidati.v1';
const NOME_DI_SITO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/u;

/** `{ indirizzo, sito, sicuro }` per un indirizzo web che si può proporre di aprire, altrimenti `null`. */
export function leggiLinkEsterno(indirizzo) {
  if (typeof indirizzo !== 'string' || !/^https?:\/\//iu.test(indirizzo.trim())) return null;
  let u;
  try { u = new URL(indirizzo.trim()); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname) return null;
  return { indirizzo: u.href, sito: u.hostname, sicuro: u.protocol === 'https:' };
}

const normale = (sito) => (typeof sito === 'string' ? sito.trim().toLowerCase() : '');

/**
 * I siti che si aprono senza chiedere. `deposito` è `localStorage` (o un suo sostituto nelle prove): una preferenza di questo
 * computer. Un deposito rotto non ferma niente: la fiducia vale per la finestra aperta e alla prossima si richiede.
 */
/** `localStorage`, o `null` dove leggerlo è negato: il getter stesso LANCIA (`SecurityError`, documento senza origine o dati del
    sito bloccati), quindi non può stare in un valore di serie, che si valuta fuori da ogni `try`. Trovato dalla prova PIANO-UI-03. */
export function depositoDelBrowser() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function creaSitiFidati({ deposito = depositoDelBrowser() } = {}) {
  let siti = new Set();
  try {
    const letto = JSON.parse(deposito?.getItem(CHIAVE_SITI_FIDATI) ?? '[]');
    if (Array.isArray(letto)) siti = new Set(letto.map(normale).filter((s) => NOME_DI_SITO.test(s)));
  } catch { /* assente, negato o rotto: nessun sito fidato */ }
  const ascoltatori = new Set();
  const salva = () => {
    try { deposito?.setItem(CHIAVE_SITI_FIDATI, JSON.stringify([...siti].sort())); } catch { /* resta per questa finestra */ }
    for (const fn of ascoltatori) { try { fn(); } catch { /* chi ascolta non ferma chi salva */ } }
  };
  return Object.freeze({
    elenco: () => [...siti].sort(),
    fidato: (sito) => siti.has(normale(sito)),
    aggiungi(sito) { const s = normale(sito); if (NOME_DI_SITO.test(s) && !siti.has(s)) { siti.add(s); salva(); } },
    togli(sito) { if (siti.delete(normale(sito))) salva(); },
    /** Avvisa a ogni cambio dell'elenco (le Impostazioni si ridisegnano). */
    ascolta(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); },
  });
}

/** L'elenco dell'app: UNA istanza, così la chat che aggiunge e le Impostazioni che tolgono vedono lo stesso elenco. */
let dellApp = null;
export function sitiFidatiDellApp() { dellApp ??= creaSitiFidati(); return dellApp; }

/*
 * DOVE FINISCE UN INDIRIZZO SCRITTO NUDO — una regola sola, per le risposte (`markdown.js`) e per i messaggi della persona
 * (`conversazione.js`). GFM 0.29 §6.9 «Extended autolink path validation» (letta l'11/10/2026): la punteggiatura in coda non fa
 * parte dell'indirizzo, e una `)` finale conta solo se le parentesi DENTRO l'indirizzo sono bilanciate (così
 * `https://it.wikipedia.org/wiki/Gyros_(piatto)` resta intero e `(fonte: https://example.com/pagina).` perde `).`).
 */
export function fineDellIndirizzo(grezzo) {
  let fine = grezzo.length;
  for (;;) {
    const ultimo = grezzo[fine - 1];
    if (fine > 0 && /[?!.,:;*_~'"]/u.test(ultimo)) { fine -= 1; continue; }
    if (ultimo === ')') {
      const dentro = grezzo.slice(0, fine);
      if ((dentro.match(/\)/gu) ?? []).length > (dentro.match(/\(/gu) ?? []).length) { fine -= 1; continue; }
    }
    return fine;
  }
}

/** Un testo SEMPLICE spezzato in pezzi: `{ testo }` e `{ indirizzo }` (solo indirizzi web apribili). Niente Markdown: è ciò che la persona ha scritto. */
export function pezziConIndirizzi(testo) {
  const pezzi = [];
  const stringa = String(testo ?? '');
  const cerca = /https?:\/\/[^\s<>`]+/giu;
  let ultimo = 0;
  let m;
  while ((m = cerca.exec(stringa))) {
    const indirizzo = m[0].slice(0, fineDellIndirizzo(m[0]));
    const letto = leggiLinkEsterno(indirizzo);
    if (!letto) continue;
    if (m.index > ultimo) pezzi.push({ testo: stringa.slice(ultimo, m.index) });
    pezzi.push({ indirizzo: letto.indirizzo, testo: indirizzo });
    ultimo = m.index + indirizzo.length;
    cerca.lastIndex = ultimo;
  }
  if (ultimo < stringa.length) pezzi.push({ testo: stringa.slice(ultimo) });
  return pezzi;
}
