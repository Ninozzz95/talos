import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
function discoNode(o) {
  const radice = o.radice.replace(/[\\/]+$/, "");
  const dentro = (percorso) => percorso ? join(radice, percorso) : radice;
  return {
    async elenca(cartella) {
      const voci = await readdir(dentro(cartella), { withFileTypes: true });
      return Promise.all(voci.map(async (v) => {
        const cartellaVera = v.isDirectory();
        let byte = 0;
        if (!cartellaVera) {
          try {
            byte = (await stat(join(dentro(cartella), v.name))).size;
          } catch {
            byte = 0;
          }
        }
        return { nome: v.name, cartella: cartellaVera, byte };
      }));
    },
    async leggi(percorso) {
      return readFile(dentro(percorso), "utf8");
    },
    async scrivi(percorso, testo) {
      await mkdir(dirname(dentro(percorso)), { recursive: true });
      await writeFile(dentro(percorso), testo, "utf8");
    }
  };
}
const ESTENSIONI_SORGENTE = Object.freeze([".mjs", ".js", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"]);
let compilatore = null;
async function caricaCompilatore() {
  if (!compilatore) compilatore = (await import("typescript")).default ?? await import("typescript");
  return compilatore;
}
function estensioneDi(nome) {
  const punto = nome.lastIndexOf(".");
  return punto < 0 ? "" : nome.slice(punto).toLowerCase();
}
function genereDi(ts, nomeFile) {
  switch (estensioneDi(nomeFile)) {
    case ".ts":
    case ".mts":
    case ".cts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}
async function dichiaratiIn(testo, nomeFile) {
  if (!ESTENSIONI_SORGENTE.includes(estensioneDi(nomeFile))) {
    return {
      copertura: "nonSupportato",
      nomi: /* @__PURE__ */ new Set(),
      perche: `estensione ${estensioneDi(nomeFile) || "(nessuna)"}`
    };
  }
  const ts = await caricaCompilatore();
  return dichiaratiConCompilatore(ts, testo, nomeFile);
}
function dichiaratiConCompilatore(ts, testo, nomeFile) {
  if (!ESTENSIONI_SORGENTE.includes(estensioneDi(nomeFile))) {
    return { copertura: "nonSupportato", nomi: /* @__PURE__ */ new Set(), perche: `estensione ${estensioneDi(nomeFile)}` };
  }
  const sorgente = ts.createSourceFile(
    nomeFile,
    testo,
    ts.ScriptTarget.Latest,
    true,
    genereDi(ts, nomeFile)
  );
  const rotture = sorgente.parseDiagnostics ?? [];
  if (rotture.length > 0) {
    return {
      copertura: "sorgenteInvalida",
      nomi: /* @__PURE__ */ new Set(),
      perche: `${rotture.length} errori di sintassi`
    };
  }
  const genere = genereDi(ts, nomeFile);
  if (genere === ts.ScriptKind.JS || genere === ts.ScriptKind.JSX) {
    const soloTypeScript = contieneCostruttiTypeScript(ts, sorgente);
    if (soloTypeScript) {
      return { copertura: "sorgenteInvalida", nomi: /* @__PURE__ */ new Set(), perche: "costrutti TypeScript in un file JavaScript" };
    }
  }
  return { copertura: "completa", nomi: raccogliDichiarazioni(ts, sorgente) };
}
function tipoAnnotato(ts, nodo) {
  const forse = nodo.type;
  return forse !== void 0 && typeof forse === "object" && forse !== null && ts.isTypeNode(forse);
}
function contieneCostruttiTypeScript(ts, sorgente) {
  let trovato = false;
  const visita = (nodo) => {
    if (trovato) return;
    if (ts.isInterfaceDeclaration(nodo) || ts.isTypeAliasDeclaration(nodo) || ts.isEnumDeclaration(nodo) || ts.isModuleDeclaration(nodo) || ts.isAsExpression(nodo) || ts.isTypeAssertionExpression(nodo) || ts.isNonNullExpression(nodo) || ts.isTypeParameterDeclaration(nodo) || tipoAnnotato(ts, nodo)) {
      trovato = true;
      return;
    }
    ts.forEachChild(nodo, visita);
  };
  ts.forEachChild(sorgente, visita);
  return trovato;
}
function raccogliDichiarazioni(ts, sorgente) {
  const nomi = /* @__PURE__ */ new Set();
  const prendi = (nodo) => {
    if (!nodo) return;
    if (ts.isIdentifier(nodo)) {
      nomi.add(nodo.text);
      return;
    }
    if (ts.isObjectBindingPattern(nodo) || ts.isArrayBindingPattern(nodo)) {
      for (const el of nodo.elements) {
        if (!ts.isOmittedExpression(el)) prendi(el.name);
      }
    }
  };
  const visita = (nodo) => {
    if (ts.isFunctionDeclaration(nodo) || ts.isClassDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isVariableDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isTypeAliasDeclaration(nodo) || ts.isInterfaceDeclaration(nodo) || ts.isEnumDeclaration(nodo) || ts.isModuleDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isMethodDeclaration(nodo) || ts.isPropertyDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isExportSpecifier(nodo)) prendi(nodo.name);
    else if (ts.isImportSpecifier(nodo)) prendi(nodo.name);
    else if (ts.isImportClause(nodo)) prendi(nodo.name);
    else if (ts.isNamespaceImport(nodo)) prendi(nodo.name);
    ts.forEachChild(nodo, visita);
  };
  ts.forEachChild(sorgente, visita);
  return nomi;
}
const ILLEGGIBILE = "sorgenteInvalida";
async function costruisciCatalogo(sorgenti, opzioni) {
  const precedente = opzioni?.precedente;
  const perFile = /* @__PURE__ */ new Map();
  const perNome = /* @__PURE__ */ new Map();
  const testi = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    const gia = precedente?.perFile.get(percorso);
    if (gia && precedente.testi.get(percorso) === testo) {
      perFile.set(percorso, gia);
      for (const nome of gia.nomi) {
        const dove = perNome.get(nome);
        if (dove) dove.push(percorso);
        else perNome.set(nome, [percorso]);
      }
      testi.set(percorso, testo);
      continue;
    }
    if (testo === null) {
      perFile.set(percorso, { copertura: ILLEGGIBILE, nomi: /* @__PURE__ */ new Set() });
      testi.set(percorso, null);
      continue;
    }
    const esito = await dichiaratiIn(testo, percorso);
    perFile.set(percorso, { copertura: esito.copertura, nomi: esito.nomi });
    testi.set(percorso, testo);
    for (const nome of esito.nomi) {
      const dove = perNome.get(nome);
      if (dove) dove.push(percorso);
      else perNome.set(nome, [percorso]);
    }
  }
  return { perFile, perNome, testi, elenco: opzioni?.elenco ?? "completo" };
}
function ambitoEUnFile(ambito) {
  return !ambito.endsWith("/") && /\.[a-z0-9]+$/i.test(ambito);
}
function dentroAmbito(percorso, ambito) {
  if (ambitoEUnFile(ambito)) return percorso === ambito;
  const cartella = ambito.endsWith("/") ? ambito : `${ambito}/`;
  return percorso.startsWith(cartella);
}
function risolviSimbolo(catalogo, nome, ambito) {
  const fatto = { famiglia: "symbol-declared", nome, ambito };
  const parziale = catalogo.elenco === "completo" ? null : catalogo.elenco.troncato;
  const file = [...catalogo.perFile.keys()].filter((p) => dentroAmbito(p, ambito));
  if (file.length === 0) {
    if (parziale) return { stato: "ignoto", perche: `the workspace listing is incomplete (${parziale}), so nothing can be ruled out in ${ambito}`, fatto };
    if (ambitoEUnFile(ambito)) {
      return { stato: "assente", perche: `"${nome}" is not declared in ${ambito} (the file does not exist)`, copertura: "completa", fatto };
    }
    return { stato: "ignoto", perche: `nothing is known about ${ambito}`, fatto };
  }
  const testimoni = (catalogo.perNome.get(nome) ?? []).filter((p) => dentroAmbito(p, ambito));
  if (testimoni.length > 0) return { stato: "presente", fatto: { ...fatto, ambito: testimoni[0] } };
  const scoperti = file.filter((f) => catalogo.perFile.get(f).copertura !== "completa");
  if (scoperti.length > 0) {
    const perche = catalogo.perFile.get(scoperti[0]).copertura;
    return {
      stato: "ignoto",
      perche: `${scoperti.length} file(s) in ${ambito} could not be read (${perche}), starting with ${scoperti[0]}`,
      fatto
    };
  }
  if (parziale) {
    return {
      stato: "ignoto",
      perche: `every listed file in ${ambito} was read, but the listing itself is incomplete (${parziale})`,
      fatto
    };
  }
  const copertura = "completa";
  return { stato: "assente", perche: `"${nome}" is not declared anywhere in ${ambito}`, copertura, fatto };
}
const CARTELLE_SALTATE = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".svelte-kit",
  ".next",
  ".nuxt",
  ".cache",
  ".gradle",
  ".idea",
  ".vscode",
  "android",
  "ios",
  "target",
  "vendor",
  "__pycache__"
]);
const TETTO_BYTE = 8 * 1024 * 1024;
const TETTO_FILE = 1500;
function fontiDaDisco(disco, opzioni = {}) {
  const tettoByte = opzioni.tettoByte ?? TETTO_BYTE;
  const tettoFile = opzioni.tettoFile ?? TETTO_FILE;
  const salta = opzioni.salta ?? CARTELLE_SALTATE;
  let ultimoLetto = /* @__PURE__ */ new Map();
  return {
    async leggiSpazio() {
      const sorgenti = [];
      let byte = 0;
      let elenco = "completo";
      const scendi = async (cartella) => {
        if (elenco !== "completo") return;
        let voci;
        try {
          voci = await disco.elenca(cartella);
        } catch (e) {
          elenco = { troncato: `"${cartella || "."}" could not be listed (${messaggio(e)})` };
          return;
        }
        for (const voce of voci) {
          if (elenco !== "completo") return;
          const percorso = cartella ? `${cartella}/${voce.nome}` : voce.nome;
          if (voce.cartella) {
            if (salta.has(voce.nome)) continue;
            await scendi(percorso);
            continue;
          }
          if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue;
          if (sorgenti.length >= tettoFile) {
            elenco = { troncato: `the workspace has more than ${tettoFile} source files` };
            return;
          }
          if (byte + voce.byte > tettoByte) {
            elenco = { troncato: `the workspace is larger than ${Math.round(tettoByte / 1024 / 1024)} MB of source` };
            return;
          }
          byte += voce.byte;
          try {
            sorgenti.push({ percorso, testo: await disco.leggi(percorso) });
          } catch {
            sorgenti.push({ percorso, testo: null });
          }
        }
      };
      await scendi("");
      ultimoLetto = new Map(sorgenti.map((s) => [s.percorso, s.testo]));
      return { sorgenti, elenco };
    },
    async scrivi(sorgenti) {
      for (const { percorso, testo } of sorgenti) {
        if (testo === null) continue;
        if (ultimoLetto.get(percorso) === testo) continue;
        await disco.scrivi(percorso, testo);
      }
    }
  };
}
function messaggio(e) {
  return e instanceof Error ? e.message : String(e);
}
const CODICI_RIFERIMENTO_MANCANTE = Object.freeze(/* @__PURE__ */ new Set([
  2304,
  // Cannot find name 'X'
  2305,
  // Module 'Y' has no exported member 'X'  ← trovato da un test, non a memoria
  2307,
  // Cannot find module 'X'
  2339,
  // Property 'X' does not exist on type 'Y'
  2551,
  // Property 'X' does not exist on type 'Y'. Did you mean 'Z'?
  2552,
  // Cannot find name 'X'. Did you mean 'Y'?
  2503,
  // Cannot find namespace 'X'
  2724
  // 'Y' has no exported member named 'X'. Did you mean 'Z'?
]));
function improntaDi(ts, d) {
  return {
    codice: d.code,
    file: d.file ? d.file.fileName : null,
    messaggio: ts.flattenDiagnosticMessageText(d.messageText, " ").trim()
  };
}
const SEPARATORE = String.fromCharCode(31);
const chiaveDi = (i) => `${i.codice}${SEPARATORE}${i.file ?? ""}${SEPARATORE}${i.messaggio}`;
function introdotte(prima, dopo) {
  const conto = /* @__PURE__ */ new Map();
  for (const d of prima) {
    const k = chiaveDi(d);
    conto.set(k, (conto.get(k) ?? 0) + 1);
  }
  const nuove = [];
  for (const d of dopo) {
    const k = chiaveDi(d);
    const restano = conto.get(k) ?? 0;
    if (restano > 0) conto.set(k, restano - 1);
    else nuove.push(d);
  }
  return nuove;
}
function hostInMemoria(ts, file, libreria) {
  const trova = (f) => file.get(f) ?? libreria?.file.get(f);
  return {
    fileExists: (f) => trova(f) !== void 0,
    readFile: (f) => trova(f),
    getSourceFile: (f, target) => {
      const testo = trova(f);
      return testo === void 0 ? void 0 : ts.createSourceFile(f, testo, target, true, genereDi(ts, f));
    },
    getDefaultLibFileName: () => libreria?.predefinita ?? "/lib.d.ts",
    /*
     * ⛔ Il compilatore chiede le librerie per nome NUDO: senza una
     * posizione vuota, i riferimenti `/// <reference lib="..." />` dentro i
     * file di libreria non si risolvono, e si torna al falso positivo.
     */
    getDefaultLibLocation: () => "",
    writeFile: () => {
    },
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n"
  };
}
const SOPPRESSIONI = /@ts-(ignore|expect-error|nocheck)\b/g;
function contaSoppressioni(sorgenti) {
  const per = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    if (testo === null) continue;
    const quante = testo.match(SOPPRESSIONI)?.length ?? 0;
    if (quante > 0) per.set(percorso, quante);
  }
  return per;
}
function soppressioniIntrodotte(prima, dopo) {
  const eranO = contaSoppressioni(prima);
  const fuori = [];
  for (const [percorso, adesso] of contaSoppressioni(dopo)) {
    const differenza = adesso - (eranO.get(percorso) ?? 0);
    if (differenza > 0) fuori.push({ percorso, quante: differenza });
  }
  return fuori;
}
async function riferimentiNonRisolti(sorgenti, libreria) {
  const ts = await caricaCompilatore();
  const file = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    if (testo === null) continue;
    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue;
    file.set(percorso, testo);
  }
  if (file.size === 0) return [];
  const program = ts.createProgram(
    [...file.keys()],
    { noEmit: true, skipLibCheck: true, allowJs: true, checkJs: false },
    hostInMemoria(ts, file, libreria)
  );
  const fuori = [];
  for (const nome of file.keys()) {
    const sorgente = program.getSourceFile(nome);
    if (!sorgente) continue;
    for (const d of program.getSemanticDiagnostics(sorgente)) {
      if (CODICI_RIFERIMENTO_MANCANTE.has(d.code)) fuori.push(improntaDi(ts, d));
    }
  }
  return fuori;
}
async function cancelloSemantico(prima, dopo, libreria) {
  const fatto = { famiglia: "introduced-references", nome: "modifica candidata" };
  let baseline;
  let candidato;
  try {
    baseline = await riferimentiNonRisolti(prima, libreria);
    candidato = await riferimentiNonRisolti(dopo, libreria);
  } catch (errore) {
    return {
      stato: "ignoto",
      perche: `the semantic guard could not run (${errore instanceof Error ? errore.message.slice(0, 80) : "errore"})`,
      fatto
    };
  }
  const zittite = soppressioniIntrodotte(prima, dopo);
  if (zittite.length > 0) {
    return {
      stato: "assente",
      perche: `the change adds ${zittite.reduce((s, z) => s + z.quante, 0)} new compiler-error suppression(s) (@ts-ignore / @ts-expect-error) in ${zittite.map((z) => z.percorso).join(", ")}. Silencing an error is not fixing it.`,
      copertura: "completa",
      fatto
    };
  }
  const nuove = introdotte(baseline, candidato);
  if (nuove.length === 0) return { stato: "presente", fatto };
  return {
    stato: "assente",
    perche: `the change introduces ${nuove.length} unresolved reference(s): ${nuove.slice(0, 3).map((d) => d.messaggio).join("; ")}`,
    /*
     * ⛔ `completa` perché il confronto è fatto sullo STESSO insieme di file
     * con lo STESSO compilatore: ciò che è nuovo è nuovo per costruzione.
     * Non dice che il progetto sia corretto — dice che la modifica non ha
     * aggiunto riferimenti rotti fra quelli che sappiamo vedere.
     */
    copertura: "completa",
    fatto
  };
}
const CATENA_ES2022 = Object.freeze([
  "lib.es5.d.ts",
  "lib.es2015.d.ts",
  "lib.es2016.d.ts",
  "lib.es2017.d.ts",
  "lib.es2018.d.ts",
  "lib.es2019.d.ts",
  "lib.es2020.d.ts",
  "lib.es2021.d.ts",
  "lib.es2022.d.ts",
  "lib.decorators.d.ts",
  "lib.decorators.legacy.d.ts"
]);
let inMano = null;
async function componiLibreria(leggi, nomi = CATENA_ES2022) {
  const file = /* @__PURE__ */ new Map();
  for (const nome of nomi) {
    const testo = await leggi(nome);
    if (testo !== null) file.set(nome, testo);
  }
  return { predefinita: "lib.es2022.d.ts", file };
}
async function libreriaStandard(leggi) {
  if (!inMano) inMano = await componiLibreria(leggi);
  return inMano;
}
const SCHEMA_RECORD_COMPATTAZIONE = "talos.compattazione.v1";
const VARIABILE_TETTO_TOKEN = "TALOS_COMPACTION_TOKEN_CAP";
const TETTO_TOKEN_DEFAULT = 2e5;
const FRAZIONE_FINESTRA = 0.75;
const FRAZIONE_EMERGENZA = 0.9;
const MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA = 1.2;
const RICHIESTE_UTENTE_LETTERALI = 3;
const SCAMBI_CHIUSI_LETTERALI = 2;
const FILE_RILETTI_MASSIMI = 5;
const MAX_TOKEN_RIASSUNTO = 2048;
const PAROLE_MASSIME_RIASSUNTO = 1200;
const MARCATORE_RIASSUNTO = "[conversazione compattata: quanto segue è un riassunto, non la cronologia originale]";
const MARCATORE_INDICE = "Indice meccanico (costruito dal codice, non dal modello):";
const ATTREZZI_SUI_FILE = /* @__PURE__ */ new Set(["leggi", "scrivi", "file_edit"]);
const CHIAVI_PERCORSO = ["percorso", "path", "file_path", "filePath", "file", "filename", "cartella"];
const CHIAVI_COMANDO = ["comando", "command", "cmd", "script"];
const CARATTERI_PROVENIENZA = 240;
const IMPRONTE_MASSIME = 20;
const ERRORI_MASSIMI = 20;
const PATTERN_CONTESTO_PIENO = [
  /context[_ ]length[_ ]exceeded/i,
  /maximum context length/i,
  /context (?:length|size|window)/i,
  /too many tokens/i,
  /token limit/i,
  /prompt is too long/i,
  /input is too long/i,
  /exceeds? the (?:maximum|max)(?: number of)?(?: input)? tokens/i,
  /max_model_len/i,
  /reduce the length/i,
  /\bLOCAL_CONTEXT_EXCEEDED\b/,
  // Il motore locale del telefono: `promptTooLongFailure` (`localAdapter.ts`) sale con questo codice.
  /\bTALOS_LOCAL_PROMPT_TOO_LONG\b/
];
const SEGNAPOSTO_SEGRETO = "[segreto oscurato]";
const FORME_DEI_SEGRETI = [
  /\b(?:proxy-)?authorization\b\s*[:=]\s*(?:bearer|basic|token|apikey)?\s*[^\s,;"']+/gi,
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:x-)?(?:goog-)?api[-_ ]?key\b\s*[:=]\s*[^\s,;"']+/gi,
  /\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD)\s*[:=]\s*[^\s,;"']+/g,
  /\b(?:sk|tvly|xai|gsk|pplx|ghp|gho|ghs|github_pat)[-_][A-Za-z0-9_-]{8,}/gi,
  /[?&](?:key|api[-_]?key|apikey|access_token|token|password|secret)=[^&\s"']+/gi,
  /\bAIza[\w-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?(?:-----END[ A-Z]*PRIVATE KEY-----|$)/g,
  /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@"']+:[^\s/@"']+@/gi
];
function oscuraPerRiassunto(testo) {
  let pulito = String(testo ?? "");
  for (const forma of FORME_DEI_SEGRETI) {
    pulito = pulito.replace(forma, (trovato, schema) => typeof schema === "string" && trovato.startsWith(schema) ? `${schema}${SEGNAPOSTO_SEGRETO}@` : SEGNAPOSTO_SEGRETO);
  }
  return pulito;
}
function oscuraArgomenti(argomenti) {
  let oggetto;
  try {
    oggetto = JSON.parse(argomenti);
  } catch {
    return oscuraPerRiassunto(argomenti);
  }
  const pulisci = (valore) => {
    if (typeof valore === "string") return oscuraPerRiassunto(valore);
    if (Array.isArray(valore)) return valore.map(pulisci);
    if (valore && typeof valore === "object") {
      return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, pulisci(v)]));
    }
    return valore;
  };
  return JSON.stringify(pulisci(oggetto));
}
function oscuraMessaggio(m) {
  const contenuto = typeof m.content === "string" ? oscuraPerRiassunto(m.content) : m.content;
  const chiamate = Array.isArray(m.tool_calls) ? m.tool_calls.map((c) => ({ ...c, function: { ...c.function, arguments: oscuraArgomenti(String(c.function?.arguments ?? "")) } })) : void 0;
  return { ...m, content: contenuto, ...chiamate ? { tool_calls: chiamate } : {} };
}
function stimaTokenMessaggi(messaggi) {
  let somma = 0;
  for (const m of messaggi) {
    if (typeof m.content === "string") somma += Math.ceil(m.content.length / 4);
    for (const c of m.tool_calls ?? []) somma += Math.ceil(String(c.function?.arguments ?? "").length / 4);
  }
  return somma;
}
function eSistema(m) {
  return m?.role === "system";
}
function leggiTettoEsplicito(env = {}) {
  const grezzo = env?.[VARIABILE_TETTO_TOKEN];
  if (grezzo === void 0 || grezzo === null || String(grezzo).trim() === "") return null;
  const testo = String(grezzo).trim();
  if (!/^\d+$/.test(testo)) return null;
  const valore = Number(testo);
  return Number.isSafeInteger(valore) && valore > 0 ? valore : null;
}
function calcolaSoglie({ tettoToken = null, finestraToken = null, riservaUscita = null } = {}) {
  const tettoEsplicito = Number.isSafeInteger(tettoToken) && tettoToken > 0 ? tettoToken : null;
  const finestra = Number.isFinite(finestraToken) && finestraToken > 0 ? finestraToken : null;
  if (finestra === null) {
    const soglia2 = tettoEsplicito ?? TETTO_TOKEN_DEFAULT;
    return { soglia: soglia2, warningTokens: Math.floor(soglia2 * 0.8), emergenza: Math.ceil(soglia2 * MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA), fonte: tettoEsplicito === null ? "fallback" : "tetto", tettoToken: soglia2, finestraToken: null, finestraUtile: null };
  }
  const riserva = Number.isFinite(riservaUscita) && riservaUscita > 0 ? Math.floor(riservaUscita) : 0;
  const utile = finestra - riserva > 0 ? finestra - riserva : finestra;
  const daFinestra = Math.floor(utile * FRAZIONE_FINESTRA);
  const soglia = tettoEsplicito === null ? daFinestra : Math.min(tettoEsplicito, daFinestra);
  return {
    soglia,
    warningTokens: Math.floor(soglia * 0.8),
    emergenza: Math.floor(utile * FRAZIONE_EMERGENZA),
    fonte: tettoEsplicito !== null && soglia === tettoEsplicito ? "tetto" : "finestra",
    tettoToken: tettoEsplicito,
    finestraToken: finestra,
    finestraUtile: utile
  };
}
function misuraOccupazione({ ancora = null, messaggi = [], finestraToken = null } = {}) {
  const promptTokens = Number(ancora?.promptTokens);
  const lunghezza = Number(ancora?.lunghezza);
  const stimaAllora = Number(ancora?.stima);
  const finestra = Number(finestraToken);
  const plausibile = Number.isFinite(promptTokens) && promptTokens > 0 && (!Number.isFinite(stimaAllora) || stimaAllora <= 0 || promptTokens >= stimaAllora / 4) && (!Number.isFinite(finestra) || finestra <= 0 || promptTokens <= finestra);
  if (plausibile && Number.isInteger(lunghezza) && lunghezza >= 0 && messaggi.length >= lunghezza) {
    return { token: promptTokens + stimaTokenMessaggi(messaggi.slice(lunghezza)), misura: "fornitore" };
  }
  return { token: stimaTokenMessaggi(messaggi), misura: "stimato" };
}
function decidiCompattazione({ token, soglia, emergenza, tentativiEsauriti = false, emergenzaEsaurita = false }) {
  if (!Number.isFinite(token)) return { scatta: false, motivo: null };
  if (token >= emergenza && !emergenzaEsaurita) return { scatta: true, motivo: "emergenza" };
  if (token >= soglia && !tentativiEsauriti) return { scatta: true, motivo: "soglia" };
  return { scatta: false, motivo: null };
}
function staccaEffimeri(messaggi) {
  if (!Array.isArray(messaggi)) return { messaggi: [], effimeri: [] };
  let ultimoNonSistema = -1;
  for (let i = messaggi.length - 1; i >= 0; i -= 1) {
    if (!eSistema(messaggi[i])) {
      ultimoNonSistema = i;
      break;
    }
  }
  if (ultimoNonSistema === -1 || ultimoNonSistema === messaggi.length - 1) return { messaggi: [...messaggi], effimeri: [] };
  return { messaggi: messaggi.slice(0, ultimoNonSistema + 1), effimeri: messaggi.slice(ultimoNonSistema + 1) };
}
function riattaccaEffimeri(messaggi, effimeri) {
  if (!Array.isArray(effimeri) || effimeri.length === 0) return messaggi;
  return [...messaggi, ...effimeri];
}
function eRichiestaDellaPersona(m) {
  return m?.role === "user" && typeof m.content === "string" && !m.content.startsWith(MARCATORE_RIASSUNTO);
}
function dividiPerCompattazione(messaggi, { richiesteUtente = RICHIESTE_UTENTE_LETTERALI, scambiChiusi = SCAMBI_CHIUSI_LETTERALI } = {}) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  let fineTesta = 0;
  while (fineTesta < lista.length && eSistema(lista[fineTesta])) fineTesta += 1;
  const testa = lista.slice(0, fineTesta);
  const corpo = lista.slice(fineTesta);
  const inizioScambio = (m) => eRichiestaDellaPersona(m) || m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
  let taglio = 0;
  let vistiScambi = 0;
  for (let i = corpo.length - 1; i >= 0; i -= 1) {
    if (inizioScambio(corpo[i])) {
      vistiScambi += 1;
      if (vistiScambi === scambiChiusi) {
        taglio = i;
        break;
      }
    }
  }
  const mezzo = corpo.slice(0, taglio);
  const coda = corpo.slice(taglio);
  const utentiInCoda = coda.filter(eRichiestaDellaPersona).length;
  const daTenere = Math.max(0, richiesteUtente - utentiInCoda);
  const richiesteLetterali = daTenere === 0 ? [] : mezzo.filter(eRichiestaDellaPersona).slice(-daTenere);
  const tagliabile = mezzo.length >= 2 && mezzo.some((m) => m?.role !== "user");
  return { testa, mezzo, coda, richiesteLetterali, tagliabile };
}
function argomentiComeOggetto(argomenti) {
  if (typeof argomenti === "string") {
    try {
      const o = JSON.parse(argomenti);
      return o && typeof o === "object" ? o : argomenti;
    } catch {
      return argomenti;
    }
  }
  return argomenti && typeof argomenti === "object" ? argomenti : null;
}
function percorsiDaArgomenti(argomenti) {
  const args = argomentiComeOggetto(argomenti);
  if (!args || typeof args !== "object") return [];
  const trovati = [];
  for (const chiave of CHIAVI_PERCORSO) {
    const v = args[chiave];
    if (typeof v === "string" && v.trim()) trovati.push(v.trim());
  }
  return trovati;
}
function provenienzaDellaChiamata(chiamata) {
  const nome = typeof chiamata?.function?.name === "string" && chiamata.function.name ? chiamata.function.name : "attrezzo";
  const args = argomentiComeOggetto(chiamata?.function?.arguments);
  let estratto = "";
  if (args && typeof args === "object") {
    const chiave = [...CHIAVI_COMANDO, ...CHIAVI_PERCORSO].find((k) => typeof args[k] === "string" && args[k].trim());
    estratto = chiave ? String(args[chiave]) : Object.keys(args).length ? JSON.stringify(args) : "";
  } else if (typeof args === "string") estratto = args;
  estratto = oscuraPerRiassunto(String(estratto ?? "").replace(/\s+/g, " ").trim());
  if (estratto.length > CARATTERI_PROVENIENZA) estratto = `${estratto.slice(0, CARATTERI_PROVENIENZA - 1)}…`;
  return estratto ? `${nome} «${estratto}»` : nome;
}
function indiceMeccanico(messaggi, { fileRilettiMassimi = FILE_RILETTI_MASSIMI, precedente = null } = {}) {
  const percorsi = new Set(Array.isArray(precedente?.percorsi) ? precedente.percorsi : []);
  const impronte = new Set(Array.isArray(precedente?.impronte) ? precedente.impronte : []);
  const origini = /* @__PURE__ */ new Map();
  if (precedente?.origini && typeof precedente.origini === "object") {
    for (const [impronta, da] of Object.entries(precedente.origini)) {
      if (impronte.has(impronta) && typeof da === "string" && da) origini.set(impronta, da);
    }
  }
  const errori = new Set(Array.isArray(precedente?.errori) ? precedente.errori : []);
  const suiFile = Array.isArray(precedente?.fileRiletti) ? [...precedente.fileRiletti].reverse() : [];
  const IMPRONTA = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/g;
  const ERRORE = /^\s*(?:\w*error\b|ERR_[A-Z_]+|✗|exit [1-9]\d* \[sandbox\b)/i;
  const chiamatePerId = /* @__PURE__ */ new Map();
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    for (const c of m?.tool_calls ?? []) {
      if (typeof c?.id === "string") chiamatePerId.set(c.id, c);
      const trovati = percorsiDaArgomenti(c?.function?.arguments);
      for (const p of trovati) percorsi.add(p);
      if (ATTREZZI_SUI_FILE.has(c?.function?.name) && trovati[0]) suiFile.push(trovati[0]);
    }
    if (typeof m?.content !== "string" || !m.content) continue;
    if (m.role === "tool" || m.role === "assistant") {
      const da = m.role === "assistant" ? "testo dell'assistente" : m.tool_call_id && chiamatePerId.has(m.tool_call_id) ? provenienzaDellaChiamata(chiamatePerId.get(m.tool_call_id)) : "risultato di un attrezzo";
      for (const hit of m.content.match(IMPRONTA) ?? []) {
        if (impronte.has(hit)) continue;
        if (impronte.size >= IMPRONTE_MASSIME) {
          const piuVecchia = impronte.values().next().value;
          impronte.delete(piuVecchia);
          origini.delete(piuVecchia);
        }
        impronte.add(hit);
        origini.set(hit, da);
      }
      for (const riga2 of m.content.split(/\r?\n/)) {
        if (!ERRORE.test(riga2)) continue;
        const pulita = oscuraPerRiassunto(riga2.trim().slice(0, 200));
        const voce = m.role === "tool" ? `${pulita} ← ${da}` : pulita;
        if (errori.has(voce)) continue;
        if (errori.size >= ERRORI_MASSIMI) errori.delete(errori.values().next().value);
        errori.add(voce);
      }
    }
  }
  const fileRiletti = [];
  for (let i = suiFile.length - 1; i >= 0 && fileRiletti.length < fileRilettiMassimi; i -= 1) {
    if (!fileRiletti.includes(suiFile[i])) fileRiletti.push(suiFile[i]);
  }
  const riga = (titolo, valori) => `- ${titolo}: ${valori.length ? valori.join(" · ") : "(nessuno)"}`;
  const perProvenienza = /* @__PURE__ */ new Map();
  for (const impronta of impronte) {
    const da = origini.get(impronta) ?? "provenienza non registrata (compattazione precedente)";
    if (!perProvenienza.has(da)) perProvenienza.set(da, []);
    perProvenienza.get(da).push(impronta);
  }
  const righeImpronte = impronte.size ? ["- Impronte trovate nei risultati, con ciò che le ha prodotte:", ...[...perProvenienza].map(([da, lista]) => `  · ${da}: ${lista.join(" · ")}`)] : [riga("Impronte trovate nei risultati", [])];
  const testo = [
    MARCATORE_INDICE,
    riga("Percorsi toccati", [...percorsi].slice(0, 60)),
    riga("File da rileggere prima di scriverci (ultimi letti/scritti)", fileRiletti),
    ...righeImpronte,
    riga("Errori visti", [...errori])
  ].join("\n");
  return { testo, percorsi: [...percorsi], impronte: [...impronte], origini: Object.fromEntries(origini), errori: [...errori], fileRiletti };
}
function testoRichiestaDiRiassunto({ paroleMassime = PAROLE_MASSIME_RIASSUNTO, haRiassuntoPrecedente = false } = {}) {
  return [
    "CONTEXT COMPACTION. The conversation above is about to be replaced by your summary: everything you do not",
    "mention is lost. The system messages, the last user requests, the last two exchanges and a mechanical index",
    "of file paths/hashes/errors are kept verbatim by the code — do NOT repeat them, spend your budget on the rest.",
    haRiassuntoPrecedente ? "A previous summary is already in the conversation: MERGE it with what happened after it into one summary." : "",
    "",
    "Write exactly these five sections, keep every heading even when empty:",
    "## Objective — what the person asked for, in their words when possible",
    "## Decisions — choices made and why (including what was tried and rejected)",
    "## Constraints — rules, limits and preferences stated by the person or found in the project",
    "## Done — what is verifiably done, with the real state of the files as you last saw it",
    "## Open — what is still to do, the next single step, and anything unverified",
    "",
    `Budget: at most ${paroleMassime} words in total. Preserve exact file paths, identifiers, error strings and`,
    "numbers. Reply with ONLY the summary. Do not call any tool in this turn."
  ].filter((r) => r !== "").join("\n");
}
function senzaIndice(m) {
  if (m?.role !== "user" || typeof m.content !== "string" || !m.content.startsWith(MARCATORE_RIASSUNTO)) return m;
  const posizione = m.content.indexOf(MARCATORE_INDICE);
  return posizione === -1 ? m : { ...m, content: m.content.slice(0, posizione).trimEnd() };
}
function costruisciRichiestaDiRiassunto({ testa = [], mezzo = [], paroleMassime = PAROLE_MASSIME_RIASSUNTO } = {}) {
  const haRiassuntoPrecedente = mezzo.some((m) => m?.role === "user" && typeof m.content === "string" && m.content.startsWith(MARCATORE_RIASSUNTO));
  return [
    ...testa,
    ...mezzo.map((m) => oscuraMessaggio(senzaIndice(m))),
    { role: "user", content: testoRichiestaDiRiassunto({ paroleMassime, haRiassuntoPrecedente }) }
  ];
}
function valutaRispostaDiRiassunto({ scelta, finishReason } = {}) {
  if (Array.isArray(scelta?.tool_calls) && scelta.tool_calls.length > 0) return { ok: false, riassunto: "", motivo: "attrezzo" };
  if (finishReason !== null && finishReason !== void 0 && finishReason !== "stop") return { ok: false, riassunto: "", motivo: "troncato" };
  const riassunto = oscuraPerRiassunto(String(scelta?.content ?? "").trim());
  if (!riassunto) return { ok: false, riassunto: "", motivo: "vuoto" };
  return { ok: true, riassunto, motivo: null };
}
function costruisciProiezione({ testa = [], richiesteLetterali = [], riassunto = "", indice = "", coda = [] } = {}) {
  const contenuto = [MARCATORE_RIASSUNTO, String(riassunto ?? "").trim(), String(indice ?? "").trim()].filter(Boolean).join("\n\n");
  return [...testa, ...richiesteLetterali, { role: "user", content: contenuto }, ...coda];
}
const FRAZIONE_CODA = 0.2;
const MOLTIPLICATORE_CODA_MORBIDA = 1.5;
const MESSAGGI_RECENTI_INTATTI = 3;
const CARATTERI_INIZIO_ESITO = 1200;
const CARATTERI_FINE_ESITO = 400;
const CARATTERI_MINIMI_RIDUCIBILI = 2e3;
const MARCATORE_ACCORCIATO = "characters omitted to fit the context window";
const ESITO_DOPPIONE = "[Duplicate tool output: identical to a more recent result below, removed to fit the context window]";
function budgetCoda(soglia) {
  const s = Number(soglia);
  return Number.isFinite(s) && s > 0 ? Math.max(1, Math.floor(s * FRAZIONE_CODA)) : 1;
}
function accorciaTesto(testo, { inizio = CARATTERI_INIZIO_ESITO, fine = CARATTERI_FINE_ESITO } = {}) {
  if (typeof testo !== "string" || testo.length < CARATTERI_MINIMI_RIDUCIBILI || testo.length <= inizio + fine) return testo;
  const tolti = testo.length - inizio - fine;
  return `${testo.slice(0, inizio)}
[… ${tolti.toLocaleString("en-US")} ${MARCATORE_ACCORCIATO} (TALOS context projection, not a byte range). Original message kept in session history. Re-read the source if you need the omitted part; do not re-run a command just to recover it.]
${testo.slice(-fine)}`;
}
function accorciaArgomenti(argomenti) {
  if (typeof argomenti !== "string" || argomenti.length < CARATTERI_MINIMI_RIDUCIBILI) return argomenti;
  let oggetto;
  try {
    oggetto = JSON.parse(argomenti);
  } catch {
    return argomenti;
  }
  if (!oggetto || typeof oggetto !== "object" || Array.isArray(oggetto)) return argomenti;
  let cambiato = false;
  const nuovo = {};
  for (const [chiave, valore] of Object.entries(oggetto)) {
    const corto = typeof valore === "string" ? accorciaTesto(valore) : valore;
    if (corto !== valore) cambiato = true;
    nuovo[chiave] = corto;
  }
  return cambiato ? JSON.stringify(nuovo) : argomenti;
}
function riduciAl(lista, i) {
  const m = lista[i];
  if (m?.role === "tool" && typeof m.content === "string") {
    const corto = accorciaTesto(m.content);
    if (corto === m.content) return false;
    lista[i] = { ...m, content: corto };
    return true;
  }
  if (m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
    let cambiato = false;
    const chiamate = m.tool_calls.map((c) => {
      const args = c?.function?.arguments;
      const corti = accorciaArgomenti(args);
      if (corti === args) return c;
      cambiato = true;
      return { ...c, function: { ...c.function, arguments: corti } };
    });
    if (!cambiato) return false;
    lista[i] = { ...m, tool_calls: chiamate };
    return true;
  }
  return false;
}
function riduciCodaSottoPressione(coda, { budgetToken, stima = stimaTokenMessaggi }) {
  const lista = Array.isArray(coda) ? coda : [];
  const tetto = Math.floor(Math.max(1, Number(budgetToken) || 1) * MOLTIPLICATORE_CODA_MORBIDA);
  if (stima(lista) <= tetto) return { coda: lista, ridotti: 0, alMinimo: false, tetto };
  const copia = [...lista];
  let ridotti = 0;
  const rientra = () => stima(copia) <= tetto;
  const visti = /* @__PURE__ */ new Set();
  for (let i = copia.length - 1; i >= 0; i -= 1) {
    const m = copia[i];
    if (m?.role !== "tool" || typeof m.content !== "string" || m.content.length < CARATTERI_MINIMI_RIDUCIBILI) continue;
    if (visti.has(m.content)) {
      copia[i] = { ...m, content: ESITO_DOPPIONE };
      ridotti += 1;
    } else visti.add(m.content);
  }
  if (rientra()) return { coda: copia, ridotti, alMinimo: false, tetto };
  const fineVecchi = Math.max(0, copia.length - MESSAGGI_RECENTI_INTATTI);
  for (let i = 0; i < fineVecchi && !rientra(); i += 1) if (riduciAl(copia, i)) ridotti += 1;
  if (rientra()) return { coda: copia, ridotti, alMinimo: false, tetto };
  let ultimoEsito = -1;
  for (let i = copia.length - 1; i >= 0; i -= 1) if (copia[i]?.role === "tool") {
    ultimoEsito = i;
    break;
  }
  for (let i = 0; i < copia.length && !rientra(); i += 1) if (i !== ultimoEsito && riduciAl(copia, i)) ridotti += 1;
  if (!rientra() && ultimoEsito >= 0 && riduciAl(copia, ultimoEsito)) ridotti += 1;
  return { coda: copia, ridotti, alMinimo: !rientra(), tetto };
}
function creaRecord({ coveredThrough, riassunto, tokenPrima, tokenDopo, misura, at, modello, indice = null }) {
  if (!Number.isInteger(coveredThrough) || coveredThrough < 0) throw new TypeError("coveredThrough deve essere un intero ≥ 0");
  if (!Array.isArray(riassunto)) throw new TypeError("riassunto deve essere una lista di messaggi");
  return {
    schema: SCHEMA_RECORD_COMPATTAZIONE,
    coveredThrough,
    riassunto: riassunto.map((m) => ({ ...m })),
    tokenPrima: Number.isFinite(tokenPrima) ? tokenPrima : null,
    tokenDopo: Number.isFinite(tokenDopo) ? tokenDopo : null,
    misura: misura === "fornitore" ? "fornitore" : "stimato",
    at: typeof at === "string" && at ? at : (/* @__PURE__ */ new Date()).toISOString(),
    modello: typeof modello === "string" ? modello : null,
    indice: indice && typeof indice === "object" ? {
      percorsi: [...indice.percorsi ?? []],
      impronte: [...indice.impronte ?? []],
      origini: indice.origini && typeof indice.origini === "object" ? { ...indice.origini } : {},
      errori: [...indice.errori ?? []],
      fileRiletti: [...indice.fileRiletti ?? []]
    } : null
  };
}
function eRecordValido(record) {
  const r = record;
  return !!r && r.schema === SCHEMA_RECORD_COMPATTAZIONE && Number.isInteger(r.coveredThrough) && r.coveredThrough >= 0 && Array.isArray(r.riassunto);
}
function applicaRecord(storiaGrezza, record) {
  const storia = Array.isArray(storiaGrezza) ? storiaGrezza : [];
  if (!eRecordValido(record) || record.coveredThrough > storia.length) return [...storia];
  return [...record.riassunto, ...storia.slice(record.coveredThrough)];
}
function classificaErroreFornitore(errore) {
  const e = errore;
  const stato = Number(e?.stato ?? e?.status ?? Number.NaN);
  const testo = `${e?.message ?? ""} ${e?.code ?? ""}`;
  if (stato === 413) return "contesto-pieno";
  if (PATTERN_CONTESTO_PIENO.some((p) => p.test(testo))) return "contesto-pieno";
  return null;
}
function reasoningPerRiassunto(reasoning) {
  if (!reasoning || typeof reasoning !== "object" || Array.isArray(reasoning)) return void 0;
  const r = reasoning;
  if (typeof r.effort !== "string") return { ...r };
  if (["none", "minimal", "low"].includes(r.effort)) return { ...r };
  return { ...r, effort: "low" };
}
const compattazione = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ATTREZZI_SUI_FILE,
  CARATTERI_FINE_ESITO,
  CARATTERI_INIZIO_ESITO,
  CARATTERI_MINIMI_RIDUCIBILI,
  ESITO_DOPPIONE,
  FILE_RILETTI_MASSIMI,
  FRAZIONE_CODA,
  FRAZIONE_EMERGENZA,
  FRAZIONE_FINESTRA,
  MARCATORE_ACCORCIATO,
  MARCATORE_INDICE,
  MARCATORE_RIASSUNTO,
  MAX_TOKEN_RIASSUNTO,
  MESSAGGI_RECENTI_INTATTI,
  MOLTIPLICATORE_CODA_MORBIDA,
  MOLTIPLICATORE_EMERGENZA_SENZA_FINESTRA,
  PAROLE_MASSIME_RIASSUNTO,
  RICHIESTE_UTENTE_LETTERALI,
  SCAMBI_CHIUSI_LETTERALI,
  SCHEMA_RECORD_COMPATTAZIONE,
  TETTO_TOKEN_DEFAULT,
  VARIABILE_TETTO_TOKEN,
  accorciaTesto,
  applicaRecord,
  budgetCoda,
  calcolaSoglie,
  classificaErroreFornitore,
  costruisciProiezione,
  costruisciRichiestaDiRiassunto,
  creaRecord,
  decidiCompattazione,
  dividiPerCompattazione,
  eRecordValido,
  eRichiestaDellaPersona,
  indiceMeccanico,
  leggiTettoEsplicito,
  misuraOccupazione,
  oscuraPerRiassunto,
  reasoningPerRiassunto,
  riattaccaEffimeri,
  riduciCodaSottoPressione,
  staccaEffimeri,
  stimaTokenMessaggi,
  testoRichiestaDiRiassunto,
  valutaRispostaDiRiassunto
}, Symbol.toStringTag, { value: "Module" }));
export {
  ESTENSIONI_SORGENTE,
  cancelloSemantico,
  compattazione,
  costruisciCatalogo,
  dichiaratiIn,
  discoNode,
  fontiDaDisco,
  libreriaStandard,
  risolviSimbolo
};
