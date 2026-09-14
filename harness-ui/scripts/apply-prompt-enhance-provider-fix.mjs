import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/http-app.mjs', import.meta.url);
let source = await readFile(path, 'utf8');

const importLine = "import { chiediMiglioramentoAlProvider } from './prompt-enhancer-provider.mjs';\n";
if (!source.includes(importLine)) {
  const anchor = "import { validaFallbackProviders } from './model-destination.mjs';\n";
  if (!source.includes(anchor)) throw new Error('Import anchor non trovato in http-app.mjs');
  source = source.replace(anchor, `${anchor}${importLine}`);
}

const start = `        } else {\n          if (!providerStore || typeof providerStore.getKey !== 'function') {\n            const e = new Error('Il portachiavi dei provider non è configurato.'); e.code = 'PROVIDER_STORE_UNAVAILABLE'; throw e;\n          }\n          const chiave = providerStore.getKey('openrouter');`;
const end = `          if (typeof contenuto !== 'string') contenuto = '';\n        }`;

if (source.includes(start)) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (to < 0) throw new Error('Fine blocco Prompt Enhance non trovata in http-app.mjs');
  const replacement = `        } else {\n          const risultato = await chiediMiglioramentoAlProvider({\n            modello: contesto.modello,\n            messaggi,\n            providerStore,\n            fetchFn: fetchMiglioraPromptFn,\n          });\n          contenuto = risultato.contenuto;\n          modelloUsato = risultato.modelloUsato;\n          fornitoreUsato = risultato.fornitoreUsato;\n        }`;
  source = `${source.slice(0, from)}${replacement}${source.slice(to + end.length)}`;
} else if (!source.includes('const risultato = await chiediMiglioramentoAlProvider({')) {
  throw new Error('Il blocco Prompt Enhance non è né vecchio né già corretto');
}

await writeFile(path, source, 'utf8');
