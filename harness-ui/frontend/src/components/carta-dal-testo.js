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
import { oscuraFormeDiSegreto, SEGRETO_OSCURATO } from '../../../src/forme-di-segreto.mjs';

const CHIAVI_DEL_BERSAGLIO = ['percorso', 'path', 'file', 'file_path', 'comando', 'command', 'cmd', 'url', 'indirizzo', 'query', 'domanda'];
const CHIAVI_DEL_COMANDO = ['comando', 'command', 'cmd'];
/* un nome di campo che è già un nome di segreto: il valore si oscura intero, qualunque forma abbia */
const NOME_DI_SEGRETO = /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd)$|[_-]key$/iu;

const argomentiDi = (azione) => (azione?.argomenti && typeof azione.argomenti === 'object' && !Array.isArray(azione.argomenti) ? azione.argomenti : {});
const primoTesto = (a, chiavi) => {
  for (const k of chiavi) if (typeof a[k] === 'string' && a[k].trim()) return { chiave: k, valore: a[k] };
  return null;
};

/** Il valore di un argomento come si legge sulla carta: testo com'è, il resto in JSON ordinato; segreti oscurati. */
export function valoreLeggibile(chiave, valore) {
  if (NOME_DI_SEGRETO.test(String(chiave))) return SEGRETO_OSCURATO;
  const testo = typeof valore === 'string' ? valore : JSON.stringify(valore, null, 2) ?? String(valore);
  return oscuraFormeDiSegreto(testo);
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

/** Gli argomenti in righe `{ k, v }`, nell'ordine in cui il modello li ha scritti, tranne il comando (sta nel blocco del codice). */
export function righeDegliArgomenti(azione) {
  const a = argomentiDi(azione);
  const comando = primoTesto(a, CHIAVI_DEL_COMANDO)?.chiave ?? null;
  return Object.entries(a).filter(([k]) => k !== comando).map(([k, v]) => ({ k, v: valoreLeggibile(k, v) }));
}

/** Il blocco delle righe voce/valore, o `null` se non ce n'è nessuna. */
export function bloccoDegliArgomenti(doc, azione) {
  const righe = righeDegliArgomenti(azione);
  if (!righe.length) return null;
  const blocco = doc.createElement('div');
  blocco.className = 'talos-approval__automazione';
  blocco.dataset.argomentiDalTesto = '';
  blocco.setAttribute('aria-label', t('chat.approval.fromText.arguments'));
  for (const { k, v } of righe) {
    const riga = doc.createElement('div');
    riga.className = 'talos-kv';
    const kk = doc.createElement('span'); kk.className = 'talos-kv__k'; kk.textContent = etichettaArgomento(k); // revisione E1 (04/11): la voce `app.activity.arg.*`, grezzo se non c'è
    const vv = doc.createElement('span'); vv.className = 'talos-kv__v'; vv.textContent = v;
    riga.append(kk, vv);
    blocco.append(riga);
  }
  return blocco;
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
