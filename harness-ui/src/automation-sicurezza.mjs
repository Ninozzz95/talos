/**
 * automation-sicurezza.mjs — che cosa la carta di un'automazione deve far VEDERE prima del sì della persona.
 *
 * ⛔⛔ Owner 08/10/2026 sera (dopo la review del bugfixer e la ricerca sui concorrenti, `.claude/RICERCA-AUTOMAZIONI-SICUREZZA-
 *   2026-10-08.md`):
 *   - decisione 12: la carta EVIDENZIA quando la bozza va oltre la conversazione che la chiede — permessi più ampi, un'altra
 *     cartella, la Coordinazione accesa — e «Accesso pieno» sempre; una cartella mai aperta in TALOS si dice (come Claude Code
 *     Desktop: «If you haven't trusted that folder yet, Desktop prompts you to trust it before saving»);
 *   - decisione 13: le istruzioni si SCANSIONANO contro l'iniezione alla creazione e alla modifica, come Hermes
 *     (`tools/cronjob_prompt_scan.py`, clone del 07/10: «A directive-shaped cron prompt has no business containing `cat
 *     ~/.hermes/.env` or `rm -rf /`; there it is a smoking gun, not prose»). Qui si guarda il testo delle ISTRUZIONI (scritte
 *     dalla persona o proposte dal modello), mai la risposta di un modello per deciderne l'esito.
 * Funzioni pure: nessuna lettura di disco, nessun orologio. Le parole per la persona le sceglie l'interfaccia dai codici.
 */

import { posix, win32 } from 'node:path';

/* L'ordine di potenza dei permessi: «Ricerca» (della chat) legge come «Sola lettura»; «Su richiesta» chiede a ogni scrittura,
   quindi sta sotto a «Scrive nel progetto»; «Accesso pieno» è il massimo. Un valore sconosciuto vale come il massimo (si
   avvisa, non si tace). */
const POTENZA_PERMESSI = Object.freeze({ 'Read only': 0, Research: 0, 'On request': 1, 'Workspace write': 2, 'Full access': 3 });
const potenza = (permessi) => (Object.hasOwn(POTENZA_PERMESSI, permessi) ? POTENZA_PERMESSI[permessi] : 3);

/**
 * Il percorso RISOLTO (review del bugfixer, Y1: confrontare le stringhe faceva passare `progetto\..\..\Windows` per «dentro
 * `progetto`»): `win32.resolve` per un percorso Windows (lettera di unità o UNC), `posix.resolve` per uno che parte da `/`.
 * Un percorso relativo non ha una cartella da confrontare: `null`, e chi confronta lo tratta come «fuori».
 */
export function percorsoRisolto(percorso) {
  if (typeof percorso !== 'string' || !percorso.trim()) return null;
  const p = percorso.trim();
  if (/^[a-zA-Z]:[\\/]/u.test(p) || /^\\\\[^\\]/u.test(p)) return win32.resolve(p);
  if (p.startsWith('/')) return posix.resolve(p);
  return null;
}
/* Risolto, e su Windows senza maiuscole (il file system non le distingue) */
function percorsoNormale(percorso) {
  const p = percorsoRisolto(percorso);
  return p && p.includes('\\') ? p.toLowerCase() : p;
}
/** Se `figlio` è `padre` o sta dentro di lui, dopo aver risolto tutti e due (`..`, barre doppie, maiuscole su Windows). */
export function dentroDi(figlio, padre) {
  const f = percorsoNormale(figlio);
  const p = percorsoNormale(padre);
  if (!f || !p) return false;
  if (f === p) return true;
  const sep = p.includes('\\') ? '\\' : '/';
  return f.startsWith(p.endsWith(sep) ? p : p + sep);
}

/**
 * Dove la bozza va oltre la conversazione. `bozza` = la voce come sarebbe dopo il sì (permessi, cartella, coordinazione);
 * `chat` = { permessi, cartella, coordinazioneAccesa, cartellaNota(percorso)→boolean|null }.
 * @returns {Array<{codice:string, chat?:any, bozza?:any}>} nell'ordine in cui la carta li mostra
 */
export function oltreLaChat(bozza, chat = {}) {
  const avvisi = [];
  if (!bozza || typeof bozza !== 'object') return avvisi;
  if (bozza.permessi === 'Full access') avvisi.push({ codice: 'accesso-pieno' });
  const permessiChat = typeof chat.permessi === 'string' ? chat.permessi : 'Workspace write';
  if (typeof bozza.permessi === 'string' && potenza(bozza.permessi) > potenza(permessiChat)) {
    avvisi.push({ codice: 'permessi-piu-ampi', chat: permessiChat, bozza: bozza.permessi });
  }
  if (typeof bozza.cartella === 'string' && typeof chat.cartella === 'string' && !dentroDi(bozza.cartella, chat.cartella)) {
    avvisi.push({ codice: 'altra-cartella', chat: chat.cartella, bozza: bozza.cartella });
  }
  if (typeof bozza.cartella === 'string' && typeof chat.cartellaNota === 'function' && chat.cartellaNota(bozza.cartella) === false) {
    avvisi.push({ codice: 'cartella-mai-aperta', bozza: bozza.cartella });
  }
  if (bozza.coordinazione === true && chat.coordinazioneAccesa !== true) avvisi.push({ codice: 'coordinazione-accesa' });
  return avvisi;
}

/*
 * I pattern di Hermes, alla lettera (clone del 23/09 in TALOS-RICERCHE/concorrenti/hermes-agent-2026-09-24):
 * `_CRON_THREAT_PATTERNS` e `_CRON_EXFIL_COMMAND_PATTERNS` (`tools/cronjob_prompt_scan.py:27-51`), più le stesse frasi in
 * italiano: le istruzioni di TALOS si scrivono anche in italiano, e una difesa che parla una lingua sola ha un buco. Review del
 * bugfixer dell'08/10 sera (Y2): mancavano `exfil_wget_post`, `rm -rf /` senza terminatore, la ZWJ e gli isolati bidi.
 */
const SEGRETO = String.raw`\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)\w*\}?`;
const MINACCE = Object.freeze([
  ['ignora-istruzioni', /ignore\s+(?:\w+\s+)*(?:previous|all|above|prior)\s+(?:\w+\s+)*instructions/iu],
  ['ignora-istruzioni', /ignora\s+(?:\S+\s+){0,4}istruzioni\s+(?:precedenti|sopra|di\s+prima)/iu],
  /* Nota 2 del bugfixer (08/10 notte): l'apostrofo è facoltativo — «dont tell the user» e «non dirlo all utente» si scrivono
     così su una tastiera di fretta, e una direttiva d'inganno resta tale senza apostrofo. */
  ['nascondi-alla-persona', /(?:do\s+not|don['’]?t)\s+tell\s+the\s+user/iu],
  ['nascondi-alla-persona', /non\s+(?:dirl[oae]|dirgli|dire)(?:\s+(?:niente|nulla))?\s+(?:all(?:['’]\s*|\s+)utente|alla\s+persona)/iu],
  ['sostituisci-sistema', /system\s+prompt\s+override/iu],
  ['ignora-regole', /disregard\s+(?:your|all|any)\s+(?:instructions|rules|guidelines)/iu],
  ['ignora-regole', /(?:ignora|non\s+rispettare)\s+(?:le\s+)?(?:tue\s+)?regole/iu],
  ['legge-segreti', /cat\s+[^\n]*(?:\.env|credentials|\.netrc|\.pgpass|id_rsa|id_ed25519|id_ecdsa)/iu],
  ['porta-ssh', /authorized_keys/iu],
  ['sudoers', /\/etc\/sudoers|visudo/iu],
  ['cancella-radice', /rm\s+-rf\s+\//iu], // come Hermes (:34): senza terminatore, `rm -rf /*` compreso
  ['esfiltra', new RegExp(String.raw`curl\s+[^\n]*https?://[^\s"'\x60]*${SEGRETO}`, 'iu')],
  ['esfiltra', new RegExp(String.raw`wget\s+[^\n]*https?://[^\s"'\x60]*${SEGRETO}`, 'iu')],
  ['esfiltra', new RegExp(String.raw`curl\s+[^\n]*(?:--data(?:-raw|-binary|-urlencode)?|-d|--form|-F)\s+[^\n]*${SEGRETO}`, 'iu')],
  ['esfiltra', new RegExp(String.raw`wget\s+[^\n]*--post-(?:data|file)=[^\n]*${SEGRETO}`, 'iu')],
  ['esfiltra', new RegExp(String.raw`curl\s+[^\n]*(?:-H|--header)\s+["']Authorization:\s*(?:Bearer|token)\s+${SEGRETO}["']`, 'iu')],
]);
/*
 * L'eccezione di Hermes (`_strip_cron_safe_constructs`, :74-89): il curl a `api.github.com` con `Authorization: token
 * $GITHUB_TOKEN` è il modo normale di parlare con GitHub, e si toglie PRIMA della scansione. Solo l'host esatto: un
 * `api.github.com.evil.com` o `api.github.com@evil.com` resta dentro e si scansiona.
 */
const GITHUB_SICURO = new RegExp(String.raw`curl\s+[^\n;&|$\x60]*(?:-H|--header)\s+["']Authorization:\s*token\s+${SEGRETO}["']`
  + String.raw`\s+["']?https://api\.github\.com(?::\d+)?(?:/|\s|$|["'])[^\s;&|$\x60]*`, 'giu');
/* Caratteri invisibili: quelli di Hermes (`threat_patterns.py:110-112`, isolati bidi compresi) più i segni di direzione. */
const INVISIBILI = new Set(
  [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064,
    0x2066, 0x2067, 0x2068, 0x2069, 0xfeff].map((c) => String.fromCodePoint(c)),
);
/* La ZWJ è parte di molte emoji (famiglie, bandiere): vale solo fra due emoji, saltando il selettore U+FE0F (Hermes :53-71). */
const ZWJ = String.fromCodePoint(0x200d);
const SELETTORE = String.fromCodePoint(0xfe0f);
const INTERVALLI_EMOJI = [[0x1f000, 0x1ffff], [0x2600, 0x27bf], [0x2300, 0x23ff], [0x1f1e6, 0x1f1ff], [0x20e3, 0x20e3]];
const eEmoji = (c) => c !== undefined && INTERVALLI_EMOJI.some(([da, a]) => c.codePointAt(0) >= da && c.codePointAt(0) <= a);
function zwjFraEmoji(caratteri, i) {
  let s = i - 1;
  while (s >= 0 && caratteri[s] === SELETTORE) s -= 1;
  let d = i + 1;
  while (d < caratteri.length && caratteri[d] === SELETTORE) d += 1;
  return eEmoji(caratteri[s]) && eEmoji(caratteri[d]);
}

/** I motivi per cui un testo di istruzioni sembra un'iniezione, senza doppioni; `[]` se pulito. */
export function scansionaIstruzioni(testo) {
  if (typeof testo !== 'string' || !testo) return [];
  const motivi = [];
  /* NFKC piega le varianti a larghezza piena (ｉｇｎｏｒｅ → ignore), come Hermes (`threat_patterns.py:141-143`); non piega le
     lettere di altri alfabeti che si somigliano (quello vorrebbe la base dati TR#39) */
  const piegato = testo.normalize('NFKC').replace(GITHUB_SICURO, 'curl https://api.github.com/user');
  for (const [codice, regola] of MINACCE) if (regola.test(piegato) && !motivi.includes(codice)) motivi.push(codice);
  const caratteri = [...testo];
  if (caratteri.some((c, i) => INVISIBILI.has(c) && !(c === ZWJ && zwjFraEmoji(caratteri, i)))) motivi.push('caratteri-invisibili');
  return motivi;
}
