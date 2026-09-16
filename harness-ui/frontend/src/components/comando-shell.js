/*
 * IL COMANDO DI SHELL, LETTO INVECE CHE INDOVINATO — P0-E, punto 9, 16/09/2026.
 *
 * ⛔ IL DIFETTO. La colonna «Processi» stampava la riga di comando come UNA stringa monospazio
 *   (`.talos-process__cmd`: `white-space:nowrap; text-overflow:ellipsis`). Nella colonna, larga
 *   circa 300 px, di `npm run verify:all --workspace=@talos/harness-ui` si leggeva
 *   `npm run verify:all --work…`: l'ellissi taglia la CODA, cioè proprio dove stanno il bersaglio
 *   e le opzioni. E non c'era niente che dicesse di che comando si trattasse a colpo d'occhio.
 *
 * ⛔ LA STRADA SBAGLIATA, scartata: riconoscere la famiglia con `riga.includes('git')`. Tre
 *   comandi veri la smentiscono subito — `echo "git push"`, `grep npm package.json`,
 *   `cat docker-compose.yml` — e un riconoscitore che sbaglia su un caso così ordinario mette
 *   un'icona FALSA accanto a un comando: peggio di nessuna icona, perché nessuno la ricontrolla.
 *   ⇒ La famiglia si decide sull'ESEGUIBILE PARSATO (il basename del primo token del primo
 *   comando), mai su un pezzo di testo trovato dentro la riga.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RICERCA — 16/09/2026, prima di scrivere (regola zero dell'owner).
 *
 *  · VS Code, «Terminal Shell Integration» (code.visualstudio.com/docs/terminal/shell-integration,
 *    pagina aggiornata il 02/09/2026): le decorazioni di comando sono TRE — errore, successo e
 *    «default» — e nascono dal codice di uscita trasportato da `OSC 633 ; D [; <exitcode>] ST`;
 *    compaiono anche nel righello della barra di scorrimento. ⇒ Due valori (verde/rosso) non
 *    bastano: serve la terza parola per «non lo so ancora», ed è il motivo per cui gli stati della
 *    riga in `inspector.js` sono otto e non due.
 *  · npm `shell-quote` 1.10.0 (registry.npmjs.org, letto il 16/09/2026): MIT, **nessuna dipendenza
 *    di produzione**, `parse()` riconosce gli operatori di controllo `|| && ;; |& <( <<< >> >& <&
 *    & ; ( ) | < >`, i glob e i commenti `#`. Vendorizzato in `src/assets/shell-quote/` (provenienza,
 *    licenza e le due modifiche meccaniche sono scritte lì): niente `npm install` nuovo.
 *    ⛔ L'avviso GHSA-w7jw-789q-3m8p (CVE-2026-9277, giugno 2026) riguarda `quote()`, la funzione
 *    inversa, ed è corretto dalla 1.8.4: qui si vendorizza la sola `parse()` della 1.10.0.
 *  · Alternative pesate e scartate lo stesso giorno: **mvdan-sh** (parser Go via GopherJS — il più
 *    fedele, ma alcuni MB nel pacchetto servito per colorare una riga in una colonna laterale) e
 *    **@ericcornelissen/bash-parser** (AST POSIX completo, ma è un albero di moduli con dipendenze,
 *    non un file).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⛔ QUESTO FILE È L'ADATTATORE, e il parser sta dietro di lui. `shell-quote` dà token e operatori;
 *   «eseguibile / sottocomando / flag / argomento / percorso / URL / operatore» è una lettura
 *   NOSTRA, e vive qui. Se domani il parser cambia, cambia un file solo — e i trenta comandi veri
 *   di `tests/unit/comando-shell.test.mjs` dicono subito se la lettura è ancora quella.
 */

import parse from '../assets/shell-quote/parse.js';

/*
 * ⛔ L'escape di `shell-quote` è la barra rovescia. Qui si MOSTRA un comando, e su Windows — dove
 *   TALOS gira e dove la shell è `cmd` — la barra rovescia è quasi sempre un separatore di
 *   percorso, non un escape: col comportamento di serie `C:\tools\node.exe` diventerebbe
 *   `C:toolsnode.exe`, cioè un percorso che non esiste, a schermo. Si passa un carattere di escape
 *   che in una riga di comando non compare mai (NUL), così la barra rovescia resta quello che è.
 *   Prezzo dichiarato: uno spazio protetto alla POSIX (`file\ con\ spazi`) si spezza in due token.
 */
const SENZA_ESCAPE = '\u0000';

/**
 * ⛔ Le variabili NON si espandono: `$HOME` resta `$HOME`. Col comportamento di serie di
 *   `shell-quote` (`env = {}`) una variabile sconosciuta diventa stringa VUOTA, e a schermo
 *   sparirebbe un pezzo del comando che la persona ha visto girare davvero.
 */
const VARIABILE_A_SE_STESSA = (nome) => `$${nome}`;

/** Le famiglie. ⛔ `generico` non è un buco: è la risposta onesta per un comando che non conosciamo. */
export const FAMIGLIE = Object.freeze([
  'git', 'node', 'python', 'docker', 'test', 'build',
  'server', 'rete', 'filesystem', 'install', 'shell', 'generico',
]);

/**
 * L'icona di ogni famiglia. ⛔ Sono TUTTI id già presenti nello sprite di `index.template.html`
 * (verificati il 16/09/2026 con `grep -o 'id="i-[a-z0-9-]*"'`): un `<use href="#i-…">` che punta a
 * un simbolo inesistente non dà errore, disegna il vuoto — e nessuno se ne accorge.
 */
export const ICONA_FAMIGLIA = Object.freeze({
  git: 'i-git',
  node: 'i-code',
  python: 'i-brain',
  docker: 'i-grid',
  test: 'i-check-sq',
  build: 'i-layout',
  server: 'i-play',
  rete: 'i-globe',
  filesystem: 'i-folder',
  install: 'i-download',
  shell: 'i-terminal',
  generico: 'i-command',
});

/**
 * Come si chiama una famiglia a parole. ⛔ Serve perché l'indicazione non sia SOLO un'icona: chi non
 * distingue i colori, o legge con uno screen reader, deve avere la stessa informazione.
 */
export const NOME_FAMIGLIA = Object.freeze({
  git: 'controllo di versione',
  node: 'JavaScript',
  python: 'Python',
  docker: 'contenitori',
  test: 'prove',
  build: 'compilazione',
  server: 'server',
  rete: 'rete',
  filesystem: 'file e cartelle',
  install: 'installazione',
  shell: 'shell',
  generico: 'comando',
});

/** Gli eseguibili che hanno un sottocomando vero (`git status`, `docker compose`, `npm run`). */
const CON_SOTTOCOMANDO = new Set([
  'git', 'gh', 'hub', 'jj',
  'npm', 'pnpm', 'yarn', 'bun', 'npx', 'deno',
  'docker', 'podman', 'kubectl', 'helm',
  'cargo', 'go', 'rustup',
  'pip', 'pip3', 'poetry', 'uv', 'conda',
  'dotnet', 'apt', 'apt-get', 'brew', 'choco', 'winget', 'scoop',
  'systemctl', 'adb', 'terraform', 'aws', 'gcloud', 'az', 'nvm',
]);

/** Parole che PRECEDONO il comando vero senza esserlo. `sudo docker ps` è un comando docker. */
const PREFISSI = new Set(['sudo', 'doas', 'env', 'time', 'nohup', 'command']);

const GESTORI_PACCHETTI = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx']);

/** L'eseguibile → la famiglia, quando non serve guardare il sottocomando. */
const FAMIGLIA_PER_ESEGUIBILE = new Map(Object.entries({
  git: 'git', gh: 'git', hub: 'git', jj: 'git', tig: 'git',

  node: 'node', nodejs: 'node', deno: 'node', tsx: 'node', 'ts-node': 'node',
  eslint: 'node', prettier: 'node', biome: 'node',

  python: 'python', python3: 'python', py: 'python', pip: 'python', pip3: 'python',
  poetry: 'python', uv: 'python', conda: 'python', ruff: 'python', black: 'python', mypy: 'python',

  docker: 'docker', podman: 'docker', 'docker-compose': 'docker', kubectl: 'docker', helm: 'docker',
  minikube: 'docker', kind: 'docker',

  pytest: 'test', jest: 'test', vitest: 'test', mocha: 'test', ava: 'test', tap: 'test',
  playwright: 'test', cypress: 'test', phpunit: 'test', rspec: 'test', ctest: 'test', gotestsum: 'test',

  make: 'build', gmake: 'build', cmake: 'build', ninja: 'build', msbuild: 'build',
  gradle: 'build', gradlew: 'build', mvn: 'build', ant: 'build', bazel: 'build',
  cargo: 'build', go: 'build', dotnet: 'build', tsc: 'build', swc: 'build',
  webpack: 'build', rollup: 'build', esbuild: 'build', vite: 'build', parcel: 'build',

  serve: 'server', uvicorn: 'server', gunicorn: 'server', flask: 'server', django: 'server',
  nginx: 'server', httpd: 'server', caddy: 'server', rails: 'server', php: 'server',

  curl: 'rete', wget: 'rete', ssh: 'rete', scp: 'rete', sftp: 'rete', rsync: 'rete',
  ping: 'rete', nc: 'rete', netcat: 'rete', netstat: 'rete', dig: 'rete', host: 'rete',
  nslookup: 'rete', telnet: 'rete', traceroute: 'rete', ifconfig: 'rete', ip: 'rete',

  ls: 'filesystem', dir: 'filesystem', tree: 'filesystem', cat: 'filesystem', head: 'filesystem',
  tail: 'filesystem', less: 'filesystem', more: 'filesystem', cp: 'filesystem', mv: 'filesystem',
  rm: 'filesystem', rmdir: 'filesystem', mkdir: 'filesystem', touch: 'filesystem', ln: 'filesystem',
  find: 'filesystem', grep: 'filesystem', rg: 'filesystem', ripgrep: 'filesystem', ag: 'filesystem',
  sed: 'filesystem', awk: 'filesystem', sort: 'filesystem', uniq: 'filesystem', wc: 'filesystem',
  diff: 'filesystem', cut: 'filesystem', tr: 'filesystem', tar: 'filesystem', zip: 'filesystem',
  unzip: 'filesystem', gzip: 'filesystem', gunzip: 'filesystem', chmod: 'filesystem',
  chown: 'filesystem', du: 'filesystem', df: 'filesystem', stat: 'filesystem', realpath: 'filesystem',
  robocopy: 'filesystem', xcopy: 'filesystem', fd: 'filesystem',

  apt: 'install', 'apt-get': 'install', brew: 'install', choco: 'install', winget: 'install',
  scoop: 'install', yum: 'install', dnf: 'install', pacman: 'install', apk: 'install',

  bash: 'shell', sh: 'shell', zsh: 'shell', fish: 'shell', dash: 'shell', ksh: 'shell',
  pwsh: 'shell', powershell: 'shell', cmd: 'shell', echo: 'shell', printf: 'shell',
  export: 'shell', set: 'shell', source: 'shell', which: 'shell', where: 'shell',
  type: 'shell', sleep: 'shell', exit: 'shell', alias: 'shell', history: 'shell', clear: 'shell',
}));

const ASSEGNAZIONE = /^[A-Za-z_][A-Za-z0-9_]*=/u;
const PARE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/iu;
const PARE_PERCORSO = /[/\\]|^\.{1,2}$|^\.[^.]|\.[A-Za-z0-9]{1,8}$/u;
/* ⛔ Le virgolette si rimettono SOLO quando servono: uno spazio, una virgoletta o un metacarattere
   di shell. Non per `$`, `*`, `?` — quelli li si vuole vedere nudi, come li ha scritti chi lancia. */
const VUOLE_VIRGOLETTE = /[\s"'|&;<>()]/u;

/** Gli operatori dopo i quali ricomincia un comando: il token seguente è un ESEGUIBILE. */
const OP_NUOVO_COMANDO = new Set(['|', '||', '&&', ';', ';;', '|&', '&', '(', ')', '<(']);
/** Redirezioni verso un FILE: il token seguente è un percorso. */
const OP_VERSO_FILE = new Set(['>', '>>', '<', '<<<']);
/** Redirezioni verso un DESCRITTORE (`2>&1`): il token seguente è un numero, non un percorso. */
const OP_VERSO_DESCRITTORE = new Set(['>&', '<&']);

/** Il nome nudo di un eseguibile: via il percorso, via l'estensione di Windows, tutto minuscolo. */
export function nomeEseguibile(token) {
  const t = String(token ?? '').trim();
  if (!t) return '';
  const ultimo = t.replace(/\\/gu, '/').split('/').filter(Boolean).pop() || '';
  return ultimo.toLowerCase().replace(/\.(?:exe|cmd|bat|ps1|com)$/u, '');
}

/** La famiglia di un eseguibile, senza guardare i suoi argomenti. */
export function famigliaDaEseguibile(eseguibile) {
  const nome = nomeEseguibile(eseguibile);
  if (!nome) return 'generico';
  return FAMIGLIA_PER_ESEGUIBILE.get(nome) || 'generico';
}

/**
 * La famiglia quando il sottocomando cambia le carte in tavola: `npm install` installa,
 * `npm run build` compila, `cargo test` prova. ⛔ Si guardano solo le PAROLE (i token non-flag) del
 * PRIMO comando: `npm run build | tee log` resta una compilazione.
 */
function raffinaFamiglia(eseguibile, parole, flag) {
  const base = famigliaDaEseguibile(eseguibile);
  const nome = nomeEseguibile(eseguibile);
  const p0 = (parole[0] || '').toLowerCase();
  const p1 = (parole[1] || '').toLowerCase();

  if (GESTORI_PACCHETTI.has(nome)) {
    if (nome === 'npx') {
      /* `npx <strumento>`: il comando vero è lo STRUMENTO, non npx. */
      const dentro = famigliaDaEseguibile(p0);
      return dentro === 'generico' ? 'node' : dentro;
    }
    if (['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'upgrade', 'link'].includes(p0)) return 'install';
    if (p0 === 'test' || p0 === 'prova') return 'test';
    if (['start', 'dev', 'serve', 'preview'].includes(p0)) return 'server';
    if (p0 === 'build') return 'build';
    if (['run', 'run-script', 'exec'].includes(p0)) {
      if (/^(?:test|prova|check|lint|verify)/u.test(p1)) return 'test';
      if (/^(?:build|compila|bundle|dist)/u.test(p1)) return 'build';
      if (/^(?:dev|start|serve|preview|watch)/u.test(p1)) return 'server';
      return 'node';
    }
    return 'node';
  }

  if (nome === 'node' || nome === 'deno' || nome === 'nodejs') {
    /* ⛔ `node --test` è il lanciatore di prove di Node: è un FLAG a cambiare la natura del comando. */
    if (flag.some((f) => f === '--test' || f.startsWith('--test='))) return 'test';
    return 'node';
  }
  if (nome === 'python' || nome === 'python3' || nome === 'py') {
    if (['pytest', 'unittest', 'nose2'].includes(p0)) return 'test';
    return 'python';
  }
  if (nome === 'pip' || nome === 'pip3' || nome === 'poetry' || nome === 'uv' || nome === 'conda') {
    if (['install', 'add', 'sync'].includes(p0)) return 'install';
    return 'python';
  }
  if (nome === 'docker' || nome === 'podman') {
    if (p0 === 'build' || p0 === 'buildx') return 'build';
    return 'docker';
  }
  if (nome === 'cargo') {
    if (p0 === 'test' || p0 === 'bench') return 'test';
    if (p0 === 'add' || p0 === 'install') return 'install';
    return 'build';
  }
  if (nome === 'go') {
    if (p0 === 'test') return 'test';
    if (p0 === 'get' || p0 === 'install') return 'install';
    return 'build';
  }
  if (nome === 'dotnet') {
    if (p0 === 'test') return 'test';
    if (p0 === 'run') return 'server';
    return 'build';
  }
  if (['apt', 'apt-get', 'brew', 'choco', 'winget', 'scoop', 'yum', 'dnf', 'pacman', 'apk'].includes(nome)) {
    return 'install';
  }
  return base;
}

/** Il testo da mostrare per un token: le virgolette tornano dove servono a non cambiare il comando. */
function perMostrare(token) {
  const t = String(token ?? '');
  if (!VUOLE_VIRGOLETTE.test(t)) return t;
  return `"${t.replace(/"/gu, '\\"')}"`;
}

/** Il tipo di un token che non è né eseguibile né bersaglio di una redirezione. */
function tipoDelToken(token) {
  if (token.startsWith('-')) return 'flag';
  if (PARE_URL.test(token)) return 'url';
  if (PARE_PERCORSO.test(token)) return 'percorso';
  return 'argomento';
}

/**
 * Legge una riga di comando e la rende in SEGMENTI con un significato ciascuno.
 *
 * @param {string} riga la riga così come è stata lanciata
 * @returns {{
 *   ok: boolean,
 *   segmenti: Array<{tipo:'eseguibile'|'sottocomando'|'flag'|'argomento'|'percorso'|'url'|'operatore'|'commento'|'grezzo', testo:string}>,
 *   eseguibile: string|null,
 *   sottocomando: string|null,
 *   famiglia: string,
 *   testo: string
 * }}
 *
 * ⛔ `ok:false` non è un errore da nascondere: vuol dire «non l'ho saputo leggere», e allora si
 *   ripiega su un segmento `grezzo` con la riga INTERA. Meglio la riga nuda che una riga inventata.
 */
export function analizzaComando(riga) {
  const grezzo = String(riga ?? '').trim();
  const vuoto = { ok: false, segmenti: [], eseguibile: null, sottocomando: null, famiglia: 'generico', testo: '' };
  if (!grezzo) return vuoto;

  let voci;
  try {
    voci = parse(grezzo, VARIABILE_A_SE_STESSA, { escape: SENZA_ESCAPE });
  } catch {
    /* ⛔ `parse()` LANCIA su una sostituzione malformata (`${}`): è documentato di monte («Bad
       substitution»). Una riga storta non deve buttare giù la colonna dei processi. */
    return { ok: false, segmenti: [{ tipo: 'grezzo', testo: grezzo }], eseguibile: null, sottocomando: null, famiglia: 'generico', testo: grezzo };
  }
  if (!Array.isArray(voci) || voci.length === 0) return { ...vuoto, segmenti: [{ tipo: 'grezzo', testo: grezzo }], testo: grezzo };

  const segmenti = [];
  const parole = [];      // i token non-flag del PRIMO comando, in ordine
  const indiciParole = []; // dove stanno, per poterli ritipizzare a sottocomando
  const flag = [];
  let eseguibile = null;
  let attesa = 'eseguibile'; // 'eseguibile' | 'percorso' | 'descrittore' | 'libera'
  let primoComando = true;

  for (const voce of voci) {
    if (voce && typeof voce === 'object') {
      if (typeof voce.comment === 'string') {
        segmenti.push({ tipo: 'commento', testo: `#${voce.comment.replace(/\s+$/u, '')}` });
        continue;
      }
      if (voce.op === 'glob') {
        /* Un glob è ciò che il comando andrà a toccare: è un percorso, anche se non esiste ancora. */
        segmenti.push({ tipo: attesa === 'eseguibile' ? 'eseguibile' : 'percorso', testo: String(voce.pattern ?? '') });
        if (attesa === 'eseguibile') attesa = 'libera';
        else if (attesa !== 'libera') attesa = 'libera';
        else if (primoComando) { parole.push(String(voce.pattern ?? '')); indiciParole.push(segmenti.length - 1); }
        continue;
      }
      if (typeof voce.op === 'string') {
        segmenti.push({ tipo: 'operatore', testo: voce.op });
        if (OP_NUOVO_COMANDO.has(voce.op)) { attesa = 'eseguibile'; primoComando = false; }
        else if (OP_VERSO_FILE.has(voce.op)) attesa = 'percorso';
        else if (OP_VERSO_DESCRITTORE.has(voce.op)) attesa = 'descrittore';
        else attesa = 'libera';
        continue;
      }
      continue;
    }

    const token = String(voce ?? '');
    if (!token) continue;

    if (attesa === 'eseguibile') {
      if (ASSEGNAZIONE.test(token)) {
        /* `FOO=1 pytest`: l'assegnazione precede il comando e non è il comando. */
        segmenti.push({ tipo: 'argomento', testo: perMostrare(token) });
        continue;
      }
      segmenti.push({ tipo: 'eseguibile', testo: perMostrare(token) });
      const nome = nomeEseguibile(token);
      if (PREFISSI.has(nome)) continue; // `sudo`, `env`, `time`: il comando vero viene dopo
      if (eseguibile === null) eseguibile = token;
      attesa = 'libera';
      continue;
    }

    if (attesa === 'percorso') {
      segmenti.push({ tipo: 'percorso', testo: perMostrare(token) });
      attesa = 'libera';
      continue;
    }

    if (attesa === 'descrittore') {
      /* `2>&1`: l'uno è un descrittore di file, non un percorso. Dirlo percorso sarebbe una bugia. */
      segmenti.push({ tipo: 'argomento', testo: perMostrare(token) });
      attesa = 'libera';
      continue;
    }

    const tipo = tipoDelToken(token);
    segmenti.push({ tipo, testo: perMostrare(token) });
    if (primoComando) {
      if (tipo === 'flag') flag.push(token);
      else { parole.push(token); indiciParole.push(segmenti.length - 1); }
    }
  }

  /*
   * Il sottocomando: la PRIMA parola dopo l'eseguibile, e solo per gli eseguibili che ne hanno
   * davvero uno. ⛔ `make install` non ha un sottocomando «install»: `make` prende bersagli, non
   * verbi — chiamarlo sottocomando darebbe un nome a una cosa che non esiste.
   */
  let sottocomando = null;
  if (eseguibile && CON_SOTTOCOMANDO.has(nomeEseguibile(eseguibile)) && parole.length) {
    const candidato = parole[0];
    if (!PARE_URL.test(candidato) && !PARE_PERCORSO.test(candidato)) {
      sottocomando = candidato;
      const dove = indiciParole[0];
      if (segmenti[dove]) segmenti[dove].tipo = 'sottocomando';
    }
  }

  const famiglia = eseguibile ? raffinaFamiglia(eseguibile, parole, flag) : 'generico';
  return {
    ok: true,
    segmenti,
    eseguibile: eseguibile ? nomeEseguibile(eseguibile) : null,
    sottocomando,
    famiglia,
    testo: segmenti.map((s) => s.testo).join(' '),
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** L'icona della famiglia, come `<svg><use href="#i-…"></svg>`. */
export function iconaComando(d, famiglia) {
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'i i--sm talos-cmd__icona');
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${ICONA_FAMIGLIA[famiglia] || ICONA_FAMIGLIA.generico}`);
  svg.append(use);
  return svg;
}

/**
 * Il comando disegnato: uno `<span>` per segmento, con la sua classe.
 *
 * ⛔ Mai `innerHTML`: la riga di comando arriva dal modello, e una stringa come `<img onerror=…>`
 *   deve restare testo letterale. Ogni nodo si costruisce con `createElement`/`createTextNode`.
 * ⛔ Gli spazi fra un segmento e l'altro sono nodi di testo veri e non margini CSS: chi seleziona la
 *   riga e la incolla nel terminale deve ritrovare un comando, non le parole attaccate.
 */
export function disegnaComando(d, riga, analisi = null) {
  const a = analisi || analizzaComando(riga);
  const frammento = d.createDocumentFragment();
  if (!a.segmenti.length) { frammento.append(d.createTextNode('—')); return frammento; }
  a.segmenti.forEach((s, i) => {
    if (i > 0) frammento.append(d.createTextNode(' '));
    const span = d.createElement('span');
    span.className = `talos-cmd__${s.tipo}`;
    span.textContent = s.testo;
    frammento.append(span);
  });
  return frammento;
}
