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
export {
  ESTENSIONI_SORGENTE,
  cancelloSemantico,
  costruisciCatalogo,
  dichiaratiIn,
  discoNode,
  fontiDaDisco,
  libreriaStandard,
  risolviSimbolo
};
