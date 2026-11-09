/**
 * Computer use — chi si accorge delle istruzioni nascoste (DIFESA, strati 3 e 4; cure S6 e S7).
 *
 * Il ciclo reagisce a `s.sospetto` da quando esiste; questo modulo è chi lo accende. Puro e senza stato, importato solo dal computer use:
 * niente schemi nuovi nel percorso comune di `confine-dati.mjs` (condizione della CLI). Ritorna un CODICE, mai una frase.
 * Una scansione per osservazione, sul testo intero (condizione 1 del Mobile); le finestre sovrapposte servono perché `scansionaIstruzioni`
 * si ferma a 65.536 caratteri e un'istruzione oltre quel punto passerebbe (cura S6).
 *
 * ⛔ È un filtro, non una garanzia: la difesa vera sono il piano e le protezioni, e le iniezioni disegnate nei pixel qui non si vedono.
 * ⛔ Non ogni elemento nascosto è un sospetto: quasi ogni sito ha un «Salta al contenuto» fuori schermo. Conta cosa dice.
 *
 * Schemi presi da UFO, `ufo/prompter/prompt_sanitizer.py:26-46` (Microsoft, MIT, letto il 02/11/2026), ristretti dove davano falsi allarmi su
 * pagine normali: via «new instructions», «proceed immediately» e `[USER]:`. Versioni italiane nostre.
 */
import { neutralizzaDati, scansionaIstruzioni } from '../kernel/confine-dati.mjs';
import { testoSenzaInvisibili, sosiaInLatino } from './protezioni.mjs';

export const SOSPETTI = Object.freeze({ istruzioni: 'istruzioni-nella-pagina', nascosto: 'testo-nascosto' });

const FINESTRA = 65_536; // il tetto di `scansionaIstruzioni`
const SOVRAPPOSIZIONE = 4_096; // più lunga dello schema più lungo (`hidden_div`, 2.048 caratteri di attributi)
const SCARTO_NOME = 80; // nome accessibile più lungo del testo visibile oltre questa soglia: dice cose che la persona non vede (S7)

// Non sono istruzioni: `bidi_control` compare nei nomi utente delle chat; «you are now a member» è una pagina normale, lo sostituisce lo schema
// più stretto qui sotto.
const NON_CONTANO = new Set(['bidi_control', 'role_hijack']);

const F = String.raw`(?:[\p{L}\p{N}_'’]+\s+){0,8}`;
const SCHEMI = [
  // chi finge una conferma
  String.raw`\buser\s+has\s+(?:already\s+)?(?:confirmed|approved|authori[sz]ed|agreed)\b`,
  String.raw`\bproceed\s+without\s+${F}(?:confirm|approval|asking)`,
  String.raw`\bskip\s+(?:the\s+|all\s+|any\s+)?confirm`,
  String.raw`\bbypass\s+(?:the\s+|all\s+|any\s+)?(?:safety|security|confirm|protection)`,
  String.raw`\b(?:l['’]\s*utente|la\s+persona)\s+ha\s+(?:già\s+)?(?:confermato|approvato|autorizzato)\b`,
  String.raw`\bprocedi\s+(?:subito\s+)?senza\s+(?:chiedere|conferm)`,
  String.raw`\bsalta\s+(?:la\s+|le\s+|ogni\s+|tutte\s+le\s+)?conferm`,
  String.raw`\b(?:aggira|ignora)\s+(?:la\s+|le\s+|ogni\s+|tutte\s+le\s+)?(?:protezion|sicurezz|conferm)`,
  // chi parla da sistema
  String.raw`\[\s*(?:SYSTEM|ASSISTANT|DEVELOPER)\s*(?:UPDATE|OVERRIDE|INSTRUCTION|MESSAGE|PROMPT|NOTE)?\s*(?:\]\s*:|:)`,
  String.raw`\byou\s+are\s+${F}now\s+(?:a|an|the)\s+(?:[\p{L}-]+\s+){0,3}(?:assistant|agent|ai|model|bot)\b`,
  // chi parla all'IA, non alla persona
  String.raw`\bif\s+you\s+are\s+an?\s+(?:ai|llm|language\s+model|assistant|agent|automated)\b`,
  String.raw`\b(?:to|for)\s+(?:any|the|all)\s+(?:ai|llm)\s+(?:agent|assistant|model)s?\s+(?:reading|processing|viewing)\b`,
  String.raw`\bse\s+sei\s+(?:un['’]\s*|un\s+|una\s+)(?:ia\b|intelligenza\s+artificiale|assistente|agente)`,
  String.raw`\ball['’]\s*(?:ia|assistente|agente)\s+che\s+(?:sta\s+)?legg`,
].map((sorgente) => new RegExp(sorgente, 'iu'));

// C8 (revisione PR19): gli invisibili che spezzano le parole a chi legge il testo, non a chi lo guarda, sono gli STESSI delle protezioni
// (Default_Ignorable e Cf, compresi U+FFF9 e U+1D173): prima qui ne stavano cinque. E «Ignоre» con la o cirillica si legge «ignore»:
// la seconda lettura, con le lettere sosia portate in latino, si fa solo se il testo ne contiene.
function cercaIstruzioni(testo) {
  const t = testoSenzaInvisibili(testo);
  if (cercaIn(t)) return true;
  const sosia = sosiaInLatino(t);
  return sosia !== null && cercaIn(sosia);
}

function cercaIn(t) {
  for (let da = 0; ; da += FINESTRA - SOVRAPPOSIZIONE) {
    const pezzo = t.slice(da, da + FINESTRA);
    if (scansionaIstruzioni(pezzo).some((id) => !NON_CONTANO.has(id)) || SCHEMI.some((re) => re.test(pezzo))) return true;
    if (da + FINESTRA >= t.length) return false;
  }
}

const nascosto = (e) => e.visibile === false || (e.rettangolo != null && !(e.rettangolo.w > 0 && e.rettangolo.h > 0));
const testiDi = (e) => [e.nome, e.valore].filter((x) => typeof x === 'string' && x !== '');
// `testoVisibile` lo porta l'ospite quando lo sa (DOM); assente = non si sa, e la regola non si applica.
const nomeDiverso = (e) => typeof e.nome === 'string' && typeof e.testoVisibile === 'string' && e.nome.length - e.testoVisibile.length > SCARTO_NOME;

/**
 * @param {{titolo?: string, testo?: string, elementi?: object[]}} s l'osservazione di `guarda()`
 * @returns {string | null} un codice di `SOSPETTI`, o null
 */
export function rilevaSospetto(s) {
  if (!s || typeof s !== 'object') return null;
  const elementi = (Array.isArray(s.elementi) ? s.elementi : []).filter((e) => e && typeof e === 'object');
  const aVista = [s.titolo, s.testo].filter((x) => typeof x === 'string' && x !== '');
  const dietro = [];
  for (const e of elementi) (nascosto(e) ? dietro : aVista).push(...testiDi(e));

  const fuori = dietro.join('\n');
  if (fuori && cercaIstruzioni(fuori)) return SOSPETTI.nascosto;
  if (elementi.some((e) => !nascosto(e) && nomeDiverso(e))) return SOSPETTI.nascosto;
  const dentro = aVista.join('\n');
  if (neutralizzaDati(`${dentro}\n${fuori}`).conti.tag > 0) return SOSPETTI.nascosto; // caratteri TAG: testo che a schermo non c'è
  return dentro && cercaIstruzioni(dentro) ? SOSPETTI.istruzioni : null;
}
