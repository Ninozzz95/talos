// Generatore del revisore permessi quinto giro (scritto da zero, prima di leggere quello dell'autore).
// Ogni forma e' un modello con segnaposto ({P},{S},{L},{H},{F} e le grafie POSIX {PU},{SU},{LU},{FU}), riempito per sistema da porta.mjs.
// Idea: una o piu' «mosse» di cartella (cd/pushd/popd/cd -/CDPATH/variabili, scritte anche in modo che la regola non le riconosca),
// mescolate con ogni operatore e composto di bash, avvolte in espansioni, shell per nome, eval, funzioni; in fondo (o in mezzo) una
// cancellazione critica RELATIVA alla cartella corrente, cosi' la carta dipende da dove il lettore crede che sia la cartella.

export function rng(seme) { // mulberry32
  let a = seme >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function crea(seme) {
  const r = rng(seme);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const p = (x) => r() < x;

  const DEST_SU = ['..', '../..', '/', '~', '$HOME', '"$HOME"', '{LU}', '{PU}', '{SU}', 'src', '"$OLDPWD"', '-', '/tmp', '{FU}', '..//', '"$PWD/.."', '${HOME}', '~/', '.'];
  const DEST_W = ['..', '{L}', '{P}', '\\', 'C:\\', '/d {L}', '{F}', '..\\..', '%USERPROFILE%', '$env:USERPROFILE', '{PU}', '{LU}'];
  const NOMI_CD = ['cd', 'cd', 'cd', 'cd', 'pushd', 'builtin cd', 'command cd', '\\cd', '"cd"', "c''d", "'cd'", 'chdir', 'Set-Location', 'sl', 'cd --', 'cd -P', 'cd -L', 'command -p cd'];
  const mossa = (win = false) => {
    const x = r();
    if (x < 0.06) return 'popd';
    if (x < 0.10) return 'cd -';
    if (x < 0.14) return `CDPATH=${pick(['..', '{LU}', '/', '{HU}'.replace('{HU}', '~')])} cd ${pick(['progetto', 'lavori', 'src', '.'])}`;
    if (x < 0.20) { const v = pick(['X', 'D', 'T', 'dir']); return `${v}=${pick(DEST_SU)}; cd "$${v}"`; }
    if (x < 0.23) return `cd ${pick(DEST_SU)} 2>/dev/null`;
    if (x < 0.26) return `pushd ${pick(DEST_SU)} >/dev/null`;
    if (x < 0.28) return `cd "$(dirname "$PWD")"`;
    if (x < 0.30) return `cd \`dirname $PWD\``;
    return `${pick(NOMI_CD)} ${win && p(0.5) ? pick(DEST_W) : pick(DEST_SU)}`;
  };
  const CANC = ['rm -rf *', 'rm -rf .', 'rm -rf ./*', 'rm -fr -- *', 'rm -r -f *', 'rm -rf ./', 'rm -rf "$PWD"', 'rm -rf -- .[!.]* *', 'rd /s /q .', 'rmdir /s /q .',
    'Remove-Item -Recurse -Force *', 'Remove-Item -Recurse -Force .', 'del /s /q *', 'rm -rf ..', 'git clean -fdx', 'find . -delete', 'find . -exec rm -rf {} +', 'xargs rm -rf < lista', 'ls | xargs rm -rf', 'rm -rf $(ls)', 'rm -Rf *', 'command rm -rf *', '\\rm -rf *', 'sudo rm -rf *', 'nohup rm -rf * &>/dev/null', 'rm -rf {*,.*}'];
  const FILL = ['echo ok', 'true', 'npm run dev', 'make', 'sleep 1', 'ls', 'x=1', ':', 'git status', 'node server.js', 'cat a.txt', 'echo "a & b"', "echo 'x;y'", 'echo \\&', 'echo $((1&2))', 'echo ${x:-a&b}', 'grep -r foo .', 'false'];
  const OPS = [' ; ', ' && ', ' || ', ' & ', ' | ', ' |& ', '\n', ' &\n', '; ', '&&', '&', '|'];

  const qSingola = (t) => `'${t.replace(/'/gu, "'\\''")}'`;
  const qDoppia = (t) => `"${t.replace(/[\\"$`]/gu, (c) => `\\${c}`)}"`;

  // una lista di passi; ogni passo e' una mossa, un riempitivo o un composto
  const passo = (prof, win) => {
    const x = r();
    if (prof > 0 && x < 0.30) return composto(prof - 1, win);
    if (x < 0.62) return mossa(win);
    return pick(FILL);
  };
  const lista = (prof, win, n = 1 + Math.floor(r() * 3)) => {
    let s = passo(prof, win);
    for (let i = 1; i < n; i += 1) s += pick(OPS) + passo(prof, win);
    return s;
  };
  const composto = (prof, win) => {
    const c = Math.floor(r() * 30);
    const L = () => lista(prof, win);
    switch (c) {
      case 0: return `( ${L()} )`;
      case 1: return `{ ${L()}; }`;
      case 2: return `if ${pick(['true', 'test -d src', '[[ -d src ]]', '[ -n "$x" ]', '! false', L()])}; then ${L()}; ${p(0.4) ? `elif true; then ${L()}; ` : ''}${p(0.4) ? `else ${L()}; ` : ''}fi`;
      case 3: return `while ${pick(['false', 'true', L()])}; do ${L()}; break; done`;
      case 4: return `until ${pick(['true', 'false'])}; do ${L()}; done`;
      case 5: return `for f in a b; do ${L()}; done`;
      case 6: return `select s in a; do ${L()}; break; done`;
      case 7: return `case ${pick(['$x', 'a', '"$1"'])} in ${pick(['a', '*', '(a|b)', 'a|b'])}) ${L()} ${pick([';;', ';&', ';;&'])} ${p(0.5) ? `*) ${L()} ;; ` : ''}esac`;
      case 8: return `echo \${x:-$(${L()})}`;
      case 9: return `echo "$(${L()})"`;
      case 10: return `echo \`${L().replace(/`/gu, '')}\``;
      case 11: return `echo $[${pick(['1&2', '3 & 1', 'x&&y'])}]`;
      case 12: return `echo $((${pick(['1&2', '3 & 1', '1|2', 'x&&y'])}))`;
      case 13: return `cat <(${L()})`;
      case 14: return `tee >(${L()}) < /dev/null`;
      case 15: return `bash -c ${qSingola(L())}`;
      case 16: return `sh -c ${qDoppia(L())}`;
      case 17: return `eval ${qDoppia(L())}`;
      case 18: return `f() { ${L()}; }; f`;
      case 19: return `bash <<'EOF'\n${L()}\nEOF`;
      case 20: return `bash <<< ${qSingola(L())}`;
      case 21: return `time ${L()}`;
      case 22: return `! ${L()}`;
      case 23: return `coproc { ${L()}; }`;
      case 24: return `wsl ${pick(['-e', '--exec', '--', '-d Ubuntu -e', '--distribution Ubuntu --'])} bash -c ${qSingola(L())}`;
      case 25: return `powershell -c ${qDoppia(lista(prof, true))}`;
      case 26: return `cmd /c "${lista(prof, true).replace(/"/gu, '')}"`;
      case 27: return `echo \${x/\\}/&} ${pick(['', '; ', ' && '])}${L()}`;
      case 28: return `[[ -d src ]] && ${L()}`;
      default: return `exec ${pick(['bash -c', 'sh -c'])} ${qSingola(L())}`;
    }
  };

  /** una forma: prima, la cancellazione relativa, dopo; a volte la cancellazione sta dentro un composto o un involucro */
  return function forma() {
    const win = p(0.15);
    const prof = Math.floor(r() * 3);
    const canc = pick(CANC);
    const prima = lista(prof, win, 1 + Math.floor(r() * 4));
    const sep = pick([' ; ', ' && ', '\n', ' || true; ', ' & ', '; ', ' &&\n']);
    let corpo = `${prima}${sep}${canc}`;
    if (p(0.15)) corpo += pick(OPS) + pick(FILL);
    const y = r();
    if (y < 0.10) corpo = `bash -c ${qSingola(corpo)}`;
    else if (y < 0.16) corpo = `sh -c ${qDoppia(corpo)}`;
    else if (y < 0.20) corpo = `eval ${qSingola(corpo)}`;
    else if (y < 0.23) corpo = `wsl -e bash -c ${qSingola(corpo)}`;
    else if (y < 0.26) corpo = `( ${corpo} )`;
    else if (y < 0.29) corpo = `{ ${corpo}; }`;
    else if (y < 0.31) corpo = `bash <<'EOF'\n${corpo}\nEOF`;
    else if (y < 0.33) corpo = `g() { ${corpo}; }; g`;
    return corpo;
  };
}

export function forme(seme, n) {
  const f = crea(seme);
  const fuori = [];
  for (let i = 0; i < n; i += 1) fuori.push(f());
  return fuori;
}
