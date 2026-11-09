/*
 * La LISTA BIANCA del ponte (contratto `CONTRATTO-LISTA-BIANCA-PONTE-2026-10-31.md`, revisione del Mobile al blocco 15): per ogni voce Git, Ricerca e Libreria, i campi che escono, uno per
 *   uno. Un campo non scritto qui non esce, anche se domani il PC lo aggiunge. È la cura di forma dopo tre filtri a lista nera bucati: OWASP API3:2023 chiede di tenere le risposte al minimo
 *   che serve, invece di mandare l'oggetto e toglierne dei pezzi; Happy (`sync/happyAgentGit.ts`) valida con uno schema ogni risposta Git, e chiude la sua lista di chiamate.
 *
 * I tipi dei campi:
 *   D un dato controllato: testo, numero o sì/no, mai un oggetto. Hash, date, nomi di rami e remoti, valori di un elenco chiuso.
 *   P testo della persona, com'è: tornerebbe nel commit riscritto.
 *   R percorso relativo alla cartella della sessione, com'è (D-48: riscriverlo rompe `stage` e `diff`). Un percorso assoluto non è mai R, e non esce.
 *   C contenuto di un file o di un rapporto, com'è: chi lo chiede ha già il consenso.
 *
 * Una forma è `D`/`P`/`R`/`C`, una funzione `(valore, contesto)`, `[riga]` per un elenco, o un oggetto campo → forma. `contesto.bloccato(percorso)` dice se un percorso sta sotto una cartella
 *   bloccata per quel dispositivo.
 */
import { indirizzoPerIlDispositivo, indirizziPerIlDispositivo } from './indirizzo-git.mjs';

export const D = (v) => (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined);
const testoONull = (v) => (v === null || typeof v === 'string' ? v : undefined);
export const P = testoONull;
export const C = testoONull;
export const R = (v) => (typeof v === 'string' && /^(?:[\\/]|[A-Za-z]:[\\/])/u.test(v) ? undefined : testoONull(v));

export function tieni(valore, forma, contesto) {
  if (typeof forma === 'function') return forma(valore, contesto);
  if (valore === null || valore === undefined) return valore === undefined ? undefined : null;
  if (Array.isArray(forma)) return Array.isArray(valore) ? valore.map((v) => tieni(v, forma[0], contesto)).filter((v) => v !== undefined) : [];
  if (typeof valore !== 'object' || Array.isArray(valore)) return undefined;
  const fuori = {};
  for (const campo of Object.keys(forma)) {
    if (!Object.hasOwn(valore, campo)) continue;
    const v = tieni(valore[campo], forma[campo], contesto);
    if (v !== undefined) fuori[campo] = v;
  }
  return fuori;
}

/* D-29: il tetto del filo (1 MiB, `filo.mjs`) conta il JSON: un carattere di controllo pesa 6 byte e una virgolette 2, quindi si misura ciò che viaggia, non UTF-8. Tetto come Happy (`sync/happyAgentGit.ts:9-12`) */
export const TETTO_BYTE = 512 * 1024;
export const TETTO_RIGHE = 20_000;
export const pesoSulFilo = (valore) => Buffer.byteLength(JSON.stringify(valore), 'utf8');

export function righeDentroIlTetto(righe) {
  let byte = 0; let quante = 0;
  for (const riga of righe) {
    byte += pesoSulFilo(riga) + 1;
    if (byte > TETTO_BYTE) break;
    quante += 1;
  }
  return { righe: righe.slice(0, quante), tagliate: quante < righe.length };
}
/* il taglio cade a fine riga: un diff a metà riga, o un carattere spezzato a metà, sembrerebbe un cambiamento che non c'è */
export function testoDentroIlTetto(testo) {
  let righe = 0; let fine = 0; let byte = 0;
  while (fine < testo.length && righe < TETTO_RIGHE) {
    const a = testo.indexOf('\n', fine);
    const prossima = a === -1 ? testo.length : a + 1;
    const peso = pesoSulFilo(testo.slice(fine, prossima)) - 2;
    if (byte + peso > TETTO_BYTE) break;
    byte += peso; fine = prossima; righe += 1;
  }
  return testo.slice(0, fine);
}

/* N12: per un testo senza righe, come un messaggio di commit: il taglio cade dove il filo lo regge, mai a metà di un carattere. Si misura ciò che viaggia, come `testoDentroIlTetto` */
export function testoDentroIByte(testo, tetto = TETTO_BYTE) {
  const peso = (t) => pesoSulFilo(t) - 2;
  if (peso(testo) <= tetto) return testo;
  let dentro = 0; let fuori = testo.length;
  while (fuori - dentro > 1) {
    const meta = Math.floor((dentro + fuori) / 2);
    if (peso(testo.slice(0, meta)) <= tetto) dentro = meta; else fuori = meta;
  }
  const c = testo.charCodeAt(dentro - 1);
  return testo.slice(0, c >= 0xd800 && c <= 0xdbff ? dentro - 1 : dentro);
}

/*
 * B1: un messaggio di commit non ha tetto, e `.status` e `.log` servono alla carta dell'invio: un HEAD da 1,75 MB toglieva `visto.commit`. Il soggetto si legge e basta, quindi si taglia al tetto
 *   di un messaggio del PC (`TETTO_MESSAGGIO_BYTE`, `git-service.mjs`). `ultimoMessaggio` invece torna nel commit riscritto: oltre quel tetto il PC lo rifiuterebbe, e a metà lo accorcerebbe in
 *   silenzio. Non esce, e la persona ne scrive uno nuovo.
 */
const TESTO_DI_COMMIT = 64 * 1024;
const soggettoCorto = (v) => {
  if (typeof v !== 'string' || v.length <= TESTO_DI_COMMIT) return P(v);
  const c = v.charCodeAt(TESTO_DI_COMMIT - 1);
  return v.slice(0, c >= 0xd800 && c <= 0xdbff ? TESTO_DI_COMMIT - 1 : TESTO_DI_COMMIT); // mai un carattere spezzato a metà
};
/* N8: il tetto del PC è in byte (`Buffer.byteLength`, `git-service.mjs`), e 30.000 caratteri CJK ne pesano 90.000. `ultimoMessaggioTroncato` dice perché il testo non c'è (contratto, revisione 4) */
const oltreIlTettoDiCommit = (v) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') > TESTO_DI_COMMIT;
const messaggioDaRiscrivere = (v) => (oltreIlTettoDiCommit(v) ? '' : P(v));
const BASE = { commit: D, breve: D, soggetto: soggettoCorto };
const VOCE_STATO = { percorso: R, da: R, x: D, y: D, tipo: D, staged: D, nonStaged: D, conflitto: D, cartella: D, repoAnnidato: D, aggiunte: D, rimozioni: D };
const RIEPILOGO = { totale: D, staged: D, nonStaged: D, nonTracciati: D, conflitti: D };
const RAMO = { nome: D, commit: D, riferimento: D, corrente: D, principale: D };
const ACCANTONATO = { indice: D, commit: D, data: D, messaggio: P };
const COMMIT = { commit: D, breve: D, autore: D, data: D, genitori: D, padri: [D], soggetto: soggettoCorto, inviato: D };
const FILE_CAMBIATO = { stato: D, prima: R, percorso: R };

/* `voci` dentro il tetto e senza ciò che sta sotto un blocco. `riepilogo` resta quello vero, così il dispositivo può dire «N di M» (D-29) */
function statoPerIlDispositivo(stato, contesto) {
  if (!stato || typeof stato !== 'object' || Array.isArray(stato)) return undefined;
  const tutte = Array.isArray(stato.voci) ? stato.voci : [];
  const bloccato = contesto?.bloccato ?? (() => false);
  const visibili = tutte.filter((v) => !bloccato(v?.percorso) && !(typeof v?.da === 'string' && bloccato(v.da)));
  const { righe, tagliate } = righeDentroIlTetto(tieni(visibili, [VOCE_STATO]));
  return {
    ...tieni(stato, { cartellaEradiceRepo: D, riepilogo: RIEPILOGO, base: BASE, impronta: D, preparatiFuori: D }),
    voci: righe, troncato: stato.troncato === true || tagliate,
    ...(visibili.length < tutte.length ? { bloccati: tutte.length - visibili.length } : {}),
  };
}

/* Nel ponte `urlInvio` è sempre pieno: il PC manda `null` se coincide con `url`, e il dispositivo lo rimanda com'è nel `visto` */
const remotoPerIlDispositivo = (r) => (r && typeof r === 'object' ? {
  nome: D(r.nome) ?? null, url: indirizzoPerIlDispositivo(r.url),
  urlInvio: indirizziPerIlDispositivo(Array.isArray(r.urlsInvio) && r.urlsInvio.length ? r.urlsInvio : [r.urlInvio ?? r.url]),
} : undefined);

const sincronizzazionePerIlDispositivo = (s) => {
  if (!s || typeof s !== 'object') return undefined;
  return {
    ...tieni(s, { ramo: D, staccata: D, riferimento: { corto: D, remoto: D, ramo: D }, avanti: D, indietro: D, riferimentoSparito: D, remotoPerInvio: D, ramoPrincipale: D, suPrincipale: D,
      ultimoRecupero: D, recuperoInCorso: D, destinazione: D }),
    remoti: (Array.isArray(s.remoti) ? s.remoti : []).map(remotoPerIlDispositivo),
    urlInvio: indirizziPerIlDispositivo(s.urlsInvio),
  };
};

/* `.branch-delete` e `.branch-rename` portano `rami`, senza tetto (D-45): gli elenchi si tagliano come `voci` */
const conElenco = (forma, campo, riga, segno = 'troncato') => (dati, contesto) => {
  const fuori = tieni(dati, forma, contesto);
  if (!fuori || !Array.isArray(dati?.[campo])) return fuori;
  const { righe, tagliate } = righeDentroIlTetto(tieni(dati[campo], [riga]));
  return { ...fuori, [campo]: righe, [segno]: dati[segno] === true || tagliate };
};
const forma = (f) => (dati, contesto) => tieni(dati, f, contesto);
const STATO_DI_RITORNO = { stato: statoPerIlDispositivo };
const SYNC_DI_RITORNO = { sincronizzazione: sincronizzazionePerIlDispositivo };

function changesPerIlDispositivo(dati, contesto) {
  const tutti = Array.isArray(dati?.file) ? dati.file : [];
  const bloccato = contesto?.bloccato ?? (() => false);
  const visibili = tutti.filter((f) => !bloccato(f?.percorso) && !(typeof f?.prima === 'string' && bloccato(f.prima)));
  const { righe, tagliate } = righeDentroIlTetto(tieni(visibili, [FILE_CAMBIATO]));
  return { ...tieni(dati, { da: D, a: D, daVuoto: D, fuori: D }), file: righe, altri: dati?.altri === true || tagliate,
    ...(visibili.length < tutti.length ? { bloccati: tutti.length - visibili.length } : {}) };
}
function diffPerIlDispositivo(campi) {
  return (dati, contesto) => {
    const testo = typeof dati?.testo === 'string' ? dati.testo : '';
    const dentro = testoDentroIlTetto(testo);
    return { ...tieni(dati, campi, contesto), testo: dentro, troncato: dati?.troncato === true || dentro.length < testo.length };
  };
}

const elencoDelLog = conElenco({ altri: D, ultimoMessaggio: messaggioDaRiscrivere, testa: D, remoto: D, nomeRemoto: D, baseComune: D }, 'commit', COMMIT, 'altri');

export const FILTRI_GIT = Object.freeze({
  status: statoPerIlDispositivo,
  branch: forma({ ramo: D, staccata: D, cartellaEradiceRepo: D }),
  log: (dati, contesto) => ({ ...elencoDelLog(dati, contesto), ...(oltreIlTettoDiCommit(dati?.ultimoMessaggio) ? { ultimoMessaggioTroncato: true } : {}) }),
  branches: conElenco({}, 'rami', RAMO),
  stashes: conElenco({}, 'accantonati', ACCANTONATO),
  remotes: (dati) => ({ remoti: (Array.isArray(dati?.remoti) ? dati.remoti : []).map(remotoPerIlDispositivo) }),
  sync: sincronizzazionePerIlDispositivo,
  changes: changesPerIlDispositivo,
  diff: diffPerIlDispositivo({ percorso: R, area: D, base: BASE, binario: D, impronta: D }),
  'changes-diff': diffPerIlDispositivo({ percorso: R, prima: R, da: D, a: D, daVuoto: D, binario: D, impronta: D }),
  stage: forma({ ok: D, percorsi: [R], ...STATO_DI_RITORNO }),
  unstage: forma({ ok: D, percorsi: [R], ...STATO_DI_RITORNO }),
  commit: forma({ ok: D, percorsi: [R], commit: D, ...STATO_DI_RITORNO }),
  'commit-staged': forma({ ok: D, commit: D, ...STATO_DI_RITORNO }),
  discard: forma({ ok: D, riportati: [R], eliminati: [R], ...STATO_DI_RITORNO }),
  hunk: forma({ ok: D, ...STATO_DI_RITORNO }),
  stash: conElenco({ ok: D, ...STATO_DI_RITORNO }, 'accantonati', ACCANTONATO),
  'stash-pop': conElenco({ ok: D, ...STATO_DI_RITORNO }, 'accantonati', ACCANTONATO),
  'stash-drop': conElenco({ ok: D }, 'accantonati', ACCANTONATO),
  'commit-message': forma({ messaggio: P, area: D, troncato: D, modello: D }),
  amend: forma({ ok: D, commit: D, ...STATO_DI_RITORNO }),
  'undo-commit': forma({ ok: D, messaggio: P, ...STATO_DI_RITORNO }),
  switch: forma({ ok: D, ramo: D, ...STATO_DI_RITORNO }),
  'branch-create': forma({ ok: D, ramo: D, ...STATO_DI_RITORNO }),
  'branch-rename': conElenco({ ok: D }, 'rami', RAMO),
  'branch-delete': conElenco({ ok: D }, 'rami', RAMO),
  fetch: forma({ ok: D, remoto: D, ...SYNC_DI_RITORNO }),
  pull: forma({ ok: D, conflitti: D, commitPrima: D, commitDopo: D, ...STATO_DI_RITORNO, ...SYNC_DI_RITORNO }),
  push: forma({ ok: D, remoto: D, ramo: D, nienteDaInviare: D, pubblicato: D, ...SYNC_DI_RITORNO }),
  'fetch-stop': forma({ ok: D, fermato: D }),
});

const SPESA = { tokens: D, searches: D, pages: D };
const RIGA_RICERCA = {
  id: D, domanda: P, titolo: P, nome: P, stato: D, avviataAlle: D, conclusaAlle: D, reportLibraryId: D, padreId: D, motivoChiave: D,
  bilancio: { totali: D, sostenute: D, inParte: D, nonSostenute: D, contese: D, nonVerificate: D }, proveDistinte: D, giudice: D, modello: D, modelloGiudice: D, riprendibile: D,
  motivoErrore: { classe: D, transitorio: D },
  avanzamento: { fase: D, frazione: D, passiFatti: D, passiFalliti: D, passiStimati: D, lineeTotali: D, lineeIniziate: D, lineaCorrente: D, fontiLette: D, partiRapporto: D },
};
const soloWeb = (v) => (typeof v === 'string' && /^https?:\/\//iu.test(v) ? v : '');
const CONTENUTO_RICERCA = {
  contenutoRespinto: C, sintesi: C, ultimoMessaggio: C,
  affermazioni: [{ numero: D, testo: C, fonte: D, passaggio: C, ritrovato: D, tratto: { from: D, to: D }, verdetto: D, verdettoUmano: D, motivoVerdetto: C, motivoVerdettoChiave: D, giudice: D,
    giudicataAlle: D, contrarie: [{ sourceIndex: D, url: soloWeb, title: C, passage: C, span: { from: D, to: D }, overlap: D }] }],
  fonti: [{ numero: D, url: soloWeb, titolo: C, pubblicataAlle: D, ottenuta: D }],
  piano: [{ id: D, question: C, estimate: SPESA }],
  passi: [{ id: D, branchId: D, kind: D, state: D, attempts: D, startedAt: D, finishedAt: D, spend: SPESA, errorChiave: D }],
};

/* `motivo` è una frase fissa, tranne quando il suo `detail` è un testo grezzo del PC: allora non esce, e il dispositivo ha `motivoChiave` */
function rigaRicerca(r) {
  if (!r || typeof r !== 'object') return undefined;
  const params = r.motivoParams && typeof r.motivoParams === 'object' ? r.motivoParams : null;
  const grezzo = typeof params?.detail === 'string' && typeof params.detailChiave !== 'string';
  const { detail, ...senza } = params ?? {};
  const motivoParams = tieni(grezzo ? senza : params, { cause: D, causeChiave: D, detail: D, detailChiave: D });
  return { ...tieni(r, RIGA_RICERCA), motivo: grezzo ? null : (D(r.motivo) ?? null), ...(motivoParams && Object.keys(motivoParams).length ? { motivoParams } : {}) };
}
const statoRicerca = (r) => {
  const riga = rigaRicerca(r);
  return riga ? { ...riga, ...tieni(r, { spesa: SPESA, costoAtteso: { branches: D, searches: D, pages: D, tokens: D, minutes: D }, giornale: { eventi: D, righeSaltate: D, stato: D } }) } : undefined;
};
const erroreDiLettura = (dati, codice) => (dati?.errore ? codice : null);

function ricercaConContenuto(r, contesto) {
  const stato = statoRicerca(r);
  if (!stato) return stato;
  if (contesto?.contenuto !== true) {
    return { ...stato, contenutoNegato: contesto?.negato ?? 'consent-required', ...(contesto?.negatoParams ? { contenutoParams: contesto.negatoParams } : {}) };
  }
  const rapporto = typeof r.contenutoRapporto === 'string' ? r.contenutoRapporto : null;
  const dentro = rapporto === null ? null : testoDentroIlTetto(rapporto);
  return { ...stato, ...tieni(r, CONTENUTO_RICERCA), contenutoRapporto: dentro, ...(rapporto !== null && dentro.length < rapporto.length ? { contenutoTroncato: true } : {}) };
}

export const FILTRI_RICERCA = Object.freeze({
  list: (dati) => ({ ricerche: Array.isArray(dati?.ricerche) ? dati.ricerche.map(rigaRicerca) : null, totale: D(dati?.totale) ?? 0, errore: erroreDiLettura(dati, 'RESEARCH_READ_FAILED') }),
  get: (dati, contesto) => ({ ricerca: ricercaConContenuto(dati?.ricerca, contesto) ?? null, errore: erroreDiLettura(dati, 'RESEARCH_READ_FAILED') }),
  azione: (dati) => ({ ricerca: statoRicerca(dati?.ricerca) ?? null, errore: erroreDiLettura(dati, 'RESEARCH_READ_FAILED') }),
  recheck: forma({ riverifica: { id: D, fattaAlle: D, misurabile: D, avvertenzaChiave: D, troncata: D, fontiTotali: D, testiTenuti: D,
    fonti: [{ url: soloWeb, titolo: C, stato: D, sopravvissuto: D, passaggiRitrovati: D, passaggiPersi: D }],
    bilancio: { fonti: D, intatte: D, cambiate: D, irraggiungibili: D, nonMisurabili: D, passaggiCitati: D, passaggiRitrovati: D, passaggiPersi: D } } }),
  delete: forma({ eliminata: D, id: D, titolo: P }),
});

const VOCE_LIBRERIA = { id: D, nome: P, fileType: D, origine: D, aggiornatoIl: D, creatoDa: { tipo: D, modello: D, provider: D }, sessione: { id: D, nome: P } };
/* 01/11/2026 (Mobile, `COD-239`): la riga viva del motore del PC. `modelId` non esce: sul PC può essere un percorso. Il nome è quello da mostrare */
export const FILTRO_CARICAMENTO = forma({ caricamento: { nome: P, fase: D, percentuale: D, motivo: D, altroMotore: D, iniziatoIl: D }, observedAt: D });

export const FILTRI_LIBRERIA = Object.freeze({
  list: (dati) => ({ voci: Array.isArray(dati?.voci) ? tieni(dati.voci, [VOCE_LIBRERIA]) : null, errore: erroreDiLettura(dati, 'LIBRARY_READ_FAILED') }),
  versions: forma({ versioni: [{ n: D, creataIl: D, modello: D, sessionId: D, sessionNome: P, ripristinoDi: D }], totale: D }),
  rename: forma({ id: D, nomePrima: P, nomeDopo: P }),
  restore: forma({ id: D, versione: D, totale: D, nome: P }),
  delete: forma({ eliminato: D, id: D, nome: P }),
});

export const OFFERTA = Object.freeze({ offertaId: D, fileId: D, versione: D, nome: P, dimensione: D, sha256: D });

/* L'anteprima di «annulla»: `fuori` sul PC sono percorsi assoluti, e la scheda ne usa solo il numero (`annulla-file.js:219`): lungo uguale, di stringhe vuote */
export function anteprimaAnnullaPerIlDispositivo(dati) {
  const testo = typeof dati?.diff === 'string' ? dati.diff : null;
  const dentro = testo === null ? null : testoDentroIlTetto(testo);
  return {
    ...tieni(dati, { ok: D, motivo: D, turno: D, commit: D, alle: D, ripristina: [{ stato: D, percorso: R }], salta: [{ stato: D, percorso: R, motivo: D, durante: D }], troppoGrandi: [R] }),
    ...(Array.isArray(dati?.fuori) ? { fuori: dati.fuori.map(() => '') } : {}),
    ...(testo === null ? {} : { diff: dentro, troncato: dati?.troncato === true || dentro.length < testo.length }),
  };
}

/* L'esito di «annulla» e «rifai»: come nell'anteprima `fuori` vale solo per il numero, e `dettaglio` è testo del PC, che non esce */
export function esitoAnnullaPerIlDispositivo(dati) {
  return {
    ...tieni(dati, { ok: D, motivo: D, turno: D, ripristinati: [R], rifatti: [R], nonTolti: [R], saltati: [R], durante: [R] }),
    ...(Array.isArray(dati?.fuori) ? { fuori: dati.fuori.map(() => '') } : {}),
  };
}

/*
 * L'ELENCO CHIUSO dei codici, voce per voce (contratto, §2): il dispositivo sceglie la frase solo da qui, quindi un codice fuori elenco non gli arriva. Le voci non elencate qui sotto
 *   hanno solo i codici comuni.
 */
const PERCORSI = ['GIT_PATH_INVALID', 'GIT_PATHS_REQUIRED'];
const RAMI = ['GIT_BRANCH_INVALID', 'GIT_BRANCH_NOT_FOUND'];
const STAGED = ['GIT_MESSAGE_REQUIRED', 'GIT_STAGED_CHANGED', 'GIT_STAGED_OUTSIDE', 'GIT_CONFLICTS'];
const ULTIMO_COMMIT = ['GIT_CONFLICTS', 'GIT_NOTHING_TO_COMMIT', 'GIT_HEAD_CHANGED', 'GIT_COMMIT_PUSHED'];
const RICERCA = ['RESEARCH_NOT_FOUND', 'RESEARCH_INVALID'];
const LIBRERIA = ['LIBRARY_NOT_FOUND', 'LIBRARY_READ_FAILED', 'LIBRARY_MALFORMED'];
const FILE = ['FILE_GONE', 'FILE_TOO_LARGE'];
const CODICI_GIT = Object.freeze({
  status: ['FOLDER_BLOCKED'], changes: ['FOLDER_BLOCKED', 'GIT_COMMIT_INVALID', 'GIT_COMMIT_UNKNOWN'],
  diff: ['GIT_PATH_INVALID', 'GIT_DIFF_AREA_INVALID', 'GIT_PATH_UNCHANGED'], 'changes-diff': ['GIT_PATH_INVALID', 'GIT_COMMIT_INVALID', 'GIT_COMMIT_UNKNOWN'],
  stage: PERCORSI, unstage: PERCORSI, commit: [...PERCORSI, 'GIT_MESSAGE_REQUIRED', 'GIT_NOTHING_TO_COMMIT', 'GIT_WORKTREE_DIFFERS'],
  'commit-staged': [...STAGED, 'GIT_NOTHING_STAGED'], discard: [...PERCORSI, 'GIT_NOTHING_TO_DISCARD', 'GIT_CONFLICTS', 'GIT_NESTED_REPO'],
  hunk: ['GIT_PATH_INVALID', 'GIT_DIFF_AREA_INVALID', 'GIT_PATH_UNCHANGED', 'GIT_HUNK_INVALID', 'GIT_HUNK_UNSUPPORTED', 'GIT_HUNK_FAILED', 'GIT_DIFF_CHANGED', 'GIT_CONFLICTS'],
  stash: ['GIT_CONFLICTS', 'GIT_NOTHING_TO_STASH'], 'stash-pop': ['GIT_STASH_CHANGED', 'GIT_STASH_OUTSIDE', 'GIT_STASH_CONFLICT'], 'stash-drop': ['GIT_STASH_CHANGED'],
  'commit-message': ['GIT_NOTHING_TO_COMMIT', 'MODEL_CALL_FAILED'], amend: [...STAGED, 'GIT_NOTHING_TO_COMMIT', 'GIT_HEAD_CHANGED', 'GIT_COMMIT_PUSHED'],
  'undo-commit': [...ULTIMO_COMMIT, 'GIT_MERGE_COMMIT', 'GIT_COMMIT_OUTSIDE'], switch: [...RAMI, 'GIT_SWITCH_BLOCKED'], 'branch-create': ['GIT_BRANCH_INVALID', 'GIT_BRANCH_EXISTS'],
  'branch-rename': [...RAMI, 'GIT_BRANCH_EXISTS'], 'branch-delete': [...RAMI, 'GIT_BRANCH_CURRENT', 'GIT_BRANCH_NOT_MERGED'],
  fetch: ['GIT_NO_REMOTE', 'GIT_REMOTE_UNKNOWN', 'GIT_FETCH_RUNNING', 'GIT_ABORTED'],
  pull: ['GIT_CONFLICTS', 'GIT_DETACHED', 'GIT_NO_UPSTREAM', 'GIT_UPSTREAM_GONE', 'GIT_WORKTREE_DIRTY', 'GIT_PULL_FAILED'],
  push: ['GIT_PUSH_CHANGED', 'GIT_DETACHED', 'GIT_NOTHING_TO_COMMIT', 'GIT_NO_REMOTE', 'GIT_REMOTE_MISMATCH', 'GIT_REMOTE_UNKNOWN', 'GIT_REMOTE_REQUIRED', 'GIT_BEHIND', 'GIT_PUSH_REJECTED'],
});
const CODICI_ALTRE = Object.freeze({
  'session.research.list': ['FOLDER_BLOCKED'], 'session.research.get': RICERCA, 'session.research.pause': [...RICERCA, 'RESEARCH_CONFLICT'], 'session.research.resume': [...RICERCA, 'RESEARCH_CONFLICT'],
  'session.research.delete': [...RICERCA, 'RESEARCH_CONFLICT'], 'session.research.recheck': [...RICERCA, 'RESEARCH_RECHECK_UNAVAILABLE'], 'session.research.export': [...RICERCA, 'RESEARCH_CONFLICT', ...FILE],
  'session.library.list': ['FOLDER_BLOCKED'], 'session.library.versions': ['FOLDER_BLOCKED', ...LIBRERIA], 'session.library.rename': [...LIBRERIA, 'LIBRARY_NAME_EMPTY', 'LIBRARY_INVALID'],
  'session.library.restore': [...LIBRERIA, 'LIBRARY_INVALID', 'LIBRARY_TOO_LARGE'], 'session.library.delete': LIBRERIA, 'session.library.fetch': [...LIBRERIA, 'LIBRARY_TOO_LARGE', ...FILE],
  'session.undo.preview': ['SESSION_NOT_READY'], 'session.undo': ['SESSION_NOT_READY'], 'session.undo.redo': ['SESSION_NOT_READY'],
});
const COMUNI = ['BAD_MESSAGE', 'NOT_FOUND', 'UNKNOWN_OPERATION', 'OPERATION_FAILED', 'QUERY_INVALID', 'TOO_LARGE', 'CONSENT_REQUIRED', 'FOLDER_BLOCKED', 'CONFIRMATION_REQUIRED'];
const COMUNI_GIT = ['GIT_STORE_UNAVAILABLE', 'GIT_NOT_A_REPOSITORY', 'GIT_COMMAND_FAILED', 'GIT_TIMEOUT', 'GIT_OUTPUT_TOO_LARGE'];

export function codiciDellaVoce(op) {
  const git = op.startsWith('session.git.');
  return new Set([...COMUNI, ...(git ? [...COMUNI_GIT, ...(CODICI_GIT[op.slice('session.git.'.length)] ?? [])] : (CODICI_ALTRE[op] ?? []))]);
}
const PARAMS_AMMESSI = Object.freeze({ CONSENT_REQUIRED: ['cartellaId', 'nome', 'tipo'], GIT_PUSH_CHANGED: ['ramo', 'remoto', 'urlInvio', 'destinazione', 'commit'] });

/* Al dispositivo codice, stato e parametri controllati, mai `e.message` del PC, ed `explanation` nemmeno, che può contenerlo. Si taglia qui e non in `chiamata-interna.mjs`: la CLI inoltra `error.explanation` alle sue finestre */
export function rifiutoPerIlDispositivo(op, e, statoDi) {
  const noto = typeof e?.code === 'string' && codiciDellaVoce(op).has(e.code);
  const statoVero = statoDi(e);
  const stato = noto || (statoVero >= 400 && statoVero < 500) ? statoVero : 500;
  const params = noto && Object.hasOwn(PARAMS_AMMESSI, e.code) && e.params && typeof e.params === 'object'
    ? Object.fromEntries(PARAMS_AMMESSI[e.code].filter((k) => typeof e.params[k] === 'string').map((k) => [k, e.params[k]])) : null;
  return Object.assign(new Error(stato >= 500 ? 'The computer could not complete this action.' : 'The computer refused this action.'), {
    code: noto ? e.code : 'OPERATION_FAILED', stato,
    ...(typeof e?.reason === 'string' ? { reason: e.reason } : {}),
    /* B8: `paramsControllati`: i valori del contratto sono già nella loro forma, e il filtro generico del servizio li taglierebbe a 200 caratteri e ne riscriverebbe i percorsi: la carta rimostrerebbe un valore falso */
    ...(params && Object.keys(params).length ? { params, paramsControllati: true } : {}),
  });
}
