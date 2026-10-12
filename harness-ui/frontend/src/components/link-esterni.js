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

/*
 * DOVE SI APRE UN LINK — owner 12/10/2026: TALOS ha la sua scheda Browser, quindi un link della chat si apre lì (`talos`) o nel
 * browser predefinito del computer (`sistema`), a scelta. Stato dell'arte letto il 12/10/2026: Hermes apre sempre fuori
 * (`apps/desktop/electron/external-open.ts`); VS Code 1.109 ha un browser integrato e lo decide con un'impostazione
 * (`workbench.browser.openLocalhostLinks`, solo per i link locali). Qui la scelta si fa nel momento in cui si vede il sito, e si ricorda.
 * ⛔ `sistema` è il valore di serie OVUNQUE: un dato assente, rotto o sconosciuto non porta mai una pagina dentro l'app da solo.
 */
export const DESTINAZIONI_DEI_LINK = Object.freeze(['talos', 'sistema']);
const destinazioneValida = (d) => (d === 'talos' ? 'talos' : 'sistema');
const CHIAVE_DESTINAZIONE_DEI_FIDATI = 'talos.harness.desktop.link-fidati-destinazione.v1';
const CHIAVE_DESTINAZIONE = 'talos.harness.desktop.link-destinazione.v1';

export function creaSitiFidati({ deposito = depositoDelBrowser() } = {}) {
  let siti = new Set();
  try {
    const letto = JSON.parse(deposito?.getItem(CHIAVE_SITI_FIDATI) ?? '[]');
    if (Array.isArray(letto)) siti = new Set(letto.map(normale).filter((s) => NOME_DI_SITO.test(s)));
  } catch { /* assente, negato o rotto: nessun sito fidato */ }
  /* L'elenco dei fidati resta nella sua chiave del 11/10, com'era (una versione precedente lo legge ancora). Accanto, in una chiave
     sua, solo i siti che si aprono in TALOS: chi non c'è si apre nel browser del sistema, com'è sempre stato. */
  let inTalos = new Set();
  try {
    const letto = JSON.parse(deposito?.getItem(CHIAVE_DESTINAZIONE_DEI_FIDATI) ?? '[]');
    if (Array.isArray(letto)) inTalos = new Set(letto.map(normale).filter((s) => siti.has(s)));
  } catch { /* assente, negato o rotto: tutti nel browser del sistema */ }
  const ascoltatori = new Set();
  const salva = () => {
    try {
      deposito?.setItem(CHIAVE_SITI_FIDATI, JSON.stringify([...siti].sort()));
      deposito?.setItem(CHIAVE_DESTINAZIONE_DEI_FIDATI, JSON.stringify([...inTalos].sort()));
    } catch { /* resta per questa finestra */ }
    for (const fn of ascoltatori) { try { fn(); } catch { /* chi ascolta non ferma chi salva */ } }
  };
  const scrivi = (s, destinazione) => {
    const prima = inTalos.has(s);
    if (destinazioneValida(destinazione) === 'talos') inTalos.add(s); else inTalos.delete(s);
    return prima !== inTalos.has(s);
  };
  return Object.freeze({
    elenco: () => [...siti].sort(),
    fidato: (sito) => siti.has(normale(sito)),
    /** Dove si apre un sito fidato; `null` se il sito non è fidato. */
    destinazione: (sito) => { const s = normale(sito); return siti.has(s) ? (inTalos.has(s) ? 'talos' : 'sistema') : null; },
    aggiungi(sito, destinazione = 'sistema') {
      const s = normale(sito);
      if (!NOME_DI_SITO.test(s)) return;
      const nuovo = !siti.has(s);
      siti.add(s);
      if (scrivi(s, destinazione) || nuovo) salva();
    },
    /** Cambia dove si apre un sito già fidato; su un sito non fidato non fa niente. */
    imposta(sito, destinazione) { const s = normale(sito); if (siti.has(s) && scrivi(s, destinazione)) salva(); },
    togli(sito) { const s = normale(sito); if (siti.delete(s)) { inTalos.delete(s); salva(); } },
    /** Avvisa a ogni cambio dell'elenco (le Impostazioni si ridisegnano). */
    ascolta(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); },
  });
}

/** L'elenco dell'app: UNA istanza, così la chat che aggiunge e le Impostazioni che tolgono vedono lo stesso elenco. */
let dellApp = null;
export function sitiFidatiDellApp() { dellApp ??= creaSitiFidati(); return dellApp; }

/**
 * La destinazione dei link che NON sono di un sito fidato (owner 12/10/2026):
 *  - `ultima()`: quella usata l'ultima volta — è il pulsante in evidenza nella domanda;
 *  - `fissa()`: `null` finché la persona sceglie ogni volta; `talos` o `sistema` dopo «Non chiedermi più dove» — la domanda sul SITO
 *    resta, ma con un pulsante solo. Si cambia dalle Impostazioni → Link dalla chat.
 */
export function creaDestinazioneDeiLink({ deposito = depositoDelBrowser() } = {}) {
  let ultima = 'sistema';
  let fissa = null;
  try {
    const letto = JSON.parse(deposito?.getItem(CHIAVE_DESTINAZIONE) ?? 'null');
    if (letto && typeof letto === 'object') {
      ultima = destinazioneValida(letto.ultima);
      fissa = DESTINAZIONI_DEI_LINK.includes(letto.fissa) ? letto.fissa : null;
    }
  } catch { /* assente, negato o rotto: si chiede, col browser del sistema in evidenza */ }
  const ascoltatori = new Set();
  const salva = () => {
    try { deposito?.setItem(CHIAVE_DESTINAZIONE, JSON.stringify({ ultima, fissa })); } catch { /* resta per questa finestra */ }
    for (const fn of ascoltatori) { try { fn(); } catch { /* chi ascolta non ferma chi salva */ } }
  };
  return Object.freeze({
    ultima: () => ultima,
    fissa: () => fissa,
    ricorda(destinazione) { const d = destinazioneValida(destinazione); if (d !== ultima) { ultima = d; salva(); } },
    /** `null` = chiedi ogni volta. Un valore sconosciuto vale `null`: non si fissa niente per sbaglio. */
    fissaSu(destinazione) {
      const d = DESTINAZIONI_DEI_LINK.includes(destinazione) ? destinazione : null;
      if (d === fissa) return;
      fissa = d;
      if (d) ultima = d;
      salva();
    },
    ascolta(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); },
  });
}

let destinazioneDellApp = null;
export function destinazioneDeiLinkDellApp() { destinazioneDellApp ??= creaDestinazioneDeiLink(); return destinazioneDellApp; }

/*
 * LE PAGINE CHE SI APRONO SOLO NEL BROWSER DEL SISTEMA — owner 12/10/2026: «le pagine che concedono chiavi o gestiscono l'account
 * restano sempre nel sistema». La scheda Browser di TALOS è una pagina che il modello può leggere e guidare: lì non si scrive una
 * password e non si mostra una chiave. E nel browser del sistema la persona ha già il suo accesso fatto.
 *  - ogni sito il cui nome comincia per `auth.`, `login.`, `accounts.`, `account.`, `signin.`, `sso.`, `id.` (pagine d'accesso);
 *  - le pagine di chiavi, impostazioni e fatturazione dei fornitori di modelli e di GitHub.
 * Si giudica il SITO e il PERCORSO, mai il testo del link. Un indirizzo che non si legge non è «solo nel sistema»: non si apre affatto.
 */
const ACCESSO = /^(?:auth|login|accounts?|signin|sso|id)\./u;
const PERCORSI_DELICATI = /^\/(?:[^/]+\/)*(?:settings|account|billing|api-?keys?|keys?|tokens?|credentials?|login|signin|sign-in|auth|oauth|authorize)(?:\/|$)/iu;
const FORNITORI = /(?:^|\.)(?:openrouter\.ai|openai\.com|chatgpt\.com|anthropic\.com|claude\.ai|claude\.com|z\.ai|bigmodel\.cn|deepseek\.com|mistral\.ai|x\.ai|groq\.com|google\.com|github\.com|huggingface\.co)$/u;
export function paginaSoloNelSistema(indirizzo) {
  const letto = leggiLinkEsterno(indirizzo);
  if (!letto) return false;
  const u = new URL(letto.indirizzo);
  if (ACCESSO.test(u.hostname)) return true;
  return FORNITORI.test(u.hostname) && (PERCORSI_DELICATI.test(u.pathname) || /^#\/?(?:settings|account)/iu.test(u.hash));
}

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
