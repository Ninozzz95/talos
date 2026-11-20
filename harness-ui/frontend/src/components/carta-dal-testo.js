/*
 * R-34 parte 2 — la carta «chiamata scritta come testo» (owner 30/10/2026 notte: bozzetto G0 della Frontend APPROVATO, con la nota
 * dopo due no). Un modello LOCALE ha scritto una chiamata come testo invece di chiamare l'attrezzo; il nucleo l'ha ricostruita
 * (`talosHarness.mjs`, `verificaChiamataDalTesto`, azione `{ tipo: 'chiamata-dal-testo', nome, argomenti, frase… }`) e chiede SEMPRE
 * alla persona, anche in Accesso pieno (decisione dell'owner del 30/10: un testo non parte mai da solo).
 *
 * Qui stanno i pezzi della carta che non dipendono dalla pagina:
 *   · il bersaglio in testa: preso dagli argomenti come per le altre carte (percorso, comando, indirizzo); senza, il nome umano;
 *   · il comando, se c'è, nel blocco del codice (`.talos-approval__codice`, come la carta della shell: revisione del Mobile);
 *   · gli altri argomenti in righe voce/valore (`.talos-approval__automazione` + `.talos-kv`, il pezzo delle carte d'automazione),
 *     mai JSON grezzo, coi segreti oscurati (`forme-di-segreto.mjs`, lo stesso modulo del server);
 *   · il segno «dal testo» sulla riga dell'attrezzo, con la grammatica di `consentito-da.js` (badge neutro, frase intera al passaggio
 *     e per chi legge con lo screen reader). Il dato arriva da `ToolCallStart.daTesto` (agent-service.mjs), mai dal prefisso dell'id.
 */
import { t } from './lingua.js';
import { etichettaArgomento } from './etichette-argomenti.js';
import { campoSegreto, nomeDiCampoSegreto, oscuraFormeDiSegreto, oscuraPerStruttura, oscuraTestoInArrivo, SEGRETO_OSCURATO, siNoLeggibile } from '../../../src/forme-di-segreto.mjs';

const CHIAVI_DEL_BERSAGLIO = ['percorso', 'path', 'file', 'file_path', 'comando', 'command', 'cmd', 'url', 'indirizzo', 'query', 'domanda'];
const CHIAVI_DEL_COMANDO = ['comando', 'command', 'cmd'];
/* Un nome di campo che è già un nome di segreto: il valore si oscura intero, qualunque forma abbia. Cura gemella della 0.2.2, giro 3
   (giudice v1853, punto 2): l'elenco dei nomi sta in UN posto, `forme-di-segreto.mjs` (`nomeDiCampoSegreto`), lo stesso che usa il nucleo
   per la carta di un connettore; qui c'era una copia della stessa espressione. */

const argomentiDi = (azione) => (azione?.argomenti && typeof azione.argomenti === 'object' && !Array.isArray(azione.argomenti) ? azione.argomenti : {});
/* Cura gemella della 0.2.2, giro 5 (revisore 1, ROSSO 3): la cima degli argomenti può essere una lista, un testo o un numero; il nucleo la
   porta sulla carta (`argomentiPerLaCarta`) e l'attrezzo la riceve. `argomentiDi` (sopra, per il bersaglio e il comando) la azzerava e la
   carta restava senza righe: il plugin partiva con `["--delete-all","/"]`. Qui la cima non oggetto è UNA riga, il suo JSON, la stessa del
   terminale (`approval-dialog.ts`, `approvalArguments`). Codex non la mostra (`mcp_tool_call.rs:2245`, `as_object()?`); pi la scrive in
   JSON di qualunque tipo (`execute.ts:69`). Assente o nulla resta nessuna riga. */
const cimaNonOggetto = (azione) => {
  const a = azione?.argomenti;
  return a === undefined || a === null || (typeof a === 'object' && !Array.isArray(a)) ? undefined : a;
};
/* GIALLO del revisore 1: i caratteri di direzione e quelli a larghezza zero arrivavano crudi nelle righe («invoice\u202efdp.exe», due righe che
   si leggono «path», un nome fatto di un solo carattere invisibile). Si scrivono come li scrive il terminale (`inertText`,
   `cli/src/tui/overlays/approval-dialog.ts:477-490`): ogni controllo C0/C1, U+2028/2029, ogni Bidi_Control e ogni
   Default_Ignorable_Code_Point diventa `\uXXXX`, e la barra rovesciata raddoppia, così un `\u202e` scritto a mano non si confonde con quello
   vero; in un JSON la barra resta com'è (il JSON l'ha già raddoppiata). Stessa forma sulle due, con UNA differenza dichiarata: a capo e
   tab restano, perché la riga della pagina va a capo da sé (`white-space: pre-wrap`) e il JSON di un oggetto si legge su più righe.
   Come Claude Code (CHANGELOG 4473: «invisible Unicode can no longer hide part of the command from the approval dialog»). */
const INVISIBILE_SULLA_CARTA = /[\x5c\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
export function testoInerte(valore, { json = false } = {}) {
  return String(valore).replace(INVISIBILE_SULLA_CARTA, (c) => {
    if (c === '\\') return json ? '\\' : '\\\\';
    const codice = c.codePointAt(0);
    return codice > 0xffff ? `\\u{${codice.toString(16)}}` : `\\u${codice.toString(16).padStart(4, '0')}`;
  });
}
const primoTesto = (a, chiavi) => {
  for (const k of chiavi) if (typeof a[k] === 'string' && a[k].trim()) return { chiave: k, valore: a[k] };
  return null;
};

/** Il valore di un argomento come si legge sulla carta: testo com'è, il resto in JSON ordinato; segreti oscurati. */
export function valoreLeggibile(chiave, valore) {
  /* cura gemella 0.2.2, giro 6: un sì/no sotto un nome che la base non oscurava resta leggibile (`clear_cookies: true`), come nel nucleo */
  if ((nomeDiCampoSegreto(String(chiave)) && !siNoLeggibile(String(chiave), valore)) || campoSegreto(String(chiave), valore)) return SEGRETO_OSCURATO; // 0.2.4 blocco 1: anche `tokens` che non conta
  /* giro 7 (revisore della pagina, punto 1): un oggetto o una lista si oscura per STRUTTURA prima del JSON, come il nucleo fa per la carta
     di un connettore: `{"db":{"password":"hunter2"}}` si leggeva in chiaro su questa carta e oscurato sull'altra. Poi le forme sul JSON,
     come prima: niente di ciò che la 0.2.1 oscurava torna in chiaro. */
  const testo = typeof valore === 'string' ? valore : JSON.stringify(oscuraPerStruttura(valore), null, 2) ?? String(valore);
  return oscuraFormeDiSegreto(testo);
}

/* Giro 7, punto zero (revisore 3, ROSSO 1, sulla pagina): la riga dell'attrezzo nella conversazione stampava gli argomenti com'erano
   arrivati, `password: hunter2` compreso, in testa e nel dettaglio. Qui gli argomenti DA MOSTRARE: le stesse maschere della carta
   (`oscuraPerStruttura`). Mentre arrivano a pezzi il JSON è incompleto: si chiude per la vista (la virgoletta aperta, le parentesi aperte;
   un nome a metà o una virgola in coda si tolgono), poi si oscura; un valore spezzato fra due pezzi sotto un nome di segreto è
   «[redacted]» dal primo pezzo, perché il nome arriva intero prima del valore. Un JSON che non si chiude non si mostra (`null`): mai un
   pezzo di JSON grezzo a schermo, come la riga del terminale (`cli/src/tui/tools/shared.ts`, `parseArgs`). Il modello e l'attrezzo
   ricevono gli argomenti veri: questa è solo la copia per lo schermo.
 * ⛔ Giro 8 (owner 14/11 23:49, giudice v1917-v1920):
 *   - P1 (revisore della pagina) e R1 (revisore 3): il valore ANCORA APERTO non si mostra. Chiuderlo per la vista mostrava a metà un segreto
 *     riconosciuto dalla FORMA (le forme vogliono il token intero: un token GitHub, 37 caratteri su 44 a schermo). Ora si legge «…» finché
 *     la sua virgoletta non arriva, poi passa dalle maschere come prima. Come Codex, che i pezzi degli argomenti non li mostra affatto
 *     (`codex-rs/codex-api/src/sse/responses.rs:542`); noi mostriamo i valori già chiusi;
 *   - H1 (revisore 1): l'espressione che toglieva un nome senza valore (`/,?\s*"…"\s*:$/u`) tornava indietro col quadrato su una fila di
 *     spazi (80 KB: 6,8 s per fotogramma). Ora tutto si legge in UN passaggio: l'ultimo carattere non spazio, l'inizio e la fine dell'ultimo
 *     testo chiuso; un nome senza valore si toglie con le posizioni già lette. Lineare. */
const SPAZIO = /\s/u; // gli stessi spazi di `trimEnd` (WhiteSpace e LineTerminator)
function chiudiJsonParziale(testo) {
  const pila = [];
  let inTesto = false, barra = false, nome = false, inizio = -1, ultimo = '', inizioChiuso = -1, fineChiuso = -1;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inTesto) {
      if (barra) barra = false;
      else if (c === '\\') barra = true;
      else if (c === '"') { inTesto = false; inizioChiuso = inizio; fineChiuso = i; ultimo = c; }
      continue;
    }
    if (c === '"') {
      inTesto = true;
      inizio = i;
      nome = pila.at(-1) === '{' && (ultimo === '{' || ultimo === ',');
    } else if (c === '{' || c === '[') pila.push(c);
    else if (c === '}' || c === ']') pila.pop();
    if (!SPAZIO.test(c)) ultimo = c;
  }
  let fuori;
  if (inTesto && nome) fuori = testo.slice(0, inizio); // un nome a metà: via, il suo valore non è ancora arrivato
  else if (inTesto) fuori = `${testo.slice(0, inizio)}"…"`; // un valore aperto: «…» finché non si chiude, mai un suo pezzo
  else {
    fuori = testo.trimEnd();
    if (fuori.endsWith(':')) { // un nome senza valore: via (l'ultimo testo chiuso, se fra lui e i due punti ci sono solo spazi)
      let j = fuori.length - 2;
      while (j >= 0 && SPAZIO.test(fuori[j])) j -= 1;
      if (j === fineChiuso) fuori = fuori.slice(0, inizioChiuso);
    }
  }
  fuori = fuori.trimEnd();
  if (fuori.endsWith(',')) fuori = fuori.slice(0, -1);
  return fuori + pila.reverse().map((p) => (p === '{' ? '}' : ']')).join('');
}
/* Cura dell uscita 0.2.2 (giudice v1966): `giaLetti` è l oggetto che il chiamante ha già letto dalla STESSA stringa. Si maschera con la
   stessa `oscuraPerStruttura` e non si rilegge (prima: due JSON.parse a ogni disegno della riga nel replay). Senza, la strada di prima. */
export function argomentiDellaRiga(grezzo, giaLetti = null) {
  if (giaLetti !== null && typeof giaLetti === 'object') return oscuraPerStruttura(giaLetti);
  const testo = String(grezzo ?? '').trim();
  if (!testo || (testo[0] !== '{' && testo[0] !== '[')) return null;
  let v;
  try { v = JSON.parse(testo); } catch {
    try { v = JSON.parse(chiudiJsonParziale(testo)); } catch { return null; }
  }
  return v !== null && typeof v === 'object' ? oscuraPerStruttura(v) : null;
}
/* Giudice v1971 (16/11): la riga dal vivo, a OGNI delta, con UNA lettura (prima tre su un delta a metà: 3,71 contro 0,81 ms per pezzo).
   Si legge la stringa già chiusa: su un JSON intero `chiudiJsonParziale` la rende uguale (nessuna pila aperta, niente in coda), quindi
   uguale vuol dire intero e l oggetto vale anche come argomenti veri (`interi`); `mostrati` passa dalla stessa maschera di sempre. */
export function leggiArgomentiDellaRiga(grezzo) {
  const testo = String(grezzo ?? '').trim();
  const contenitore = testo[0] === '{' || testo[0] === '[';
  const chiuso = contenitore ? chiudiJsonParziale(testo) : testo;
  let v;
  try { v = JSON.parse(chiuso); } catch { return { interi: null, mostrati: null }; }
  /* 0.2.4 blocco 1, voce 5: i testi già chiusi non ripassano dalle forme a ogni pezzo (`ricorda`, forme-di-segreto.mjs) */
  return { interi: chiuso === testo ? v : null, mostrati: contenitore && v !== null && typeof v === 'object' ? oscuraPerStruttura(v, { ricorda: true }) : null };
}
/** Un testo di argomenti che non è JSON (un modello che non scrive JSON), da mostrare: con le forme dei segreti oscurate. Si disegna solo
    mentre arriva (`renderizzaArgomentiAttrezzo`, a ogni pezzo): 0.2.4 blocco 1, voce 5, l'ultima parola che può ancora diventare un segreto
    resta «…» finché non si chiude (`oscuraTestoInArrivo`), così un segreto spezzato fra due pezzi non si vede mai a metà. */
export function argomentiGrezziDellaRiga(grezzo, { finito = false } = {}) {
  const testo = String(grezzo ?? '');
  const t = testo.trim();
  if (t[0] === '{' || t[0] === '[') return '';
  /* 0.2.4 B1 giro 2 (revisore, giallo 2): finiti gli argomenti (`chiudiArgomentiInArrivo` in app.js) non arriva più niente e la coda
     trattenuta si mostra con le maschere di sempre: `which npm` non resta `which …` */
  return finito ? oscuraFormeDiSegreto(testo) : oscuraTestoInArrivo(testo);
}

/** Il bersaglio in testa alla carta: dagli argomenti; senza, il nome umano dell'attrezzo (`nomeUmano`, dato dalla pagina). */
export function bersaglioDalTesto(azione, nomeUmano = '') {
  const trovato = primoTesto(argomentiDi(azione), CHIAVI_DEL_BERSAGLIO);
  return trovato ? valoreLeggibile(trovato.chiave, trovato.valore) : nomeUmano;
}

/** Il comando da mostrare nel blocco del codice, oscurato; `''` se la chiamata non ne ha. */
export function comandoDalTesto(azione) {
  const trovato = primoTesto(argomentiDi(azione), CHIAVI_DEL_COMANDO);
  return trovato ? valoreLeggibile(trovato.chiave, trovato.valore) : '';
}

/**
 * Gli argomenti in righe `{ k, v }`, nell'ordine in cui il modello li ha scritti, tranne il comando (sta nel blocco del codice).
 * `tutti`: la carta di un connettore, di un plugin o di Tool Forge non ha il blocco del codice, quindi nessun argomento resta fuori.
 */
export function righeDegliArgomenti(azione, { tutti = false } = {}) {
  const cima = cimaNonOggetto(azione);
  if (cima !== undefined) return [{ k: '', v: testoInerte(oscuraFormeDiSegreto(JSON.stringify(oscuraPerStruttura(cima)) ?? String(cima)), { json: true }) }]; // giro 7: una lista si scende, come un oggetto
  const a = argomentiDi(azione);
  const comando = tutti ? null : primoTesto(a, CHIAVI_DEL_COMANDO)?.chiave ?? null;
  return Object.entries(a).filter(([k]) => k !== comando).map(([k, v]) => ({ k, v: testoInerte(valoreLeggibile(k, v), { json: typeof v !== 'string' }) }));
}

/**
 * Il blocco delle righe voce/valore, o `null` se non ce n'è nessuna. Cura gemella della 0.2.2, giro 3: lo stesso pezzo (e lo stesso CSS,
 * `[data-argomenti-dal-testo]`) per la carta di un connettore, di un plugin o di Tool Forge, con `tutti` e il suo nome per chi legge con
 * lo screen reader (`etichetta`).
 */
export function bloccoDegliArgomenti(doc, azione, { tutti = false, etichetta = 'chat.approval.fromText.arguments' } = {}) {
  const righe = righeDegliArgomenti(azione, { tutti });
  if (!righe.length) return null;
  const blocco = doc.createElement('div');
  blocco.className = 'talos-approval__automazione';
  blocco.dataset.argomentiDalTesto = '';
  blocco.setAttribute('aria-label', t(etichetta));
  for (const { k, v } of righe) {
    const riga = doc.createElement('div');
    riga.className = 'talos-kv';
    const vv = doc.createElement('span'); vv.className = 'talos-kv__v'; vv.textContent = v;
    /* giro 5: la cima non oggetto è una riga; giro 7 (owner 19:57, variante A del bozzetto): la sua voce è «valore», allineata come le altre */
    if (k === '') {
      const kk = doc.createElement('span'); kk.className = 'talos-kv__k talos-kv__k--generico'; kk.textContent = t('chat.approval.argumentValue');
      riga.append(kk, vv); blocco.append(riga); continue;
    }
    const kk = doc.createElement('span'); kk.className = 'talos-kv__k'; kk.textContent = testoInerte(etichettaArgomento(k)); // revisione E1 (04/11): la voce `app.activity.arg.*`, grezzo se non c'è; giro 5: gli invisibili del nome si vedono
    riga.append(kk, vv);
    blocco.append(riga);
  }
  return blocco;
}

/**
 * Cura gemella della 0.2.2, giro 3: il nucleo taglia un valore lungo col segno «…» e dice quanti ne ha tagliati (`argomentiTagliati`,
 * `talosHarness.mjs` `argomentiPerLaCarta`). La carta lo dice sotto le righe, nella lingua della persona; `null` se non ha tagliato niente.
 */
export function notaDegliArgomentiTagliati(doc, azione) {
  const quanti = Number(azione?.argomentiTagliati);
  if (!Number.isSafeInteger(quanti) || quanti <= 0) return null;
  const nota = doc.createElement('p');
  nota.className = 'talos-approval__motivo talos-approval__argomenti-tagliati'; // la riga piccola e attenuata della carta, coi suoi margini (come `talos-approval__sempre-non-salvato`)
  nota.textContent = t('chat.approval.argumentsCut', { count: quanti });
  return nota;
}

/**
 * Il segno «dal testo» sulla riga dell'attrezzo (e, a dettaglio pronto, la frase intera in testa al dettaglio). Una volta sola per
 * riga e una per dettaglio: il dettaglio si riscrive all'esito, e il segno si rimette lì senza raddoppiare quello della riga.
 */
export function segnaDalTesto({ riga, corpo = null }, opzioni = {}) {
  if (!riga) return;
  const doc = opzioni.document || riga.ownerDocument || globalThis.document;
  const frase = t('chat.approval.fromText.rowTitle');
  if (riga.dataset.dalTesto !== 'si') {
    riga.dataset.dalTesto = 'si';
    const segno = doc.createElement('span');
    segno.className = 'talos-badge talos-badge--sm talos-tool-row__dal-testo';
    segno.textContent = t('chat.approval.fromText.badge');
    segno.title = frase;
    segno.setAttribute('aria-label', frase);
    const prima = riga.querySelector(':scope > .talos-voce__meta') || riga.querySelector(':scope > .talos-dot');
    if (prima) prima.before(segno); else riga.append(segno);
  }
  if (!corpo || corpo.querySelector(':scope > .talos-tool-row__nota-dal-testo')) return;
  const nota = doc.createElement('p');
  nota.className = 'talos-tool-row__nota-dal-testo talos-muted';
  nota.textContent = frase;
  corpo.prepend(nota);
}
