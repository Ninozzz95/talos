/*
 * La modalità guardia sui siti delicati (decisione dell'owner 145 del 04/11, da decisione 29). Spenta di serie.
 * Forma: FORMA-MODALITA-GUARDIA-2026-11-04.md. Fonti: FONTI-25-MODALITA-GUARDIA-2026-11-04.md.
 *
 * Regola pura, senza I/O e senza `node:`: la importa il ciclo e la copia il Mobile come `protezioni.mjs`.
 * - Variante A (owner 04/11, FORMA-GUARDIA-VARIANTE-A): su un sito dell'elenco, con la guardia accesa, si legge in silenzio; il
 *   «Sto guardando» si chiede prima della prima azione che CAMBIA QUALCOSA (`cambiaQualcosa`). Il sì è uno per compito (catena SPID
 *   compresa) e vale GUARDIA_MINUTI minuti, contati solo prima di un'azione che cambia qualcosa: «ogni 5 minuti di azioni».
 * - Lo schermo spento fa chiedere di nuovo subito. Lo schermo bloccato è già la pausa del ciclo (`s.pausa`).
 * - Il «tocco» che rinnova il sì è una risposta della persona a TALOS, MAI l'inattività di Windows: quella conta anche
 *   l'input dell'agente (GetLastInputInfo, fonte 1).
 * - Elenco: quello di partenza è fisso; la persona può aggiungere siti, non toglierli (owner, 04/11). Non è completo.
 * - Verso sicuro su tutto: un'origine neutra (vuota, about:blank, data:, blob:) NON fa uscire dalla guardia; un orologio
 *   illeggibile o all'indietro fa chiedere di nuovo.
 * - App delicate (decisione 145 bis): elenco gemello, banche e pagamenti per nome del pacchetto (Android applicationId), stesse regole.
 *   Si è nella guardia se il sito O l'app è delicato (vale il sito se lo sono tutti e due). Confronto esatto, senza prefissi; un'app
 *   illeggibile (null) non fa uscire. Pacchetti verificati sul Play Store il 04/11; forma da developer.android.com/build/configure-app-module.
 */
import { dominioValido, dominioSotto, tastiSenzaEffetto } from './protezioni.mjs';

export const GUARDIA_MINUTI = 5;
const MS = GUARDIA_MINUTI * 60 * 1000;

/** Elenco di partenza: banche e pagamenti, posta, pubblica amministrazione, salute, gestori di password. Si aggiunge, non si toglie. */
export const SITI_DELICATI = Object.freeze([
  // banche
  'intesasanpaolo.com', 'isybank.com', 'unicredit.it', 'bancobpm.it', 'mps.it', 'bper.it', 'credem.it', 'bnl.it', 'finecobank.com',
  'bancagenerali.it', 'ing.it', 'bancamediolanum.it', 'widiba.it', 'chebanca.it', 'bancasella.it', 'credit-agricole.it',
  'deutsche-bank.it', 'illimity.com', 'hype.it', 'n26.com', 'revolut.com', 'poste.it',
  // pagamenti e cripto
  'paypal.com', 'satispay.com', 'nexi.it', 'wise.com', 'americanexpress.com', 'klarna.com', 'scalapay.com',
  'coinbase.com', 'binance.com', 'kraken.com',
  // posta (l'host della posta, non tutto il dominio); outlook.cloud.microsoft è l'indirizzo di oggi di Outlook sul web (revisione Q, D8)
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'outlook.cloud.microsoft', 'mail.yahoo.com',
  'mail.libero.it', 'mail.virgilio.it', 'mail.proton.me', 'icloud.com', 'webmail.pec.it',
  // accessi agli account (revisione Q, D8)
  'accounts.google.com', 'myaccount.google.com', 'login.microsoftonline.com', 'appleid.apple.com',
  // banche di credito cooperativo (revisione Q, D8)
  'inbank.it',
  // pubblica amministrazione
  'agenziaentrate.gov.it', 'agenziaentrateriscossione.gov.it', 'inps.it', 'inail.it', 'spid.gov.it', 'interno.gov.it',
  'pagopa.gov.it', 'checkout.pagopa.it', 'io.italia.it',
  // salute
  'fascicolosanitario.gov.it',
  // gestori di password
  'passwords.google.com', 'bitwarden.com', '1password.com', 'lastpass.com', 'dashlane.com', 'keepersecurity.com',
]);

/**
 * Elenco di partenza delle app: banche e pagamenti, per nome del pacchetto. Si aggiunge, non si toglie. Non è completo: dove il Play
 * Store non ha confermato il pacchetto (isybank, BPER, MPS, Credem, Widiba, CheBanca, Sella, Crédit Agricole, illimity, Scalapay) la
 * persona lo aggiunge scegliendo fra le app installate. ⛔ `com.ing.mobile` è ING Nederland, non ING Italia.
 */
export const APP_DELICATE = Object.freeze([
  // banche
  'com.latuabancaperandroid', 'com.unicredit', 'com.lynxspa.bancopopolare', 'com.bancobpm.youbusiness', 'it.bnl.apps.banking',
  'com.fineco.it', 'it.bancagenerali.mobile', 'com.mediolanum.android.fullbanca', 'it.ing.banking', 'it.hype.app',
  'de.number26.android', 'com.revolut.revolut', 'com.posteitaliane.spim',
  // pagamenti e cripto
  'com.paypal.android.p2pmobile', 'com.satispay.customer', 'it.icbpi.mobile', 'com.transferwise.android',
  'com.americanexpress.android.acctsvcs.it', 'com.myklarnamobile', 'com.coinbase.android', 'com.binance.dev', 'com.kraken.invest.app',
  'it.pagopa.io.app', 'com.google.android.apps.walletnfcrel',
  // identità digitale: PosteID (SPID), owner 04/11 12:59 (registro riga 145); pacchetto verificato sul Play Store il 04/11
  'posteitaliane.posteapp.appposteid',
]);

const PARTE_PACCHETTO = /^[a-z][a-z0-9_]*$/u;
const TESTI_PACCHETTO = Object.freeze({
  vuoto: "Scrivi il nome del pacchetto dell'app, per esempio com.banca.app.",
  'un-segmento': 'Il nome del pacchetto ha almeno due parti separate da un punto, per esempio com.banca.app.',
  forma: 'Ogni parte del nome del pacchetto comincia con una lettera e contiene solo lettere senza accenti, cifre o _.',
});

/**
 * Il nome del pacchetto di un'app, se ha la forma di un applicationId Android: almeno due parti separate da punti, ognuna comincia con
 * una lettera, solo [a-z0-9_]. Minuscolo: il confronto senza maiuscole riconosce di più, mai di meno (verso sicuro).
 * @returns {{ ok: true, pacchetto: string } | { ok: false, motivo: 'vuoto'|'un-segmento'|'forma', testo: string }}
 */
export function pacchettoValido(x) {
  const no = (motivo) => ({ ok: false, motivo, testo: TESTI_PACCHETTO[motivo] });
  if (typeof x !== 'string') return no('vuoto');
  const p = x.trim().toLowerCase();
  if (!p) return no('vuoto');
  const parti = p.split('.');
  if (parti.length < 2 && PARTE_PACCHETTO.test(p)) return no('un-segmento');
  return parti.every((parte) => PARTE_PACCHETTO.test(parte)) ? { ok: true, pacchetto: p } : no('forma'); // una parte sola: sopra
}

/** L'elenco delle app in vigore: quello di partenza più le aggiunte valide della persona. */
export function elencoAppGuardia(appAggiunte = []) {
  const voci = new Set(APP_DELICATE);
  for (const x of Array.isArray(appAggiunte) ? appAggiunte : []) {
    const v = pacchettoValido(x);
    if (v.ok) voci.add(v.pacchetto);
  }
  return Object.freeze([...voci]);
}

/** La voce dell'elenco uguale al pacchetto (confronto esatto, senza prefissi), o null. */
export function appDelicata(app, elencoApp) {
  const v = pacchettoValido(app);
  return v.ok && elencoApp.includes(v.pacchetto) ? v.pacchetto : null;
}

const NEUTRE = /^(?:about|data|blob|chrome|edge):/u;

const SCHEMA = /^[a-z][a-z0-9+.-]*:[\\/]{2}/u;

/**
 * L'host di un'origine o di un URL: minuscolo, senza schema, credenziali, porta, percorso, punto finale e `www.`.
 * Si legge come il browser (revisione Q, D9): `new URL` tratta `\` come `/`, prende le credenziali fino all'ULTIMA `@` e porta le lettere
 * larghe alle normali; `view-source:` guarda la pagina dentro. Dove `URL` manca o lancia (React Native senza polyfill) vale la lettura a mano.
 */
export function hostDi(origine) {
  const testo = String(origine ?? '').trim().toLowerCase().replace(/^view-source:/u, '');
  if (!testo || NEUTRE.test(testo)) return null;
  try {
    const h = String(new URL(SCHEMA.test(testo) ? testo : `https://${testo}`).hostname).replace(/\.+$/u, '').replace(/^www\./u, '');
    return h || null;
  } catch { /* lettura a mano, sotto */ }
  const senzaSchema = testo.replace(/^[a-z][a-z0-9+.-]*:\/\//u, '');
  const autorita = senzaSchema.split(/[/?#]/u)[0];
  const host = autorita.slice(autorita.lastIndexOf('@') + 1).replace(/:\d*$/u, '').replace(/\.+$/u, '').replace(/^www\./u, '');
  return host || null;
}

/** L'elenco in vigore: quello di partenza più le aggiunte valide della persona (un suffisso pubblico non entra mai). */
export function elencoGuardia(aggiunti = []) {
  const voci = new Set(SITI_DELICATI);
  for (const x of Array.isArray(aggiunti) ? aggiunti : []) {
    const v = dominioValido(hostDi(x));
    if (v) voci.add(v);
  }
  return Object.freeze([...voci]);
}

/** La voce dell'elenco che copre l'host (uguale, o sottodominio col punto davanti), o null. */
export function sitoDelicato(host, elenco) {
  if (!host) return null;
  for (const voce of elenco) if (dominioSotto(host, voce)) return voce; // R8: un suffisso pubblico non è mai una voce
  return null;
}

export const STATO_GUARDIA_VUOTO = Object.freeze({ sito: null, siAl: null });

/**
 * Le app «di passaggio» (owner 04/11, revisione Q): stanno davanti un attimo senza essere la pagina della persona. Tendina e permessi
 * di Android, le tastiere più diffuse, TALOS stesso (la sua carta, sul telefono e sul PC). Chi monta il ciclo aggiunge la tastiera
 * attiva o il nome del proprio processo con `elencoPassaggio`. Nessuna app delicata sta qui.
 */
export const APP_DI_PASSAGGIO = Object.freeze([
  'com.android.systemui', 'com.android.permissioncontroller', 'com.google.android.permissioncontroller',
  'ai.talos', 'ai.talos.dev',
  'com.google.android.inputmethod.latin', 'com.touchtype.swiftkey', 'com.samsung.android.honeyboard',
  'talos',
]);

/** L'elenco di passaggio con le aggiunte di chi monta il ciclo: nomi letti come `nomeApp`, il resto scartato. */
export function elencoPassaggio(extra = []) {
  const v = new Set(APP_DI_PASSAGGIO);
  for (const x of Array.isArray(extra) ? extra : []) { const a = nomeApp(x); if (a) v.add(a); }
  return Object.freeze([...v]);
}

/**
 * Un passo della guardia, prima di ogni azione.
 * @param {{ accesa: boolean, origine: unknown, app?: unknown, elenco: readonly string[], elencoApp?: readonly string[],
 *   stato?: {sito: string|null, siAl: number|null, app?: string}, adesso: number, schermoSpento?: boolean }} p
 * @returns {{ esito: 'nulla'|'chiedi'|'dentro', sito: string|null, genere?: 'app', motivo?: 'ingresso'|'tempo'|'schermo-spento'|'orologio',
 *   fresco?: boolean, stato: {sito: string|null, siAl: number|null, app?: string} }}
 *   `sito` è la voce in guardia: un dominio, o il pacchetto di un'app (allora `genere: 'app'`; per un sito il campo manca, come prima).
 *   `stato.siAl` è il sì del COMPITO (variante A): vale per ogni sito e app della guardia, catena SPID compresa.
 *   `nulla`: fuori dalla guardia. `chiedi`: la carta prima di qualunque azione (solo orologio illeggibile e schermo spento).
 *   `dentro`: si legge in silenzio; con `fresco: false` (nessun sì, `ingresso`, o sì oltre i 5 minuti, `tempo`) la carta arriva prima
 *   della prima azione che cambia qualcosa.
 */
export function passoGuardia({ accesa, origine, app = null, elenco, elencoApp = APP_DELICATE, stato = STATO_GUARDIA_VUOTO, adesso,
  schermoSpento = false, passaggio = APP_DI_PASSAGGIO, cassa = false }) {
  if (accesa !== true) return { esito: 'nulla', sito: null, stato: STATO_GUARDIA_VUOTO };
  // Un'app «di passaggio» davanti (tendina, permessi, tastiera, la carta di TALOS stessa: owner 04/11, revisione Q) vale come app
  // illeggibile: non fa uscire né entrare, e il suo indirizzo (la pagina locale di TALOS) non è la pagina della persona.
  const letta = nomeApp(app);
  const diPassaggio = letta !== null && Array.isArray(passaggio) && passaggio.includes(letta);
  const host = diPassaggio ? null : hostDi(origine);
  // Prima il sito delicato, poi l'app delicata (OR): un'app delicata conta anche con l'origine neutra, così il sì di un'app non passa
  // a un'altra. Origine neutra o assente e nessuna app delicata: si resta dove si era (dentro la guardia, se c'eravamo) finché l'app è
  // quella del sì o non si legge; un'app DIVERSA fa uscire (revisione Q, D2: il nome dell'app non è un indirizzo).
  const appOra = diPassaggio ? null : letta;
  const appDelSi = stato.app ?? (stato.sito !== null && elencoApp.includes(stato.sito) ? stato.sito : null);
  const resta = host === null && (appOra === null || appDelSi === null || appOra === appDelSi);
  // D7 (owner 04/11): una pagina di cassa riconosciuta dalle protezioni è un sito in guardia col suo host, come una voce dell'elenco
  const delSito = host === null ? null : (sitoDelicato(host, elenco) ?? (cassa === true ? host : null));
  const dellApp = delSito === null ? appDelicata(app, elencoApp) : null;
  const sito = delSito ?? dellApp ?? (resta ? stato.sito : null);
  if (!sito) return { esito: 'nulla', sito: null, stato: STATO_GUARDIA_VUOTO };
  const eApp = dellApp !== null || (delSito === null && dellApp === null && elencoApp.includes(sito) && !elenco.includes(sito));
  const g = eApp ? { genere: 'app' } : {};
  // l'app in primo piano resta nello stato (D2): una lettura senza indirizzo resta dentro solo in quell'app
  const appStato = appOra ?? (stato.sito === sito && typeof stato.app === 'string' ? stato.app : null);
  const posto = (siAl) => (appStato === null ? { sito, siAl } : { sito, siAl, app: appStato });
  const siAl = Number.isFinite(stato.siAl) ? stato.siAl : null;
  if (siAl === null) return { esito: 'dentro', sito, ...g, motivo: 'ingresso', fresco: false, stato: posto(null) };
  if (!Number.isFinite(adesso) || adesso < siAl) return { esito: 'chiedi', sito, ...g, motivo: 'orologio', stato: posto(null) };
  if (schermoSpento === true) return { esito: 'chiedi', sito, ...g, motivo: 'schermo-spento', stato: posto(null) };
  if (adesso - siAl >= MS) return { esito: 'dentro', sito, ...g, motivo: 'tempo', fresco: false, stato: posto(siAl) };
  return { esito: 'dentro', sito, ...g, fresco: true, stato: posto(siAl) };
}

// Che cosa «cambia qualcosa» (forma §1). Telefono, vocabolario del pilota (Mobile 14:50) ed equivalenti del nucleo: legge soltanto
// questo elenco, tutto il resto cambia (verso sicuro). PC: legge soltanto questo elenco; `premi` cambia salvo sui ruoli che si leggono.
const SOLO_LETTURA_TELEFONO = new Set(['scorri', 'indietro', 'home', 'recenti', 'apri_app', 'attendi', 'fine', 'sistema', 'apri', 'aspetta']);
const SOLO_LETTURA_PC = new Set(['scorri', 'hover', 'zoom', 'aspetta', 'chiedi_persona', 'fine']);
const RUOLI_CHE_SI_LEGGONO = new Set(['testo', 'intestazione', 'titolo', 'immagine', 'area-scorrevole', 'scheda', 'campo']);
const PREMERE = new Set(['premi', 'clic']);

/**
 * L'azione cambia qualcosa sulla pagina o nell'app? Pura. Una protezione riconosciuta cambia sempre; in dubbio, sì.
 * @param {{tipo?: string, combinazione?: unknown, indirizzo?: unknown}} azione
 * @param {{ruolo?: string}|null} bersaglio
 * @param {{protezione?: string|null}|null} v — l'esito di valutaAzione
 * @param {{nome?: string}} politica
 * @param {{domini?: string[]}|null} piano
 */
export function cambiaQualcosa(azione, bersaglio, v, politica, piano) {
  const tipo = typeof azione?.tipo === 'string' ? azione.tipo : '';
  if (v && v.protezione != null) return true;
  if (politica?.piattaforma === 'telefono') return !SOLO_LETTURA_TELEFONO.has(tipo); // anche telefonoAccessoPieno (decisione 160)
  if (SOLO_LETTURA_PC.has(tipo)) return false;
  if (PREMERE.has(tipo)) return !(bersaglio && RUOLI_CHE_SI_LEGGONO.has(bersaglio.ruolo));
  if (tipo === 'tasti') return !tastiSenzaEffetto(azione.combinazione);
  if (tipo === 'apri') {
    // `vai` nel piano non cambia niente; fuori dal piano (o un indirizzo che non si legge, o un'app) sì
    const h = typeof azione.indirizzo === 'string' ? hostDi(azione.indirizzo) : null;
    const domini = Array.isArray(piano?.domini) ? piano.domini : [];
    // R8 (revisione R): lo stesso confronto del ciclo, che non prende «github.io» o «co.uk» per un sito del piano
    return !(h && domini.some((d) => { const x = hostDi(d); return x !== null && dominioSotto(h, x); }));
  }
  return true;
}

/**
 * Il «Sto guardando» della persona per quel sito: vale da adesso. Un orologio illeggibile non dà un sì. Con l'app in primo piano (il
 * browser sul PC, il pacchetto sul telefono) lo stato la ricorda: una lettura senza indirizzo resta dentro solo in quell'app (D2).
 */
export function siDellaPersona(sito, adesso, app = null) {
  if (!sito || !Number.isFinite(adesso)) return STATO_GUARDIA_VUOTO;
  const a = nomeApp(app);
  return a === null ? { sito, siAl: adesso } : { sito, siAl: adesso, app: a };
}

/** Il nome dell'app in primo piano, minuscolo e senza spazi ai lati; null se non si legge. */
function nomeApp(app) {
  const a = typeof app === 'string' ? app.trim().toLowerCase() : '';
  return a || null;
}
