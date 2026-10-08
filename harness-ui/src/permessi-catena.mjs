/**
 * ⛔⛔⛔ C2-a (07/10/2026, bugfixer) — I PERMESSI DI UNA FIGLIA NON STANNO MAI SOPRA QUELLI DEI SUOI ANTENATI, DAL VIVO.
 *
 * Il difetto (C2-01, misurato su bd9805ab1): la figlia nasce con una COPIA dei permessi del padre
 * (`subagent-orchestrator.mjs`, `permessiRichiesti`/`permessiPerAttrezzoRichiesti`); se il padre poi scende a «Sola lettura»,
 * la figlia viva resta in «Scrive nel progetto», sopra il padre. Contro F-022 dell'owner (01/10/2026): «eredita i permessi
 * del padre, mai di più».
 *
 * La cura ha la stessa forma di D1 «Come Claude» (24/09/2026), che fa già leggere alla figlia il MODO del padre a ogni chiamata
 * di attrezzo (`modalitaOperativaCorrenteFn`): qui il registro dà al kernel i permessi EFFETTIVI della catena, e il kernel li
 * rilegge nello stesso punto. Cambia il cancello, non la lista degli attrezzi né il prompt.
 *
 * Fonti (lette il 07/10/2026):
 * - Hermes Agent, `agent/subagent_lifecycle.py:414-416` (clone del 07/10): rifiuta alla NASCITA un sotto-agente i cui toolset
 *   «would broaden parent permissions» — un controllo all'avvio, non dal vivo;
 * - Claude Code, issue #52557 «Sub-agents can escalate permission mode beyond parent session»: il comportamento atteso è che
 *   il modo effettivo di un sotto-agente non superi quello della sessione madre;
 * - la documentazione di Claude Code sui permessi dei sotto-agenti: un modo del padre come `bypassPermissions` prevale e non si
 *   sovrascrive.
 *
 * ⛔ I LIVELLI SONO UN RETICOLO, NON UNA LINEA (review di «talos desktop», 07/10/2026, letto dai rami di
 *   `verificaPermessoScrittura` in `talosHarness.mjs`):
 *   - `ricerca` ammette SOLO `research_deposit` nella cartella della ricerca;
 *   - `scrittura-area` ammette SOLO `scrivi`/`file_edit` dentro il workspace e nega il deposito;
 *   - `su-richiesta` chiede tutto e non nega niente;
 *   - `scrittura-progetto` fuori dal progetto chiede, dentro scrive;
 *   - `accesso-pieno` è la cima, `lettura` il fondo.
 *   Con «nega < chiedi < consenti», tre coppie non sono confrontabili (ricerca/su-richiesta, ricerca/scrittura-area,
 *   su-richiesta/scrittura-area): la loro intersezione vera («depositare ma chiedendo») non è un livello che esiste, e si
 *   scende al primo livello sicuro sotto, `lettura`.
 * ⛔ Per questo l'incontro è una TABELLA scritta per intero, non un rango numerico: un livello nuovo senza riga cade su
 *   `lettura` (fallisce chiuso), invece di finire in una posizione indovinata.
 */

/** I livelli che il kernel riconosce in `verificaPermessoScrittura`. */
export const LIVELLI_DI_ACCESSO = Object.freeze(['lettura', 'ricerca', 'su-richiesta', 'scrittura-area', 'scrittura-progetto', 'accesso-pieno']);

const L = 'lettura';
const R = 'ricerca';
const S = 'su-richiesta';
const A = 'scrittura-area';
const P = 'scrittura-progetto';
const F = 'accesso-pieno';

/** L'incontro (il più alto livello che sta sotto ENTRAMBI), riga per riga. Simmetrico per costruzione: le prove lo verificano. */
const INCONTRO = Object.freeze({
  [L]: Object.freeze({ [L]: L, [R]: L, [S]: L, [A]: L, [P]: L, [F]: L }),
  [R]: Object.freeze({ [L]: L, [R]: R, [S]: L, [A]: L, [P]: R, [F]: R }),
  [S]: Object.freeze({ [L]: L, [R]: L, [S]: S, [A]: L, [P]: S, [F]: S }),
  [A]: Object.freeze({ [L]: L, [R]: L, [S]: L, [A]: A, [P]: A, [F]: A }),
  [P]: Object.freeze({ [L]: L, [R]: R, [S]: S, [A]: A, [P]: P, [F]: P }),
  [F]: Object.freeze({ [L]: L, [R]: R, [S]: S, [A]: A, [P]: P, [F]: F }),
});

/**
 * L'incontro di due livelli. `undefined` (nessun livello: banco, CLI) è l'identità; una stringa sconosciuta vale `lettura`.
 * @param {string|undefined} a
 * @param {string|undefined} b
 * @returns {string|undefined}
 */
export function incontroLivelli(a, b) {
  if (a === undefined) return b === undefined ? undefined : incontroLivelli(b, b);
  if (b === undefined) return incontroLivelli(a, a);
  return Object.hasOwn(INCONTRO, a) && Object.hasOwn(INCONTRO[a], b) ? INCONTRO[a][b] : L;
}

const SCELTE_PER_ATTREZZO = new Set(['sempre', 'chiedi', 'nega']);

/**
 * ⛔ Che cosa un LIVELLO lascia passare da solo, senza override e senza chiedere: lo stesso esito di `verificaPermessoScrittura`
 * quando risponde `{ consentito: true, via: 'nessun-vincolo' }` su un'azione ordinaria (dentro il progetto, niente segreti,
 * niente contenuto sospetto: quelli chiedono comunque, override o no). TABELLA esplicita, come l'incontro: un livello nuovo
 * senza riga non concede niente. `tests/c2a-permessi-scendono-col-padre.test.mjs` la confronta col cancello VERO, livello
 * per livello e attrezzo per attrezzo: se il cancello cambia, la prova diventa rossa.
 */
const TUTTI = Symbol('tutti');
const CONCESSI_DA_SOLO = Object.freeze({
  [F]: TUTTI,
  [P]: TUTTI,
  [A]: Object.freeze(new Set(['scrivi', 'file_edit'])),
  [R]: Object.freeze(new Set(['research_deposit'])),
  [S]: Object.freeze(new Set()),
  [L]: Object.freeze(new Set()),
});

/** @returns {boolean} se `livello` lascia passare `attrezzo` da solo. `undefined` (nessun livello: banco, CLI) lascia tutto. */
export function livelloConcedeDaSolo(livello, attrezzo) {
  if (livello === undefined) return true;
  if (!Object.hasOwn(CONCESSI_DA_SOLO, livello)) return false;
  const concessi = CONCESSI_DA_SOLO[livello];
  return concessi === TUTTI || concessi.has(attrezzo);
}

const anelloLeggibile = (anello) => ({
  livello: anello?.livello,
  scelte: anello?.scelte && typeof anello.scelte === 'object' && !Array.isArray(anello.scelte) ? anello.scelte : {},
});

/**
 * La vista unita delle scelte per attrezzo lungo la catena — R1 del contratto C2 (review di «talos desktop», 07/10/2026).
 * Ogni anello porta la COPPIA viva (livello, scelte). Per l'attrezzo T:
 * - un `nega` → `nega`;
 * - altrimenti un `chiedi` → `chiedi`;
 * - altrimenti, se qualcuno ha `sempre`: vale SOLO se ogni altro anello ha `sempre` oppure, senza override, ha un livello che
 *   lascia passare T da solo (`livelloConcedeDaSolo`);
 * - altrimenti nessuna scelta (decide l'incontro dei livelli).
 * ⛔ Perché non «sempre solo se in tutti»: la figlia che nasce «Su richiesta», col padre salito poi ad «Accesso pieno», e che
 *   riceve «Per questa sessione» su `shell` dalla carta, perderebbe quel sì a ogni comando — un pulsante che promette e non
 *   mantiene, mentre il padre farebbe la stessa cosa senza chiedere: la figlia non starebbe sopra nessuno.
 * ⛔ Una scelta sconosciuta vale `nega`: un valore che il cancello non sa leggere non apre niente.
 * @param {Array<{livello:string|undefined, scelte:Record<string,string>|null|undefined}>} anelli — la figlia, poi gli antenati
 * @returns {Record<string,string>}
 */
export function unisciPermessiPerAttrezzo(anelli) {
  const leggibili = anelli.map(anelloLeggibile);
  const attrezzi = new Set(leggibili.flatMap((a) => Object.keys(a.scelte)));
  const unito = {};
  for (const attrezzo of attrezzi) {
    const scelte = leggibili.map((a) => (Object.hasOwn(a.scelte, attrezzo) ? (SCELTE_PER_ATTREZZO.has(a.scelte[attrezzo]) ? a.scelte[attrezzo] : 'nega') : undefined));
    if (scelte.includes('nega')) unito[attrezzo] = 'nega';
    else if (scelte.includes('chiedi')) unito[attrezzo] = 'chiedi';
    else if (scelte.includes('sempre')
      && leggibili.every((a, i) => scelte[i] === 'sempre' || (scelte[i] === undefined && livelloConcedeDaSolo(a.livello, attrezzo)))) {
      unito[attrezzo] = 'sempre';
    }
  }
  return unito;
}

/**
 * Se un «sempre» dato alla FIGLIA (il primo anello) per `attrezzo` verrebbe onorato dalla catena. Serve a non mostrare
 * «Per questa sessione» sulla sua carta quando non può mantenere la promessa (F15: un pulsante che non può fare la sua cosa
 * si toglie).
 */
export function sempreValeNellaCatena(anelli, attrezzo) {
  if (anelli.length === 0) return true;
  const [figlia, ...antenati] = anelli.map(anelloLeggibile);
  const conIlSempre = [{ livello: figlia.livello, scelte: { ...figlia.scelte, [attrezzo]: 'sempre' } }, ...antenati];
  return unisciPermessiPerAttrezzo(conIlSempre)[attrezzo] === 'sempre';
}

/**
 * I permessi effettivi di una catena. Le due liste sono SEPARATE apposta: un livello in più (quello con cui il giro è partito)
 * entra solo nell'incontro, non è un anello che «non concede il sempre» — mescolarli faceva sparire ogni `sempre` (misurato
 * dalla premessa di C2A-02, 07/10/2026).
 * @param {{ livelli: Array<string|undefined>, anelli: Array<{livello:string|undefined, scelte:Record<string,string>|null|undefined}> }} catena
 */
export function permessiDellaCatena({ livelli, anelli }) {
  let livelloAccesso;
  for (const livello of livelli) livelloAccesso = incontroLivelli(livelloAccesso, livello);
  return { livelloAccesso, permessiPerAttrezzo: unisciPermessiPerAttrezzo(anelli) };
}
