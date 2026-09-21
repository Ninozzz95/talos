// Solo verifica della proposta: nessuna modifica ai file su disco.
import './risolutore-pkl-bis.mjs';
import { registerHooks } from 'node:module';
export const sostituzioni = {
  '/src/http-app.mjs': [
    ['        if (catalogoFornitoriFn) {', "        if (catalogoFornitoriFn && record?.wire !== 'acp') { // P-L-bis: catalogo dell'agente dalla sonda locale."],
    ["  'CATALOG_UPSTREAM_ERROR',", "  'CATALOG_UPSTREAM_ERROR',\n  'CATALOG_CONFIGURATION_REQUIRED', // P-K-bis/P-L-bis: configurazione mancante, non guasto interno."],
    ['  CATALOG_UPSTREAM_ERROR: 503,', '  CATALOG_UPSTREAM_ERROR: 503,\n  CATALOG_CONFIGURATION_REQUIRED: 422,'],
    ["  CATALOG_UPSTREAM_ERROR: 'Catalogo modelli non disponibile',", "  CATALOG_UPSTREAM_ERROR: 'Catalogo modelli non disponibile',\n  CATALOG_CONFIGURATION_REQUIRED: \"Configura i modelli o l'agente esterno in Fornitori e accessi\","],
  ],
  '/src/provider-registry.mjs': [["    catalogo: congela({ fonte: 'processo-esterno', forma: null, percorso: null, inUI: false }),", "    catalogo: congela({ fonte: 'processo-esterno', forma: null, percorso: null, inUI: true }),"]],
};
registerHooks({ load(url, context, nextLoad) {
  const risultato = nextLoad(url, context);
  const coppie = Object.entries(sostituzioni).find(([suffix]) => url.endsWith(suffix))?.[1];
  if (!coppie) return risultato;
  let source = Buffer.isBuffer(risultato.source) ? risultato.source.toString('utf8') : String(risultato.source);
  for (const [prima, dopo] of coppie) {
    if (source.split(prima).length !== 2) throw new Error('Il diff proposto non corrisponde più al file: rileggere la proposta.');
    source = source.replace(prima, dopo);
  }
  return { ...risultato, source };
} });
