import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { copyVendoredAssets } from '../../scripts/copy-vendored-assets.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { createModelCatalog } from '../../../src/model-catalog.mjs';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const prove = path.resolve(frontend, '../.claude/foto-bc43-2026-09-12');
const fase = process.env.BC43_FASE || 'dopo';
if (!['prima', 'dopo'].includes(fase)) throw new Error('Fase BC43 non valida');

export async function costruisci(outputDir) {
  const inizio = performance.now();
  const entryAusiliario = path.join(frontend, 'bc43-componenti.js');
  // Il resolver di Node legge soltanto i file autorizzati. Nessuna modifica ai sorgenti caricati.
  const risultato = await esbuild.build({
    absWorkingDir: frontend, entryPoints: { app: 'src/main.js', avvio: 'src/avvio.js', styles: 'src/styles/main.css', 'bc43-componenti': entryAusiliario },
    outdir: outputDir, bundle: true, format: 'esm', platform: 'browser', target: ['chrome120'],
    charset: 'utf8', legalComments: 'none', minify: false, sourcemap: false, write: false,
    plugins: [{ name: 'lettura-bc43', setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (/^(data:|https?:|\.\/fonts\/)/.test(args.path)) return { path: args.path, external: true };
        const risolto = args.kind === 'entry-point' ? path.resolve(frontend, args.path)
          : args.path.startsWith('.') ? path.resolve(path.dirname(args.importer), args.path)
          : createRequire(args.importer).resolve(args.path);
        return { path: risolto, namespace: 'bc43' };
      });
      build.onLoad({ filter: /.*/, namespace: 'bc43' }, async args => ({
        contents: args.path === entryAusiliario
          ? "export * from './src/components/conversazione.js'; export * from './src/components/context-separator.js';"
          : await readFile(args.path, 'utf8'),
        loader: ({ '.css': 'css', '.html': 'text', '.json': 'json' })[path.extname(args.path)] || 'js',
      }));
    } }], logLevel: 'silent',
  });
  for (const file of risultato.outputFiles) { await mkdir(path.dirname(file.path), { recursive: true }); await writeFile(file.path, file.contents); }
  await cp(path.join(frontend, 'index.template.html'), path.join(outputDir, 'index.html'));
  const asset = await copyVendoredAssets({ frontendRoot: frontend, outputDir });
  return { file: risultato.outputFiles.length + asset.length + 1, durataMs: performance.now() - inizio };
}

export async function avviaBanco() {
  await mkdir(prove, { recursive: true });
  const temporanea = await mkdtemp(path.join(tmpdir(), `talos-phase1-bc43-${fase}-`));
  let build;
  if (process.env.BC43_RIUSA_BUILD === 'si') {
    const precedente = JSON.parse(await readFile(path.join(prove, 'stato-banco.json'), 'utf8'))[fase];
    if (path.dirname(precedente.temporanea) !== path.resolve(tmpdir()) || !path.basename(precedente.temporanea).startsWith('talos-phase1-bc43-')) throw new Error('Build precedente fuori dal Temp del banco');
    for (const nome of ['app.js', 'avvio.js', 'styles.css', 'bc43-componenti.js', 'index.html', 'app-sorgente.js', 'conversazione-sorgente.js']) await cp(path.join(precedente.temporanea, nome), path.join(temporanea, nome));
    await copyVendoredAssets({ frontendRoot: frontend, outputDir: temporanea });
    build = { ...precedente.build, copiataDa: precedente.temporanea };
  } else {
    build = await costruisci(temporanea);
    await cp(path.join(frontend, 'src/legacy/app.js'), path.join(temporanea, 'app-sorgente.js'));
    await cp(path.join(frontend, 'src/components/conversazione.js'), path.join(temporanea, 'conversazione-sorgente.js'));
  }
  const seme = path.join(temporanea, 'seme');
  const store = path.join(temporanea, 'store');
  await mkdir(seme);
  for (const [numero, nome] of [[1, 'Lettura della conversazione'], [2, 'Una seconda conversazione']]) {
    const sessionId = `bc43-prova-${numero}`;
    const testo = Array.from({ length: 28 }, (_, i) => `### Passaggio ${i + 1}\n\nLa conversazione conserva il punto della lettura. Qui troviamo il messaggio e la risposta, nell'ordine in cui sono arrivati.\n\n`).join('');
    const eventi = [
      { tipo: 'intestazione', sessionId, taskId: 'prova', cartella: temporanea, nome, task: { consegna: 'Puoi aiutarmi a rileggere questa conversazione?' }, modello: 'Modello di prova', avviataAlle: '2026-09-12T08:00:00Z' },
      { type: 'RunStarted', threadId: sessionId, runId: 'giro-1', input: { consegna: 'Puoi aiutarmi a rileggere questa conversazione?' } },
      { type: 'TextMessageStart', messageId: 'risposta-1', role: 'assistant' },
      { type: 'TextMessageContent', messageId: 'risposta-1', delta: testo },
      { type: 'TextMessageEnd', messageId: 'risposta-1' },
      { type: 'RunFinished', threadId: sessionId, runId: 'giro-1' },
    ];
    await writeFile(path.join(seme, `${sessionId}.jsonl`), eventi.map(e => JSON.stringify(e)).join('\n') + '\n');
  }
  await cp(seme, store, { recursive: true });
  const cartelle = Object.fromEntries(['Note', 'Attivita', 'Memoria', 'TrustHook', 'TrustMcp', 'TrustPlugin'].map(n => [`cartella${n}`, path.join(temporanea, n)]));
  const registro = createSessionRegistry({ ...cartelle, cartellaStore: store });
  await registro.ripristina();
  const statico = createStaticHandler(temporanea);
  // Catalogo dichiaratamente vuoto nel banco; nessuna rete o inferenza esterna.
  const catalogo = createModelCatalog({ fetchFn: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }) });
  const app = createHttpApp({
    ...cartelle, sessionRegistry: registro,
    catalogoModelliFn: catalogo.ottieni,
    staticHandler: pathname => pathname === '/bc43-componenti.js'
      ? readFile(path.join(temporanea, 'bc43-componenti.js')).then(body => ({ statusCode: 200, contentType: 'text/javascript; charset=utf-8', body }))
      : statico(pathname),
    cartelleFrequentiFn: () => [],
  });
  const server = createServer((richiesta, risposta) => {
    if (richiesta.method === 'POST' && richiesta.url === '/__bc43/chiudi') {
      risposta.writeHead(200); risposta.end('Banco chiuso');
      setImmediate(() => chiudi().catch(errore => { console.error(errore.message); process.exit(1); }));
      return;
    }
    return app(richiesta, risposta);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const porta = server.address().port;
  if (porta === 4174) { server.close(); throw new Error('Porta vietata'); }
  const statoFile = path.join(prove, 'stato-banco.json');
  let stato = {};
  try { stato = JSON.parse(await readFile(statoFile, 'utf8')); } catch { /* prima esecuzione */ }
  stato[fase] = { url: `http://127.0.0.1:${porta}/`, porta, pid: process.pid, temporanea, store, build, sessioni: registro.elenca().length, chiuso: false };
  await writeFile(statoFile, JSON.stringify(stato, null, 2));
  console.log(JSON.stringify(stato[fase]));
  async function chiudi() {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    const corrente = JSON.parse(await readFile(statoFile, 'utf8'));
    corrente[fase].chiuso = true;
    await writeFile(statoFile, JSON.stringify(corrente, null, 2));
    process.exit(0);
  }
  process.on('SIGINT', chiudi);
  process.on('SIGTERM', chiudi);
  process.stdin.on('data', chiudi);
  process.stdin.resume();
}

await avviaBanco();
