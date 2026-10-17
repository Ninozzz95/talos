// L3-9: in un PROCESSO a parte (qui si cambia `process.env`), nell'ordine di `server.mjs`: prima il valore di serie del desktop,
// poi l'adattatore del runtime. Stampa quale modulo l'adattatore SENZA `modulePath` andrebbe a caricare.
const { KERNEL_DI_SERIE_DESKTOP } = await import('../../src/kernel-di-serie-desktop.avvio.mjs');
const { createOwnerRuntimeAdapter } = await import('../../src/runtime-owner-adapter.mjs');
let chiesto = null;
const adattatore = createOwnerRuntimeAdapter({ importFn: async (specifier) => { chiesto = specifier; return { leggiPagina: async () => 'ok' }; } });
try { await adattatore.leggiPagina('https://example.com/'); } catch { /* interessa solo che cosa ha chiesto di caricare */ }
process.stdout.write(JSON.stringify({ applicato: KERNEL_DI_SERIE_DESKTOP.applicato, variabile: process.env.TALOS_OWNER_RUNTIME_MODULE ?? null, chiesto }));
