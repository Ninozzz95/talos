/*
 * La lingua delle risposte e della dettatura (owner 28/10/2026, via Mobile, quattro consigliate): «Automatica» di serie — TALOS
 * risponde nella lingua in cui la persona scrive o parla —, oppure una lingua scelta, come `language` di Claude Code. Il valore
 * viaggia al server come codice BCP 47 (`linguaDelleRisposte`), e il nucleo lo traduce nel nome inglese della lingua per il modello
 * (`rigaLinguaDelleRisposte`): qui servono solo i codici e i nomi da mostrare.
 * I nomi non stanno nel dizionario: li dà `Intl.DisplayNames`, nella lingua dell'interfaccia, più il nome della lingua in se stessa
 * («Persiano (فارسی)»), così la trova anche chi non legge la lingua dei menu.
 */
export const LINGUA_AUTOMATICA = 'auto';
export const LINGUE_DELLE_RISPOSTE = Object.freeze([
  'ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl',
  'pt', 'pt-BR', 'ro', 'ru', 'sv', 'sw', 'th', 'tr', 'uk', 'ur', 'vi', 'zh-Hans', 'zh-Hant',
]);
export const VALORI_LINGUA_DELLE_RISPOSTE = Object.freeze([LINGUA_AUTOMATICA, ...LINGUE_DELLE_RISPOSTE]);

/** Il nome di una lingua da mostrare: nella lingua dell'interfaccia, e fra parentesi in se stessa quando è diversa. */
export function nomeDellaLinguaDaMostrare(codice, linguaInterfaccia = 'it') {
  let nome = codice;
  let proprio = codice;
  try { nome = new Intl.DisplayNames([linguaInterfaccia], { type: 'language' }).of(codice) ?? codice; } catch { /* resta il codice */ }
  try { proprio = new Intl.DisplayNames([codice], { type: 'language' }).of(codice) ?? codice; } catch { /* resta il codice */ }
  proprio = proprio.replace(/\s*\(([^)]+)\)/u, ', $1'); // «português (Brasil)» dentro le parentesi diventa «português, Brasil»
  const maiuscola = (s) => (s ? s.charAt(0).toLocaleUpperCase(linguaInterfaccia) + s.slice(1) : s);
  const daMostrare = maiuscola(nome);
  return proprio && proprio.toLocaleLowerCase() !== nome.toLocaleLowerCase() ? `${daMostrare} (${proprio})` : daMostrare;
}

/** Le opzioni del selettore, nell'ordine alfabetico della lingua dell'interfaccia; «Automatica» resta prima, fuori da qui. */
export function opzioniLingueDelleRisposte(linguaInterfaccia = 'it') {
  const collatore = new Intl.Collator(linguaInterfaccia);
  return LINGUE_DELLE_RISPOSTE.map((codice) => ({ codice, nome: nomeDellaLinguaDaMostrare(codice, linguaInterfaccia) }))
    .sort((a, b) => collatore.compare(a.nome, b.nome));
}

/** La lingua per la dettatura del browser: quella scelta, o con «Automatica» quella dell'interfaccia (il riconoscitore non indovina). */
export function linguaDellaDettatura(scelta, localeInterfaccia) {
  return scelta && scelta !== LINGUA_AUTOMATICA && LINGUE_DELLE_RISPOSTE.includes(scelta) ? scelta : localeInterfaccia;
}
