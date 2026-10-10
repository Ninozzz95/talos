/*
 * C1 (owner 10/10/2026) — il contenuto delle due finestre della scheda Contesto, costruito a nodi (mai markup da stringa):
 *  · «La richiesta inviata al modello»: prompt di sistema, messaggi e attrezzi dell'ultima chiamata (`GET /last-request`),
 *    come OpenCode `session-context-tab.tsx:351-369`;
 *  · «Cosa ha tenuto la compattazione»: le richieste della persona alla lettera, i fatti protetti, l'indice e il riassunto —
 *    dai CAMPI (`contesto-scheda.js::cosaHaTenuto`), mai dal testo.
 * Le apre `apriModale` (`modale-td.js`), la stessa delle altre finestre.
 */
import { t } from './lingua.js';

const nodo = (doc, tag, classe, testo) => {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined) n.textContent = testo;
  return n;
};
const sezione = (doc, titolo, ...figli) => {
  const s = nodo(doc, 'section', 'talos-contesto-sezione');
  s.append(nodo(doc, 'h3', 'talos-contesto-sezione__titolo', titolo), ...figli.filter(Boolean));
  return s;
};
const blocco = (doc, testo) => nodo(doc, 'pre', 'talos-contesto-testo', testo);

/** Il testo di un contenuto di messaggio: le parti non testuali (immagini) diventano un segnaposto detto. */
export function testoDelMessaggio(contenuto) {
  if (typeof contenuto === 'string') return contenuto;
  if (!Array.isArray(contenuto)) return '';
  return contenuto.map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : t('processi.inspector.sentImageOmitted'))).join('\n');
}

/**
 * @param {Document} doc
 * @param {{at?:string, model?:string|null, messages?:object[], tools?:object[]}|null} ultima
 * @param {{ ora?: (iso:string)=>string }} [opzioni]
 * @returns {Node[]}
 */
export function nodiRichiestaInviata(doc, ultima, { ora = (iso) => iso } = {}) {
  if (!ultima) return [nodo(doc, 'p', 'talos-muted', t('processi.inspector.sentRequestNone'))];
  const messaggi = Array.isArray(ultima.messages) ? ultima.messages : [];
  const sistema = messaggi.filter((m) => m?.role === 'system' || m?.role === 'developer');
  const resto = messaggi.filter((m) => !(m?.role === 'system' || m?.role === 'developer'));
  const attrezzi = Array.isArray(ultima.tools) ? ultima.tools : [];
  const meta = nodo(doc, 'p', 'talos-muted', t('processi.inspector.sentRequestMeta', { model: ultima.model ?? '—', time: ultima.at ? ora(ultima.at) : '—' }));
  const elencoMessaggi = nodo(doc, 'ol', 'talos-contesto-elenco');
  for (const m of resto) {
    const voce = nodo(doc, 'li', 'talos-contesto-elenco__voce');
    const chiamate = Array.isArray(m?.tool_calls) && m.tool_calls.length ? `\n${m.tool_calls.map((c) => `→ ${c?.function?.name ?? '?'}(${c?.function?.arguments ?? ''})`).join('\n')}` : '';
    voce.append(nodo(doc, 'b', 'talos-contesto-elenco__ruolo', String(m?.role ?? '?')), blocco(doc, `${testoDelMessaggio(m?.content)}${chiamate}`.replace(/^\n/, '')));
    elencoMessaggi.append(voce);
  }
  const nomi = attrezzi.map((a) => a?.function?.name ?? a?.name).filter((n) => typeof n === 'string');
  return [
    meta,
    sezione(doc, t('processi.inspector.sentSystem'), blocco(doc, sistema.map((m) => testoDelMessaggio(m.content)).join('\n\n— — —\n\n'))),
    sezione(doc, t('processi.inspector.sentMessages', { n: resto.length }), elencoMessaggi),
    sezione(doc, t('processi.inspector.sentTools', { n: nomi.length }), blocco(doc, nomi.join('\n'))),
  ];
}

/**
 * @param {Document} doc
 * @param {{richieste:{total:number,kept:{n:number,text:string}[]}|null, fatti:string[], indice:string|null, riassunto:string|null, fonte:string|null}} tenuto
 * @returns {Node[]}
 */
export function nodiCosaHaTenuto(doc, tenuto) {
  if (!tenuto?.fonte) return [nodo(doc, 'p', 'talos-muted', t('processi.inspector.keptNothing'))];
  const parti = [];
  if (tenuto.richieste) {
    const elenco = nodo(doc, 'ol', 'talos-contesto-elenco');
    for (const r of tenuto.richieste.kept) { const li = nodo(doc, 'li', 'talos-contesto-elenco__voce'); li.value = r.n; li.append(blocco(doc, r.text)); elenco.append(li); }
    parti.push(sezione(doc, `${t('processi.inspector.keptRequests')} · ${t('processi.inspector.keptRequestsCount', { kept: tenuto.richieste.kept.length, total: tenuto.richieste.total })}`, elenco));
  } else if (tenuto.fonte === 'motore') {
    parti.push(nodo(doc, 'p', 'talos-muted', t('processi.inspector.keptOldVersion')));
  }
  if (tenuto.fatti.length) {
    const elenco = nodo(doc, 'ul', 'talos-contesto-elenco');
    for (const f of tenuto.fatti) elenco.append(nodo(doc, 'li', 'talos-contesto-elenco__voce', f));
    parti.push(sezione(doc, `${t('processi.inspector.keptFacts')} (${tenuto.fatti.length})`, elenco));
  }
  if (tenuto.indice) parti.push(sezione(doc, t('processi.inspector.keptIndex'), blocco(doc, tenuto.indice)));
  if (tenuto.riassunto) parti.push(sezione(doc, t('processi.inspector.keptSummary'), blocco(doc, tenuto.riassunto)));
  return parti;
}
