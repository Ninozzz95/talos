/*
 * ⭐⭐⭐ /goal, fase G1 (owner 14/10/2026: «Sì, parti dal server») — LO STATO DELL'OBIETTIVO, e nient'altro.
 *
 * Un obiettivo è della CONVERSAZIONE: uno solo, scritto sul suo giornale (riga `obiettivo`, l'ultima decide), riletto al riavvio.
 * Qui c'è la sola macchina a stati, pura: niente disco, niente orologio (l'ora arriva da chi chiama), niente ciclo. Il ciclo
 * (G4), il contratto (G2), le prove eseguite dal sistema (G3) si appoggiano qui e portano con sé le loro transizioni.
 *
 * Come lo tengono gli altri, letto nel codice e alla fonte il 12-14/10/2026 (ledger `LEDGER-GOAL-LOOP-ENGINEERING-2026-10-12.md`):
 *   · Codex — `app-server-protocol/src/protocol/v2/thread.rs:799-830`: `ThreadGoal { objective, status, token_budget, tokens_used,
 *     time_used_seconds, created_at, updated_at }`, stati `Active, Paused, Blocked, UsageLimited, BudgetLimited, Complete`; uno per
 *     conversazione, nel DB di stato. Il modello non può RIPRENDERE né mettere «a tetto»: lo fanno persona e sistema (`spec.rs`).
 *   · Hermes — `hermes_cli/goals.py:419` `GoalState` (`status: active | paused | done | cleared`, `paused_reason`), salvato per
 *     sessione (`:635` `load_goal`, `:656` `save_goal`).
 *   · Claude Code — `code.claude.com/docs/en/goal.md` (letta il 14/10/2026): la condizione è al più 4.000 caratteri; una
 *     conversazione ripresa ritrova l'obiettivo.
 * Da loro: uno per conversazione, il tetto dei 4.000 caratteri, la pausa col suo motivo, il «bloccato» distinto dalla pausa.
 * Dove andiamo oltre (proposta approvata il 14/10): dopo un riavvio l'obiettivo che era attivo torna IN PAUSA e lo dice — il
 *   processo che lo portava avanti non c'è più, e ripartire da soli spenderebbe senza che nessuno l'abbia chiesto (stessa regola
 *   della coda dei messaggi, `session-registry.mjs`, «torna IN PAUSA»). Hermes e Claude Code lo ritrovano attivo.
 *
 * ⛔ Gli stati `bloccato`, `tetto` e `fatto` fanno già parte del vocabolario (il 4174 e l'app installata leggono lo STESSO
 *   archivio: un server più vecchio deve capire la riga scritta da uno più nuovo), ma in G1 nessuna porta li scrive: ci si
 *   arriva dal ciclo. Qui sono fissate solo le regole su che cosa si può fare DA lì.
 */

import { contrattoValido } from './contratto.mjs';
import { criteriAlTetto, riepilogoDei, tentativiDopo, tentativiSottoIlContratto, verificaValida } from './verifica.mjs'; // G3

/** Il nome della forma salvata. Una forma diversa non si legge come questa. */
export const SCHEMA_OBIETTIVO = 'talos.obiettivo.v1';

/** Il nome dell'annuncio sul flusso della conversazione: è STATO (com'è adesso), non storia, e non entra nel giornale. */
export const EVENTO_OBIETTIVO = 'talos.obiettivo';

/** Il testo dell'obiettivo, al più (in caratteri, non in unità UTF-16): come la condizione di Claude Code. */
export const TESTO_MASSIMO = 4000;

/** Il dettaglio di un motivo, al più: è una frase per la persona, non un registro. */
export const DETTAGLIO_MASSIMO = 500;

export const STATI_OBIETTIVO = Object.freeze(['attivo', 'in-pausa', 'bloccato', 'tetto', 'fatto']);

/** I motivi di pausa che G1 scrive. Chi legge ne accetta anche altri (una versione più nuova), purché abbiano la forma giusta. */
export const MOTIVI_DI_PAUSA = Object.freeze(['persona', 'riavvio', 'prove-rosse', 'nessun-progresso', 'errore', 'da-giudicare', 'non-verificabile', 'cartella-occupata', 'giudice-guasto', 'fatto-smentito', 'confutatore-guasto', 'bloccato']); // G6: il modello si dichiara bloccato (goal_update, dopo 3 giri) // G3: tre rossi di fila; G4: giri senza progresso, giro fallito, soli giudizi (REV-02), niente si può verificare (REV-04), qualcuno lavora nella cartella da troppo (REV-03)
/** G4: perché un obiettivo è arrivato al tetto (owner 14/10: giri + token, vale il primo). */
export const MOTIVI_DI_TETTO = Object.freeze(['giri', 'token']);
/** G5d (owner 15/10/2026, «tutti i giri»): quanti percorsi scritti si ricordano, i più recenti per primi. */
export const FILE_SCRITTI_MASSIMI = 50;
const PERCORSO_MASSIMO = 1_000;
const percorsoScritto = (p) => typeof p === 'string' && p !== '' && lunghezza(p) <= PERCORSO_MASSIMO;

const FORMA_DEL_TIPO = /^[a-z][a-z0-9-]{0,39}$/u;
const FORMA_DELL_ID = /^ob-[0-9a-f-]{8,64}$/u;

const lunghezza = (testo) => [...testo].length;
const eOra = (valore) => typeof valore === 'string' && valore.length <= 40 && !Number.isNaN(Date.parse(valore));

/**
 * Un rifiuto della macchina: solo il `motivo`, l'identificatore stabile della frase (AIP-193). Il codice e la frase li mette
 * il registro, che è l'unico posto dove un rifiuto prende la forma che arriva a chi chiama.
 * @returns {{ok:false, motivo:string}}
 */
const no = (motivo) => ({ ok: false, motivo });

function motivoValido(motivo) {
  if (motivo === null) return true;
  if (!motivo || typeof motivo !== 'object' || Array.isArray(motivo)) return false;
  if (typeof motivo.tipo !== 'string' || !FORMA_DEL_TIPO.test(motivo.tipo)) return false;
  return !Object.hasOwn(motivo, 'dettaglio') || (typeof motivo.dettaglio === 'string' && lunghezza(motivo.dettaglio) <= DETTAGLIO_MASSIMO);
}

/** Un motivo pulito da ciò che arriva: senza dettaglio vuoto, col dettaglio tagliato al suo tetto. */
function motivoDa(tipo, dettaglio) {
  const frase = typeof dettaglio === 'string' ? [...dettaglio.trim()].slice(0, DETTAGLIO_MASSIMO).join('') : '';
  return frase ? { tipo, dettaglio: frase } : { tipo };
}

/**
 * Se un valore è un obiettivo nella forma di questa versione. ⛔ Stretto sui campi che conosce: una riga a metà o di un'altra
 * forma non diventa «un obiettivo attivo» per approssimazione. I campi in più (una versione più nuova) non la rendono invalida.
 */
export function obiettivoValido(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return false;
  if (valore.schema !== SCHEMA_OBIETTIVO) return false;
  if (typeof valore.id !== 'string' || !FORMA_DELL_ID.test(valore.id)) return false;
  if (typeof valore.testo !== 'string' || valore.testo.trim() === '' || lunghezza(valore.testo) > TESTO_MASSIMO) return false;
  if (!STATI_OBIETTIVO.includes(valore.stato)) return false;
  if (!motivoValido(valore.motivo ?? null)) return false;
  // uno stato «fermo» dice sempre perché; quello attivo non porta un motivo vecchio
  if (valore.stato === 'attivo' && (valore.motivo ?? null) !== null) return false;
  if ((valore.stato === 'in-pausa' || valore.stato === 'bloccato' || valore.stato === 'tetto') && !valore.motivo) return false;
  if (!eOra(valore.creatoAlle) || !eOra(valore.aggiornatoAlle)) return false;
  // G2: il contratto, se c'è, è in forma e la sua impronta torna — un contratto ritoccato sul giornale non rende «attivo» niente
  if (Object.hasOwn(valore, 'contratto') && !contrattoValido(valore.contratto)) return false;
  // G3: l'ultima verifica (esiti e tentativi), se c'è, è in forma
  if (Object.hasOwn(valore, 'verifica') && !verificaValida(valore.verifica)) return false;
  // G4: il conto del ciclo, i comandi approvati dalla persona, i criteri «da guardare» di un fatto
  if (Object.hasOwn(valore, 'ciclo') && !cicloValido(valore.ciclo)) return false;
  if (Object.hasOwn(valore, 'comandiApprovati') && !(Array.isArray(valore.comandiApprovati) && valore.comandiApprovati.every((c) => typeof c === 'string' && c !== ''))) return false;
  if (Object.hasOwn(valore, 'daGuardare') && !(valore.stato === 'fatto' && Number.isSafeInteger(valore.daGuardare) && valore.daGuardare >= 0)) return false;
  // G5: i «fatto» smentiti dal confutatore, e il suo ultimo esito
  if (Object.hasOwn(valore, 'smentite') && !(Number.isSafeInteger(valore.smentite) && valore.smentite >= 0)) return false;
  if (Object.hasOwn(valore, 'confutazione') && !confutazioneValida(valore.confutazione)) return false;
  // G5c: il giudizio del TESTO, solo per un obiettivo senza contratto (il pavimento)
  if (Object.hasOwn(valore, 'giudizioDelTesto') && !(giudizioDelTestoValido(valore.giudizioDelTesto) && !valore.contratto)) return false;
  // G5d: i file scritti nei giri dell'obiettivo, che il giudice rilegge
  if (Object.hasOwn(valore, 'fileScritti') && !(Array.isArray(valore.fileScritti) && valore.fileScritti.length <= FILE_SCRITTI_MASSIMI && valore.fileScritti.every(percorsoScritto))) return false;
  // G6-REV-03: i giri del ciclo all'ultima ripresa della persona (da lì riparte il conto per «bloccato»)
  if (Object.hasOwn(valore, 'giriAllaRipresa') && !(Number.isSafeInteger(valore.giriAllaRipresa) && valore.giriAllaRipresa >= 0)) return false;
  return Number.isSafeInteger(valore.revisione) && valore.revisione >= 1;
}

/**
 * Il testo di un obiettivo, pulito ai bordi, se può esserlo: non vuoto, entro `TESTO_MASSIMO` caratteri. Una regola sola per chi
 * imposta l'obiettivo e per chi ne fa proporre i criteri (G2c): un testo che non potrà diventare un obiettivo non si manda a un
 * modello.
 * @returns {{ok:true, testo:string}|{ok:false, motivo:string}}
 */
export function testoObiettivo(testo) {
  if (typeof testo !== 'string' || testo.trim() === '') return no('goal-text-empty');
  const pulito = testo.trim();
  return lunghezza(pulito) > TESTO_MASSIMO ? no('goal-text-too-long') : { ok: true, testo: pulito };
}

/**
 * Un obiettivo NUOVO, attivo. Un testo diverso è un obiettivo diverso: nasce con un `id` suo e la revisione 1.
 * @param {{ testo: unknown, id: string, adesso: string, contratto?: object }} dati `id` e `adesso` li dà chi chiama (la
 *   macchina non ha orologio); `contratto` (G2) è già in forma: lo costruisce `nuovoContratto`
 * @returns {{ok:true, obiettivo:object}|{ok:false, motivo:string}}
 */
export function nuovoObiettivo({ testo, id, adesso, contratto, dallaPersona = true }) {
  const letto = testoObiettivo(testo);
  if (!letto.ok) return letto;
  const pulito = letto.testo;
  const obiettivo = { schema: SCHEMA_OBIETTIVO, id, testo: pulito, stato: 'attivo', motivo: null, creatoAlle: adesso, aggiornatoAlle: adesso, revisione: 1,
    ...(contratto === undefined ? {} : { contratto, comandiApprovati: comandiApprovatiPer(contratto, { dallaPersona }) }) };
  if (!obiettivoValido(obiettivo)) throw new TypeError('nuovoObiettivo: id, ora o contratto non validi');
  return { ok: true, obiettivo };
}

const passa = (obiettivo, cambio, adesso) => ({ ...obiettivo, ...cambio, aggiornatoAlle: adesso, revisione: obiettivo.revisione + 1 });

const interoNonNegativo = (v) => Number.isSafeInteger(v) && v >= 0;
function cicloValido(ciclo) {
  return Boolean(ciclo) && typeof ciclo === 'object' && !Array.isArray(ciclo)
    && interoNonNegativo(ciclo.giri) && interoNonNegativo(ciclo.token) && interoNonNegativo(ciclo.senzaProgresso);
}
/* G4 (owner 14/10: «il sì al contratto li approva»): i comandi di un contratto confermato DALLA PERSONA sono approvati per
   questo obiettivo, e la verifica li esegue senza chiedere di nuovo. Un contratto cambiato da altri (il modello, G6) tiene
   approvati solo i comandi che la persona aveva già approvato e che ci sono ancora. */
const comandiDel = (contratto) => [...new Set((contratto?.criteri ?? []).filter((c) => c.verifica?.tipo === 'comando').map((c) => c.verifica.comando))];
function comandiApprovatiPer(contratto, { dallaPersona, prima = [] }) {
  const comandi = comandiDel(contratto);
  return dallaPersona ? comandi : comandi.filter((c) => prima.includes(c));
}

/**
 * La persona (o il sistema, col suo motivo) mette in pausa. Solo un obiettivo attivo si mette in pausa; uno già in pausa resta
 * com'è e lo dice (`invariato`): due finestre che premono Pausa non scrivono due righe né cambiano il motivo della prima.
 * @returns {{ok:true, obiettivo:object, invariato?:true}|{ok:false, motivo:string}}
 */
export function mettiInPausa(obiettivo, { tipo = 'persona', dettaglio, adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (!FORMA_DEL_TIPO.test(String(tipo))) throw new TypeError('mettiInPausa: tipo del motivo non valido');
  if (obiettivo.stato === 'in-pausa') return { ok: true, obiettivo, invariato: true };
  if (obiettivo.stato !== 'attivo') return no('goal-not-active');
  return { ok: true, obiettivo: passa(obiettivo, { stato: 'in-pausa', motivo: motivoDa(tipo, dettaglio) }, adesso) };
}

/**
 * Riprendere è un gesto della PERSONA: da in pausa o da bloccato l'obiettivo torna attivo e il motivo si toglie.
 * ⛔ Da «tetto» no: riprendere senza alzare il tetto lo rifermerebbe al giro dopo (il gesto arriva col ciclo, G4, e dice la
 *   cifra prima). Da «fatto» no: è finito, se ne imposta un altro.
 * @returns {{ok:true, obiettivo:object, invariato?:true}|{ok:false, motivo:string}}
 */
export function riprendi(obiettivo, { adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato === 'attivo') return { ok: true, obiettivo, invariato: true };
  if (obiettivo.stato === 'tetto') return no('goal-cap-reached');
  if (obiettivo.stato === 'fatto') return no('goal-already-done');
  /* G3: riprendere dopo la pausa per i rossi ridà i tentativi da capo (come Hermes: la pausa per `max_retries` la toglie la
     persona, e il conto ricomincia). Senza, il primo rosso dopo la ripresa rimetterebbe subito in pausa. */
  const verifica = obiettivo.motivo?.tipo === 'prove-rosse' && obiettivo.verifica ? { verifica: { ...obiettivo.verifica, tentativi: {} } } : {};
  // G4: lo stesso per i giri senza progresso — la persona che riprende dà al ciclo altri tre giri per muoversi
  const ciclo = obiettivo.motivo?.tipo === 'nessun-progresso' && obiettivo.ciclo ? { ciclo: { ...obiettivo.ciclo, senzaProgresso: 0 } } : {};
  /* G6-REV-03 (owner 15/10/2026, «come Codex»): dopo una ripresa i giri per «bloccato» si contano da qui — `codex-rs/ext/goal/src/
     spec.rs:66`, «After a previously blocked goal is resumed, the resumed run starts a fresh blocked audit» (e `:78`) */
  // (senza giri ancora fatti il conto parte già da zero: il campo non serve, e un obiettivo senza ciclo resta com'era)
  const giriAllaRipresa = Number.isSafeInteger(obiettivo.ciclo?.giri) && obiettivo.ciclo.giri > 0 ? { giriAllaRipresa: obiettivo.ciclo.giri } : {};
  return { ok: true, obiettivo: passa(obiettivo, { stato: 'attivo', motivo: null, ...verifica, ...ciclo, ...giriAllaRipresa }, adesso) };
}

/**
 * G2 — l'obiettivo col contratto dato (già in forma). Lo stesso contratto di prima non cambia niente (`invariato`).
 * ⛔ Non su un obiettivo «fatto»: ciò che è stato dichiarato fatto lo è stato CON quel contratto; per altri criteri se ne
 *   imposta uno nuovo. ⛔ Qui non si decide se il cambio è libero o vuole la persona: lo dice `confrontaContratti`, e lo
 *   fa rispettare chi chiama.
 * @returns {{ok:true, obiettivo:object, invariato?:true}|{ok:false, motivo:string}}
 */
export function conContratto(obiettivo, contratto, { adesso, dallaPersona = true }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato === 'fatto') return no('goal-already-done');
  if (!contrattoValido(contratto)) throw new TypeError('conContratto: contratto non valido');
  if (obiettivo.contratto?.impronta === contratto.impronta) return { ok: true, obiettivo, invariato: true };
  /* G3: gli esiti erano del contratto di prima e non valgono più; i tentativi restano SOLO per le prove rimaste identiche —
     aggiungere un criterio (che è libero) non deve azzerare il conto dei rossi degli altri. */
  /* PAV-REV-01 (bugfixer, 15/10/2026): anche il giudizio del TESTO era del pavimento, e con un contratto non vale più (né è ammesso) */
  /* riserva S5 del bugfixer (15/10/2026): passando dal pavimento al PRIMO contratto anche le smentite ripartono — erano su un
     «fatto» giudicato sul testo, non su questi criteri. ⛔ Solo al primo: un contratto cambiato (anche solo un criterio in più,
     che è libero) non azzera il conto, o basterebbe aggiungere un criterio per sfuggire al confutatore. */
  const primoContratto = !obiettivo.contratto;
  const { verifica: _vecchia, giudizioDelTesto: _delTesto, ...conSmentite } = obiettivo;
  const { smentite: _smentite, confutazione: _confutazione, ...senzaSmentite } = conSmentite;
  const senza = primoContratto ? senzaSmentite : conSmentite;
  const tentativi = tentativiSottoIlContratto(obiettivo.verifica?.tentativi, contratto);
  const comandiApprovati = comandiApprovatiPer(contratto, { dallaPersona, prima: obiettivo.comandiApprovati ?? [] });
  return { ok: true, obiettivo: passa(senza, { contratto, comandiApprovati, ...(Object.keys(tentativi).length ? { verifica: { tentativi } } : {}) }, adesso) };
}

/**
 * G4 — un giro dell'obiettivo è finito: il conto del ciclo (giri, token, giri senza progresso; `contoDopoIlGiro` in `ciclo.mjs`).
 * Solo su un obiettivo che non è «fatto».
 * @returns {{ok:true, obiettivo:object}|{ok:false, motivo:string}}
 */
export function conCiclo(obiettivo, ciclo, { adesso, scritti = [] }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato === 'fatto') return no('goal-already-done');
  if (!cicloValido(ciclo)) throw new TypeError('conCiclo: conto del ciclo non valido');
  /* G5d (owner 15/10/2026, «tutti i giri»): i file scritti nel giro si aggiungono a quelli dei giri prima, i più recenti per
     primi. Il giudice li rilegge con l'impronta di ADESSO: il codice scritto al giro 2 resta una prova anche se al giro 3 l'agente
     ha solo eseguito le prove (Codex tiene il diff dell'intero compito, non dell'ultimo turno). */
  const fileScritti = [...new Set([...(Array.isArray(scritti) ? scritti : []).filter(percorsoScritto), ...(obiettivo.fileScritti ?? [])])].slice(0, FILE_SCRITTI_MASSIMI);
  return { ok: true, obiettivo: passa(obiettivo, { ciclo, ...(fileScritti.length ? { fileScritti } : {}) }, adesso) };
}

/**
 * G4 — l'obiettivo è FATTO: tutte le prove verdi (owner 14/10). `daGuardare` = i criteri a giudizio che nessuno ha ancora
 * giudicato (la G5 porterà il giudice): «fatto con N da guardare», detto. Solo da attivo.
 */
export function aFatto(obiettivo, { daGuardare = 0, adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato === 'fatto') return { ok: true, obiettivo, invariato: true };
  if (obiettivo.stato !== 'attivo') return no('goal-not-active');
  if (!interoNonNegativo(daGuardare)) throw new TypeError('aFatto: daGuardare non valido');
  return { ok: true, obiettivo: passa(obiettivo, { stato: 'fatto', motivo: null, daGuardare }, adesso) };
}

/** G4 — l'obiettivo è arrivato al suo tetto (`giri` o `token`). Solo da attivo. Riprendere da qui vuole un tetto più alto. */
export function aTetto(obiettivo, { tipo, adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (!MOTIVI_DI_TETTO.includes(tipo)) throw new TypeError('aTetto: tipo non valido');
  if (obiettivo.stato === 'tetto') return { ok: true, obiettivo, invariato: true };
  if (obiettivo.stato !== 'attivo') return no('goal-not-active');
  return { ok: true, obiettivo: passa(obiettivo, { stato: 'tetto', motivo: { tipo } }, adesso) };
}

/**
 * G3 — l'obiettivo con l'esito di una verifica del SUO contratto (`verificaContratto` in `verifica.mjs`).
 * ⛔ Una verifica fatta su un contratto che nel frattempo è cambiato non si registra (`goal-contract-changed`): i suoi esiti
 *   parlano di prove che non ci sono più. ⛔ Non su un obiettivo «fatto».
 * Un obiettivo ATTIVO con un criterio arrivato a `TENTATIVI_MASSIMI` rossi di fila va in pausa col motivo `prove-rosse`, e il
 * dettaglio nomina i criteri (`c2, c5`). Uno già fermo registra gli esiti e resta com'è.
 * @param {{ contratto:string, verdetti:object[], riepilogo:object }} esito
 * @returns {{ok:true, obiettivo:object, criteriAlTetto:string[]}|{ok:false, motivo:string}}
 */
export function conVerifica(obiettivo, esito, { adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato === 'fatto') return no('goal-already-done');
  if (!obiettivo.contratto) return no('goal-no-contract');
  if (esito?.contratto !== obiettivo.contratto.impronta) return no('goal-contract-changed');
  const tentativi = tentativiDopo(obiettivo.verifica?.tentativi, obiettivo.contratto, esito.verdetti);
  const verifica = { contratto: esito.contratto, alle: adesso, verdetti: esito.verdetti, riepilogo: esito.riepilogo, tentativi };
  const alTetto = criteriAlTetto(obiettivo.contratto, tentativi);
  const pausa = obiettivo.stato === 'attivo' && alTetto.length > 0 ? { stato: 'in-pausa', motivo: motivoDa('prove-rosse', alTetto.join(', ')) } : {};
  const nuovo = passa(obiettivo, { verifica, ...pausa }, adesso);
  if (!obiettivoValido(nuovo)) throw new TypeError('conVerifica: esito della verifica non valido');
  return { ok: true, obiettivo: nuovo, criteriAlTetto: alTetto };
}

/**
 * G5 — l'obiettivo con il GIUDIZIO dei criteri a giudizio dell'ultima verifica (`giudizioDallaRisposta` in `giudice.mjs`, già
 * controllato sulle impronte). Ogni verdetto «da giudicare» giudicato diventa verde, rosso o non verificabile; il rosso del giudice
 * conta nei tentativi come quello di un comando (tre di fila ⇒ pausa `prove-rosse`, la stessa regola di `conVerifica`), il verde li
 * azzera. ⛔ Solo sulla verifica a cui il giudizio si riferisce (`alle`): una verifica più nuova non si ritocca con un giudizio vecchio.
 * @param {{ alle: string, verdetti: {id:string, esito:'verde'|'rosso'|'non-giudicabile', motivo:string, prove?:object[]}[] }} giudizio
 * @returns {{ok:true, obiettivo:object, criteriAlTetto:string[]}|{ok:false, motivo:string}}
 */
const CODICI_DEL_GIUDICE = Object.freeze(['judge-skipped', 'judge-verdict-invalid', 'no-evidence', 'evidence-stale']);
export function conGiudizio(obiettivo, giudizio, { adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato === 'fatto') return no('goal-already-done');
  if (!obiettivo.contratto || !Array.isArray(obiettivo.verifica?.verdetti)) return no('goal-no-check');
  if (obiettivo.verifica.alle !== giudizio?.alle) return no('goal-check-changed');
  const perId = new Map((giudizio.verdetti ?? []).map((g) => [g.id, g]));
  const giudicati = [];
  const verdetti = obiettivo.verifica.verdetti.map((v) => {
    const g = v.esito === 'da-giudicare' ? perId.get(v.id) : null;
    if (!g) return v;
    // un «non giudicabile» di TALOS porta un codice (no-evidence, evidence-stale, …); il motivo del giudice resta testo
    const codice = g.esito === 'non-giudicabile' && CODICI_DEL_GIUDICE.includes(g.motivo) ? g.motivo : null;
    const esito = g.esito === 'verde' ? 'verde' : g.esito === 'rosso' ? 'rosso' : 'non-verificabile';
    const nuovo = {
      ...v, esito,
      ...(esito === 'verde' ? {} : { motivo: { tipo: esito === 'rosso' ? 'judge-not-met' : (codice ?? 'judge-undecided') } }),
      giudizio: { motivo: codice ? '' : String(g.motivo ?? '').slice(0, 1_000), ...(Array.isArray(g.prove) ? { prove: g.prove } : {}) },
    };
    if (esito === 'verde') delete nuovo.motivo;
    giudicati.push(nuovo);
    return nuovo;
  });
  const tentativi = tentativiDopo(obiettivo.verifica.tentativi, obiettivo.contratto, giudicati);
  const verifica = { ...obiettivo.verifica, verdetti, riepilogo: riepilogoDei(verdetti), tentativi };
  const alTetto = criteriAlTetto(obiettivo.contratto, tentativi);
  const pausa = obiettivo.stato === 'attivo' && alTetto.length > 0 ? { stato: 'in-pausa', motivo: motivoDa('prove-rosse', alTetto.join(', ')) } : {};
  const nuovo = passa(obiettivo, { verifica, ...pausa }, adesso);
  if (!obiettivoValido(nuovo)) throw new TypeError('conGiudizio: giudizio non valido');
  return { ok: true, obiettivo: nuovo, criteriAlTetto: alTetto };
}

const ESITI_DEL_GIUDIZIO_DEL_TESTO = Object.freeze(['verde', 'rosso', 'non-verificabile']);
function giudizioDelTestoValido(g) {
  return Boolean(g) && typeof g === 'object' && !Array.isArray(g) && ESITI_DEL_GIUDIZIO_DEL_TESTO.includes(g.esito)
    && typeof g.motivo === 'string' && eOra(g.alle) && (g.prove === undefined || Array.isArray(g.prove));
}

/**
 * G5c — il giudizio del TESTO di un obiettivo senza contratto (il PAVIMENTO, G2c: «mai un contratto finto»). Il giudice lo valuta sul
 * testo intero, come Claude Code e Hermes fanno per ogni obiettivo; qui il verdetto ha già passato il controllo delle impronte.
 * Solo da attivo e solo senza contratto: con un contratto i criteri hanno i loro verdetti (`conGiudizio`).
 * @param {{ esito:'verde'|'rosso'|'non-giudicabile', motivo:string, prove?:object[] }} verdetto
 */
export function conGiudizioDelTesto(obiettivo, verdetto, { adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato !== 'attivo') return no('goal-not-active');
  if (obiettivo.contratto) return no('goal-has-contract');
  const esito = verdetto?.esito === 'verde' ? 'verde' : verdetto?.esito === 'rosso' ? 'rosso' : 'non-verificabile';
  const giudizioDelTesto = { esito, motivo: String(verdetto?.motivo ?? '').slice(0, 1_000), alle: adesso,
    ...(Array.isArray(verdetto?.prove) ? { prove: verdetto.prove } : {}) };
  const nuovo = passa(obiettivo, { giudizioDelTesto }, adesso);
  if (!obiettivoValido(nuovo)) throw new TypeError('conGiudizioDelTesto: giudizio non valido');
  return { ok: true, obiettivo: nuovo };
}

const ESITI_DEL_CONFUTATORE = Object.freeze(['regge', 'smentito', 'senza-esito']);
function confutazioneValida(c) {
  return Boolean(c) && typeof c === 'object' && !Array.isArray(c) && ESITI_DEL_CONFUTATORE.includes(c.esito)
    && typeof c.motivo === 'string' && eOra(c.alle) && (c.prove === undefined || Array.isArray(c.prove));
}

/**
 * G5 — l'esito del CONFUTATORE sul «fatto» che il ciclo stava per dire (owner 15/10/2026: prima di ogni «fatto»). Solo da attivo.
 *   · `regge` ⇒ l'obiettivo è FATTO (coi `daGuardare` di chi chiama);
 *   · `smentito` ⇒ resta attivo, una smentita in più; alla `SMENTITE_MASSIME`-esima ⇒ pausa `fatto-smentito` (dsh-goalloop
 *     `falseCompleteRule`: due «fatto» falsi e decide la persona);
 *   · `senza-esito` ⇒ pausa `confutatore-guasto`: un verificatore che non arriva a un esito non dice mai «fatto».
 * @param {{ esito:'regge'|'smentito'|'senza-esito', motivo:string, prove?:object[] }} confutazione
 */
export function conConfutazione(obiettivo, confutazione, { daGuardare = 0, smentiteMassime, adesso }) {
  if (!obiettivo) return no('goal-not-set');
  if (obiettivo.stato !== 'attivo') return no('goal-not-active');
  if (!Number.isSafeInteger(smentiteMassime) || smentiteMassime < 1) throw new TypeError('conConfutazione: smentiteMassime non valido');
  const registrata = { esito: confutazione?.esito, motivo: String(confutazione?.motivo ?? '').slice(0, 2_000), alle: adesso,
    ...(Array.isArray(confutazione?.prove) ? { prove: confutazione.prove } : {}) };
  if (!confutazioneValida(registrata)) throw new TypeError('conConfutazione: esito non valido');
  if (registrata.esito === 'regge') {
    const nuovo = passa(obiettivo, { stato: 'fatto', motivo: null, daGuardare, confutazione: registrata }, adesso);
    if (!obiettivoValido(nuovo)) throw new TypeError('conConfutazione: obiettivo non valido');
    return { ok: true, obiettivo: nuovo };
  }
  if (registrata.esito === 'senza-esito') {
    return { ok: true, obiettivo: passa(obiettivo, { stato: 'in-pausa', motivo: motivoDa('confutatore-guasto'), confutazione: registrata }, adesso) };
  }
  const smentite = (Number.isSafeInteger(obiettivo.smentite) ? obiettivo.smentite : 0) + 1;
  const pausa = smentite >= smentiteMassime ? { stato: 'in-pausa', motivo: motivoDa('fatto-smentito', String(smentite)) } : {};
  return { ok: true, obiettivo: passa(obiettivo, { smentite, confutazione: registrata, ...pausa }, adesso) };
}

/**
 * Che cosa diventa un obiettivo riletto dal giornale dopo che il processo è ripartito: quello ATTIVO torna in pausa col motivo
 * `riavvio`, ogni altro resta com'è. ⛔ Non si scrive sul giornale (all'avvio un altro processo può starlo scrivendo): è la
 * lettura a derivarlo, uguale a ogni riavvio; la riga nuova la scrive il primo gesto della persona.
 */
export function alRipristino(obiettivo, { adesso }) {
  if (!obiettivo || obiettivo.stato !== 'attivo') return obiettivo ?? null;
  return passa(obiettivo, { stato: 'in-pausa', motivo: { tipo: 'riavvio' } }, adesso);
}

/** La riga del giornale. `null` è un fatto come gli altri: «l'obiettivo è stato tolto». */
export function rigaObiettivo(obiettivo) {
  if (obiettivo !== null && !obiettivoValido(obiettivo)) throw new TypeError('rigaObiettivo: obiettivo non valido');
  return { tipo: 'obiettivo', obiettivo };
}

/**
 * L'obiettivo com'è sul giornale: decide l'ULTIMA riga `obiettivo`.
 * ⛔ Se l'ultima non si legge (a metà, di un'altra forma) NON si ripiega su una più vecchia: un obiettivo tolto o sostituito
 *   tornerebbe in vita. Non c'è un obiettivo, e chi chiama lo sa (`illeggibile`).
 * @param {Array<object>} record le righe del giornale, in ordine
 * @returns {{ obiettivo: object|null, illeggibile: boolean }}
 */
export function obiettivoDalGiornale(record) {
  const ultima = (Array.isArray(record) ? record : []).filter((riga) => riga?.tipo === 'obiettivo').at(-1);
  if (!ultima) return { obiettivo: null, illeggibile: false };
  if (ultima.obiettivo === null) return { obiettivo: null, illeggibile: false };
  if (!obiettivoValido(ultima.obiettivo)) return { obiettivo: null, illeggibile: true };
  /* Una COPIA intera, coi campi che questa versione non conosce: le transizioni li portano avanti (`...obiettivo`), così un
     server più vecchio che mette in pausa non cancella ciò che uno più nuovo aveva scritto accanto (il 4174 e l'app installata
     leggono lo stesso archivio). */
  return { obiettivo: { ...structuredClone(ultima.obiettivo), motivo: ultima.obiettivo.motivo ?? null }, illeggibile: false };
}
