// Catalogo v2 dell'interfaccia generativa: 11 tipi, schemi, limiti, validazione e ripiego testuale (v1 02/11/2026; v2 05/11/2026,
// scene 7 e 9 / FE-082: `cursore`, `metriche`, `confronto`, `diagramma`, aggiunti DOPO i 7 del v1 senza toccarne uno; la prova è
// UIG-9.2 in `tests/blocchi-catalogo.test.mjs`, la fotografia del v1 in `tests/fixtures/blocchi/v1-caratterizzazione.json`).
//
// Forma approvata da Mobile, CLI e Performance: Downloads/TALOS/frontend/in-corso/FORMA-CODICE-UI-GENERATIVA-2026-11-02.md \§2.
// Lo schema segue l'idea della LibrarySpec di OpenUI Lang 1.0 (spec/prompt.md \§2.3, clone openui-2026-10-30): l'ordine dei
// campi di un tipo È l'ordine degli argomenti posizionali; `null` salta un argomento facoltativo. Nessun codice di OpenUI.
//
// Puro e senza dipendenze (niente DOM, globali o API del browser): lo leggono anche la CLI e, copiato al pin, il telefono.
// ⛔ I nomi dei tipi e dei campi sono quelli che riceve il modello: non si traducono a schermo da qui.

import { calcola, leggiFormula } from './formula.mjs';
import { testoDelModello } from './testo-del-modello.mjs';

export const VERSIONE_DEL_CATALOGO = 2;
export const LINGUA_DEL_RECINTO = 'talos-blocco';
export const TIPI = Object.freeze(['tabella', 'grafico', 'scelte', 'modulo', 'chiave-valore', 'passi', 'avviso', 'cursore', 'metriche', 'confronto', 'diagramma']);
// Tipi che chiedono un gesto della persona: mai in un blocco nato da dati esterni (decisione dell'owner del 31/10). Il `cursore` ci sta
// dal v2 (ledger G-C): il conto lo fa la pagina, ma il gesto è della persona e la formula viene dal modello.
export const TIPI_INTERATTIVI = Object.freeze(['scelte', 'modulo', 'cursore']);

export const CODICI_DEL_ROTTO = Object.freeze([
  'sintassi',
  'espressioneNonAmmessa',
  'tipoSconosciuto',
  'campoFuoriSchema',
  'campoMancante',
  'valoreNonValido',
  'oltreIlLimite',
  'interazioneDaFonteEsterna',
  'fonteNonValida',
  'nessunaRadice',
  'riferimentoMancante',
  'riferimentoCircolare',
  'bloccoIncompleto',
  'troppoAnnidato',
  'troppoGrande',
  'pezzoNonValido',
  'erroreInterno',
]);

// Tetto di struttura (oltre: rotto, mai uno stack esaurito). Un tetto di nodi non serve: profondità e liste dello schema
// sono a tetto, quindi anche coi riferimenti ripetuti l'albero più grande è 500 righe × 12 celle (prova nel lettore).
export const PROFONDITA_MASSIMA = 24;

// ---- Mattoni degli schemi ----

const congela = (o) => Object.freeze(o);
const testo = (massimo, righe = 'una') => congela({ t: 'testo', massimo, righe });
const NUMERO = congela({ t: 'numero' });
const LOGICO = congela({ t: 'logico' });
const scelta = (...valori) => congela({ t: 'scelta', valori: congela(valori) });
const lista = (di, massimo, minimo = 0) => congela({ t: 'lista', di, massimo, minimo });
const campo = (nome, schema, obbligatorio = true) => congela({ nome, schema, obbligatorio });
const oggetto = (...campi) => congela({ t: 'oggetto', campi: congela(campi) });
const TESTO_O_NUMERO = congela({ t: 'testo-o-numero', massimo: 200 });
const CELLA = congela({ t: 'cella', massimo: 200 });

const ID = testo(64);
const TITOLO = testo(120);
const ETICHETTA = testo(120);

export const SCHEMA_FONTE = oggetto(
  campo('tipo', scelta('file', 'attrezzo', 'pagina')),
  campo('nome', testo(200)),
  campo('quando', testo(64), false),
);

const OPZIONE = (massimo) => oggetto(campo('testo', testo(massimo)));

const comuniPrima = [campo('id', ID), campo('titolo', TITOLO, false)];
const comuniDopo = [campo('fonte', SCHEMA_FONTE, false)];

function voce(componente, limiti, propri, controllo) {
  return congela({
    componente,
    limiti: congela(limiti),
    argomenti: congela([...comuniPrima, ...propri, ...comuniDopo]),
    controllo,
  });
}

const LIMITI = {
  tabella: { colonne: 12, righe: 500, cella: 200 },
  grafico: { serie: 6, punti: 60, fette: 8 },
  scelte: { opzioni: 6, testo: 80 },
  modulo: { campi: 8 },
  'chiave-valore': { righe: 20 },
  passi: { voci: 30 },
  avviso: { testo: 400 },
  // v2 (ledger G-C, UIG-9.1): metriche 2-6 numeri, confronto 2-4 colonne, diagramma ≤ 12 nodi e ≤ 16 frecce, cursore min < max,
  // passo > 0 (al più 1000 passi sulla pista: oltre, la tastiera non ci arriva) e una formula sola, ≤ 200 caratteri.
  cursore: { colonne: 6, righe: 12, formula: 200, passi: 1000 },
  metriche: { voci: 6, minimo: 2 },
  confronto: { colonne: 4, minimo: 2, voci: 8 },
  diagramma: { nodi: 12, frecce: 16 },
};

const FORMATO = scelta('numero', 'soldi');

export const CATALOGO = congela({
  tabella: voce('Tabella', LIMITI.tabella, [
    campo('colonne', lista(oggetto(
      campo('id', ID),
      campo('titolo', TITOLO),
      campo('tipo', scelta('testo', 'numero', 'data', 'soldi')),
    ), LIMITI.tabella.colonne, 1)),
    campo('righe', lista(lista(CELLA, LIMITI.tabella.colonne), LIMITI.tabella.righe)),
    campo('ordinabile', LOGICO, false),
    campo('filtrabile', LOGICO, false),
  ], controllaTabella),
  grafico: voce('Grafico', LIMITI.grafico, [
    campo('forma', scelta('barre', 'linee', 'torta')),
    campo('descrizione', testo(400, 'piu')),
    campo('serie', lista(oggetto(
      campo('nome', ETICHETTA),
      campo('punti', lista(oggetto(campo('x', TESTO_O_NUMERO), campo('y', NUMERO)), LIMITI.grafico.punti, 1)),
    ), LIMITI.grafico.serie, 1)),
    campo('unita', testo(24), false),
  ], controllaGrafico),
  scelte: voce('Scelte', LIMITI.scelte, [
    campo('domanda', testo(300, 'piu'), false),
    campo('opzioni', lista(OPZIONE(LIMITI.scelte.testo), LIMITI.scelte.opzioni, 1)),
  ]),
  modulo: voce('Modulo', LIMITI.modulo, [
    campo('campi', lista(oggetto(
      campo('id', ID),
      campo('etichetta', ETICHETTA),
      campo('tipo', scelta('scelta', 'piu-scelte', 'testo', 'numero', 'data')),
      campo('opzioni', lista(OPZIONE(80), 12, 1), false),
    ), LIMITI.modulo.campi, 1)),
    campo('invia', testo(40)),
  ], controllaModulo),
  'chiave-valore': voce('ChiaveValore', LIMITI['chiave-valore'], [
    campo('righe', lista(oggetto(
      campo('chiave', ETICHETTA),
      campo('valore', TESTO_O_NUMERO),
      campo('stato', scelta('ok', 'attenzione', 'errore'), false),
    ), LIMITI['chiave-valore'].righe, 1)),
  ]),
  passi: voce('Passi', LIMITI.passi, [
    campo('voci', lista(oggetto(
      campo('quando', testo(64), false),
      campo('titolo', testo(200)),
      campo('stato', scelta('fatto', 'ora', 'da-fare'), false),
    ), LIMITI.passi.voci, 1)),
  ]),
  avviso: voce('Avviso', LIMITI.avviso, [
    campo('tono', scelta('info', 'attenzione', 'errore')),
    campo('testo', testo(LIMITI.avviso.testo, 'piu')),
  ]),
  // `formato` e non `tipo`: `tipo` è già il nome del tipo nel blocco letto
  cursore: voce('Cursore', LIMITI.cursore, [
    campo('cursore', oggetto(
      campo('id', ID),
      campo('etichetta', ETICHETTA),
      campo('min', NUMERO),
      campo('max', NUMERO),
      campo('passo', NUMERO),
      campo('valore', NUMERO, false),
    )),
    campo('colonne', lista(oggetto(campo('id', ID), campo('titolo', TITOLO)), LIMITI.cursore.colonne, 1)),
    campo('righe', lista(lista(CELLA, LIMITI.cursore.colonne), LIMITI.cursore.righe, 1)),
    campo('formula', testo(LIMITI.cursore.formula)),
    campo('formato', FORMATO, false),
  ], controllaCursore),
  metriche: voce('Metriche', LIMITI.metriche, [
    campo('voci', lista(oggetto(
      campo('nome', ETICHETTA),
      campo('valore', NUMERO),
      campo('formato', FORMATO, false),
      campo('verso', scelta('su', 'giu'), false),
      campo('nota', testo(120), false),
    ), LIMITI.metriche.voci, LIMITI.metriche.minimo)),
  ]),
  confronto: voce('Confronto', LIMITI.confronto, [
    campo('colonne', lista(oggetto(
      campo('nome', ETICHETTA),
      campo('pro', lista(testo(160), LIMITI.confronto.voci)),
      campo('contro', lista(testo(160), LIMITI.confronto.voci), false),
    ), LIMITI.confronto.colonne, LIMITI.confronto.minimo)),
  ]),
  diagramma: voce('Diagramma', LIMITI.diagramma, [
    campo('nodi', lista(oggetto(campo('id', ID), campo('testo', testo(80))), LIMITI.diagramma.nodi, 1)),
    campo('frecce', lista(oggetto(campo('da', ID), campo('a', ID), campo('testo', testo(40), false)), LIMITI.diagramma.frecce)),
  ], controllaDiagramma),
});

const TIPO_DEL_COMPONENTE = new Map(TIPI.map((tipo) => [CATALOGO[tipo].componente, tipo]));

/** @returns {string|undefined} il tipo del catalogo per un nome di componente (`Tabella` → `tabella`) */
export function tipoDelComponente(nome) {
  return TIPO_DEL_COMPONENTE.get(nome);
}

// ---- Validazione ----

/** Motivo di un blocco rotto: un codice stabile e il campo dove si è visto. Non estende Error (nessuna pila da catturare). */
export class Rotto {
  constructor(codice, campo) {
    this.codice = codice;
    this.campo = campo;
  }
}

const rompi = (codice, campo) => {
  throw new Rotto(codice, campo);
};

// Segnaposto interno di un valore assente (riferimento non ancora arrivato nell'istantanea): mai nell'albero.
const ASSENTE = Symbol('assente');

function eOggettoSemplice(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === null || proto === Object.prototype;
}

/**
 * Contesto della validazione. `risolvi(valore, percorso, poi)` è dato dal lettore per i riferimenti fra istruzioni;
 * senza lettore (oggetti già costruiti) non ci sono riferimenti.
 */
function nuovoContesto(opzioni = {}) {
  return {
    parziale: Boolean(opzioni.parziale),
    eRiferimento: opzioni.eRiferimento || (() => false),
    risolvi: opzioni.risolvi || (() => ASSENTE),
    profondita: 0,
  };
}

function conRiferimenti(v, ctx, percorso, poi) {
  if (!ctx.eRiferimento(v)) return poi(v);
  ctx.profondita += 1;
  if (ctx.profondita > PROFONDITA_MASSIMA) rompi('troppoAnnidato', percorso);
  try {
    // Il lettore tiene la pila dei nomi aperti (riferimento circolare) e decide cosa fare di un nome che manca.
    return ctx.risolvi(v, percorso, ctx.parziale, (dest) => conRiferimenti(dest, ctx, percorso, poi));
  } finally {
    ctx.profondita -= 1;
  }
}

function valida(v, s, ctx, percorso) {
  return conRiferimenti(v, ctx, percorso, (valore) => validaDiretto(valore, s, ctx, percorso));
}

function validaDiretto(v, s, ctx, percorso) {
  switch (s.t) {
    case 'testo': {
      if (typeof v !== 'string') rompi('valoreNonValido', percorso);
      const pulito = testoDelModello(v, { righe: s.righe, massimo: s.massimo });
      if (pulito === '') rompi('valoreNonValido', percorso);
      return pulito;
    }
    case 'numero':
      if (typeof v !== 'number' || !Number.isFinite(v)) rompi('valoreNonValido', percorso);
      return v;
    case 'logico':
      if (typeof v !== 'boolean') rompi('valoreNonValido', percorso);
      return v;
    case 'scelta':
      if (typeof v !== 'string' || !s.valori.includes(v)) rompi('valoreNonValido', percorso);
      return v;
    case 'testo-o-numero':
      if (typeof v === 'number') return validaDiretto(v, NUMERO, ctx, percorso);
      return validaDiretto(v, testo(s.massimo), ctx, percorso);
    case 'cella':
      if (v === null) return null;
      if (typeof v === 'number') return validaDiretto(v, NUMERO, ctx, percorso);
      if (typeof v !== 'string') rompi('valoreNonValido', percorso);
      return testoDelModello(v, { massimo: s.massimo });
    case 'lista':
      return validaLista(v, s, ctx, percorso);
    case 'oggetto':
      return validaOggetto(v, s, ctx, percorso);
    default:
      return rompi('erroreInterno', percorso);
  }
}

function dentro(ctx, percorso, fn) {
  ctx.profondita += 1;
  if (ctx.profondita > PROFONDITA_MASSIMA) rompi('troppoAnnidato', percorso);
  try {
    return fn();
  } finally {
    ctx.profondita -= 1;
  }
}

function validaLista(v, s, ctx, percorso) {
  if (!Array.isArray(v)) rompi('valoreNonValido', percorso);
  return dentro(ctx, percorso, () => {
    const fuori = [];
    for (let i = 0; i < v.length; i += 1) {
      const elemento = valida(v[i], s.di, ctx, `${percorso}[${i}]`);
      if (elemento === ASSENTE) continue; // come OpenUI \§2.3: un riferimento irrisolto in una lista non lascia buchi
      fuori.push(elemento);
      if (fuori.length > s.massimo) rompi('oltreIlLimite', percorso);
    }
    if (!ctx.parziale && fuori.length < s.minimo) rompi('oltreIlLimite', percorso);
    return congela(fuori);
  });
}

function validaCampi(valori, campi, ctx, percorso, nomeDi) {
  const fuori = {};
  for (let i = 0; i < campi.length; i += 1) {
    const c = campi[i];
    const dove = nomeDi(c, i);
    const v = valori(c, i);
    const esito = v === undefined ? undefined : conRiferimenti(v, ctx, dove, (x) => (x === null ? null : validaDiretto(x, c.schema, ctx, dove)));
    if (esito === undefined || esito === null || esito === ASSENTE) {
      if (c.obbligatorio && !ctx.parziale) rompi('campoMancante', dove);
      continue;
    }
    fuori[c.nome] = esito;
  }
  return fuori;
}

function validaOggetto(v, s, ctx, percorso) {
  if (!eOggettoSemplice(v)) rompi('valoreNonValido', percorso);
  return dentro(ctx, percorso, () => {
    for (const chiave of Object.keys(v)) {
      if (!s.campi.some((c) => c.nome === chiave)) rompi('campoFuoriSchema', `${percorso}.${chiave}`);
    }
    return congela(validaCampi((c) => v[c.nome], s.campi, ctx, percorso, (c) => `${percorso}.${c.nome}`));
  });
}

function controllaTabella(b, ctx) {
  if (!b.colonne) return b;
  unici(b.colonne.map((c) => c.id), 'colonne');
  if (!b.righe) return b;
  const n = b.colonne.length;
  const righe = b.righe.map((riga, i) => {
    if (riga.length > n) rompi('oltreIlLimite', `righe[${i}]`);
    if (riga.length === n || ctx.parziale) return riga;
    return congela([...riga, ...Array.from({ length: n - riga.length }, () => null)]);
  });
  return { ...b, righe: congela(righe) };
}

function controllaGrafico(b) {
  if (b.forma === 'torta' && b.serie) {
    if (b.serie.length > 1) rompi('oltreIlLimite', 'serie');
    if (b.serie[0] && b.serie[0].punti.length > LIMITI.grafico.fette) rompi('oltreIlLimite', 'serie[0].punti');
  }
  return b;
}

function controllaModulo(b, ctx) {
  if (!b.campi) return b;
  b.campi.forEach((c, i) => {
    const conOpzioni = c.tipo === 'scelta' || c.tipo === 'piu-scelte';
    if (conOpzioni && !c.opzioni && !ctx.parziale) rompi('campoMancante', `campi[${i}].opzioni`);
    if (!conOpzioni && c.opzioni) rompi('campoFuoriSchema', `campi[${i}].opzioni`);
  });
  unici(b.campi.map((c) => c.id), 'campi');
  return b;
}

function controllaCursore(b, ctx) {
  const c = b.cursore;
  if (c && c.min !== undefined && c.max !== undefined) {
    if (!(c.min < c.max)) rompi('valoreNonValido', 'cursore.max');
    if (c.passo !== undefined) {
      if (!(c.passo > 0)) rompi('valoreNonValido', 'cursore.passo');
      if ((c.max - c.min) / c.passo > LIMITI.cursore.passi) rompi('oltreIlLimite', 'cursore.passo');
    }
    if (c.valore !== undefined && (c.valore < c.min || c.valore > c.max)) rompi('valoreNonValido', 'cursore.valore');
  }
  if (!b.colonne) return b;
  const ids = b.colonne.map((x) => x.id);
  unici(ids, 'colonne');
  if (c && c.id && ids.includes(c.id)) rompi('valoreNonValido', 'cursore.id');
  // la formula si legge qui, coi soli nomi dichiarati: una formula che non si legge rompe il blocco, mai un conto a metà a schermo
  if (b.formula !== undefined && c && c.id && leggiFormula(b.formula, [...ids, c.id]) instanceof Rotto) rompi('valoreNonValido', 'formula');
  return b.righe ? controllaTabella(b, ctx) : b;
}

function controllaDiagramma(b) {
  if (!b.nodi) return b;
  const ids = b.nodi.map((n) => n.id);
  unici(ids, 'nodi');
  (b.frecce || []).forEach((f, i) => {
    if (!ids.includes(f.da)) rompi('valoreNonValido', `frecce[${i}].da`);
    if (!ids.includes(f.a)) rompi('valoreNonValido', `frecce[${i}].a`);
  });
  return b;
}

function unici(ids, percorso) {
  const visti = new Set();
  ids.forEach((id, i) => {
    if (visti.has(id)) rompi('valoreNonValido', `${percorso}[${i}].id`);
    visti.add(id);
  });
}

/**
 * Valida gli argomenti posizionali di un tipo del catalogo e restituisce il blocco con i campi nominati, nell'ordine
 * dello schema. Lancia `Rotto` (lo cattura il lettore): resta interno al nucleo.
 * @param {string} tipo
 * @param {unknown[]} argomenti
 * @param {{ parziale?: boolean, eRiferimento?: Function, risolvi?: Function }} [opzioni]
 */
export function validaArgomenti(tipo, argomenti, opzioni) {
  const voceDelTipo = CATALOGO[tipo];
  if (!voceDelTipo) rompi('tipoSconosciuto', 'tipo');
  const ctx = opzioni && opzioni.ctx ? opzioni.ctx : nuovoContesto(opzioni);
  if (argomenti.length > voceDelTipo.argomenti.length) rompi('campoFuoriSchema', `argomento ${voceDelTipo.argomenti.length + 1}`);
  const campi = validaCampi((c, i) => argomenti[i], voceDelTipo.argomenti, ctx, '', (c) => c.nome);
  let blocco = { tipo, ...campi };
  if (voceDelTipo.controllo) blocco = voceDelTipo.controllo(blocco, ctx);
  return congela(blocco);
}

/** Valida un valore contro uno schema del catalogo (usato per la fonte data dall'ospite). Lancia `Rotto`. */
export function validaSchema(valore, schema, percorso = '') {
  return valida(valore, schema, nuovoContesto(), percorso);
}

export { ASSENTE as _ASSENTE, nuovoContesto as _nuovoContesto };

// ---- Ripiego testuale: copia del messaggio, lettura ad alta voce, CLI ----

export const PAROLE_DEL_RIPIEGO = congela({
  en: congela({
    fonte: 'Source',
    tono: congela({ info: 'Note', attenzione: 'Warning', errore: 'Error' }),
    statoRiga: congela({ ok: 'ok', attenzione: 'warning', errore: 'error' }),
    statoPasso: congela({ fatto: 'done', ora: 'now', 'da-fare': 'to do' }),
    verso: congela({ su: 'up', giu: 'down' }),
    totale: 'Total',
    contro: 'against',
  }),
  it: congela({
    fonte: 'Fonte',
    tono: congela({ info: 'Nota', attenzione: 'Attenzione', errore: 'Errore' }),
    statoRiga: congela({ ok: 'ok', attenzione: 'attenzione', errore: 'errore' }),
    statoPasso: congela({ fatto: 'fatto', ora: 'ora', 'da-fare': 'da fare' }),
    verso: congela({ su: 'su', giu: 'giù' }),
    totale: 'Totale',
    contro: 'contro',
  }),
});

const cellaMd = (v) => (v === null || v === undefined ? '' : String(v).replace(/\\/g, () => '\\\\').replace(/\|/g, () => '\\|'));

function tabellaMd(intestazioni, righe) {
  const riga = (celle) => `| ${celle.map(cellaMd).join(' | ')} |`;
  return [riga(intestazioni), `| ${intestazioni.map(() => '---').join(' | ')} |`, ...righe.map(riga)].join('\n');
}

const RIPIEGHI = {
  tabella: (b) => tabellaMd(b.colonne.map((c) => c.titolo), b.righe),
  grafico: (b) => {
    const xs = [];
    const indice = new Map();
    for (const s of b.serie) {
      for (const p of s.punti) {
        const chiave = `${typeof p.x}:${p.x}`;
        if (!indice.has(chiave)) {
          indice.set(chiave, xs.length);
          xs.push(p.x);
        }
      }
    }
    const righe = xs.map((x) => [x, ...b.serie.map(() => null)]);
    b.serie.forEach((s, j) => {
      for (const p of s.punti) righe[indice.get(`${typeof p.x}:${p.x}`)][j + 1] = p.y;
    });
    const descrizione = b.unita ? `${b.descrizione} (${b.unita})` : b.descrizione;
    return `${descrizione}\n\n${tabellaMd(['x', ...b.serie.map((s) => s.nome)], righe)}`;
  },
  scelte: (b) => [b.domanda ? `${b.domanda}\n` : null, ...b.opzioni.map((o) => `- ${o.testo}`)].filter((x) => x !== null).join('\n'),
  modulo: (b) => b.campi.map((c) => (c.opzioni ? `- ${c.etichetta} (${c.opzioni.map((o) => o.testo).join(' / ')})` : `- ${c.etichetta}`)).join('\n'),
  'chiave-valore': (b, p) => b.righe.map((r) => `- ${r.chiave}: ${r.valore}${r.stato ? ` (${p.statoRiga[r.stato]})` : ''}`).join('\n'),
  passi: (b, p) => b.voci.map((v, i) => {
    const note = [v.stato ? p.statoPasso[v.stato] : null, v.quando || null].filter(Boolean);
    return `${i + 1}. ${v.titolo}${note.length ? ` (${note.join(', ')})` : ''}`;
  }).join('\n'),
  avviso: (b, p) => `${p.tono[b.tono]}: ${b.testo}`,
  // v2: il cursore si legge al suo valore di partenza (o al minimo), con la colonna del risultato e il totale, come a schermo
  cursore: (b, p) => {
    const { righe, totale, valore } = contoDelCursore(b);
    const cifra = (x) => (x === null ? '—' : String(Math.round(x * 100) / 100));
    return [`${b.cursore.etichetta}: ${valore} (${b.cursore.min}–${b.cursore.max})`,
      tabellaMd([...b.colonne.map((c) => c.titolo), b.formula], righe.map((r) => [...r.celle, cifra(r.risultato)])),
      `${p.totale}: ${cifra(totale)}`].join('\n\n');
  },
  metriche: (b, p) => b.voci.map((v) => {
    const note = [v.verso ? p.verso[v.verso] : null, v.nota || null].filter(Boolean);
    return `- ${v.nome}: ${v.valore}${note.length ? ` (${note.join(', ')})` : ''}`;
  }).join('\n'),
  confronto: (b, p) => b.colonne.map((c) => [c.nome, ...c.pro.map((x) => `+ ${x}`), ...(c.contro || []).map((x) => `- ${x} (${p.contro})`)].join('\n')).join('\n\n'),
  diagramma: (b) => {
    const testo = new Map(b.nodi.map((n) => [n.id, n.testo]));
    const toccati = new Set(b.frecce.flatMap((f) => [f.da, f.a]));
    return [...b.frecce.map((f) => `- ${testo.get(f.da)} → ${testo.get(f.a)}${f.testo ? ` (${f.testo})` : ''}`),
      ...b.nodi.filter((n) => !toccati.has(n.id)).map((n) => `- ${n.testo}`)].join('\n');
  },
};

/**
 * Il conto del cursore a un valore (di serie quello di partenza, o il minimo), riga per riga, e il totale: lo usano il ripiego, il
 * disegnatore del PC e l'esportazione, così testo, schermo e file dicono gli stessi numeri. Mai lancia su un blocco completo.
 * @param {object} b il blocco `cursore` completo
 * @param {number} [valore]
 * @returns {{ valore: number, righe: { celle: unknown[], risultato: number|null }[], totale: number|null }}
 */
export function contoDelCursore(b, valore) {
  const c = b.cursore;
  const v = typeof valore === 'number' && Number.isFinite(valore) ? valore : (c.valore ?? c.min);
  const albero = leggiFormula(b.formula, [...b.colonne.map((x) => x.id), c.id]);
  const righe = b.righe.map((celle) => {
    if (albero instanceof Rotto) return { celle, risultato: null };
    const valori = Object.create(null);
    b.colonne.forEach((col, i) => { valori[col.id] = celle[i]; });
    valori[c.id] = v;
    return { celle, risultato: calcola(albero, valori) };
  });
  const numeri = righe.map((r) => r.risultato).filter((x) => x !== null);
  return { valore: v, righe, totale: numeri.length ? numeri.reduce((a, x) => a + x, 0) : null };
}

/**
 * Il ripiego testuale di un blocco completo: testo semplice (tabelle in Markdown), funzione pura, mai lancia.
 * @param {object} blocco l'albero `blocco` del lettore
 * @param {{ lingua?: 'en'|'it' }} [opzioni] le poche parole fisse (tono, stati, «Fonte»); inglese di serie
 */
export function ripiegoTestuale(blocco, opzioni) {
  try {
    if (!blocco || typeof blocco !== 'object' || !Object.hasOwn(RIPIEGHI, blocco.tipo)) return '';
    const parole = PAROLE_DEL_RIPIEGO[opzioni && opzioni.lingua === 'it' ? 'it' : 'en'];
    const parti = [];
    if (blocco.titolo) parti.push(blocco.titolo);
    parti.push(RIPIEGHI[blocco.tipo](blocco, parole));
    if (blocco.fonte) parti.push(`${parole.fonte}: ${blocco.fonte.nome}${blocco.fonte.quando ? ` (${blocco.fonte.quando})` : ''}`);
    return parti.join('\n\n');
  } catch {
    return '';
  }
}
