/*
 * Generatore di forme casuali della shell per la prova di proprietà del cancello delle cancellazioni critiche (13/11/2026, quinto giro
 * della riparazione dei permessi: «la regola del sottofondo può solo AGGIUNGERE carte»). Ogni forma mette insieme `cd` verso la radice
 * del progetto, più su e fuori, i separatori `&`, `&&`, `||`, `;`, `|` e l'a capo, `( )` e `{ }`, `if`/`while`/`until`/`for`/`select`/
 * `case`, le espansioni `${…}`, `$(…)`, `$[…]` e gli apici inversi, barre e virgolette, `bash -c`/`sh -c` e la here-string, e finisce
 * con una cancellazione critica (`rm -rf *`, `.`, `./*`, `..`, `../*`). È solo testo: niente viene eseguito.
 * Il seme rende la serie riproducibile (mulberry32, un intero a 32 bit). I segnaposti `{P}` (progetto), `{S}` (sua `src`), `{L}` (sua
 * madre) e `{F}` (una cartella fuori) si riempiono per sistema con `riempi`.
 * Fonti (lette il 13/11/2026): man7.org/linux/man-pages/man1/bash.1.html — Pipelines («Each command in a multi-command pipeline,
 * where pipes are created, is executed in a subshell»), Lists («If a command is terminated by the control operator &, the shell
 * executes the command in the background in a subshell»), Compound Commands, Parameter Expansion, Arithmetic Expansion, QUOTING.
 */

/** mulberry32: un generatore piccolo e riproducibile, ogni chiamata un numero in [0, 1). */
export function generatoreDiNumeri(seme) {
  let s = seme >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BS = String.fromCharCode(92);
const BT = String.fromCharCode(96);
/** Dove va un `cd`: la radice del progetto, più su, sotto, fuori, la radice del sistema, la casa, il ritorno. */
const DOVE = ['..', '../..', 'src', 'src/deep', '{F}', '{P}', '{L}', '{S}', '/', '~', '-', '"{P}"', `${BS}.${BS}.`];
/** I pezzi che spostano, ognuno col suo modo di restare o non restare nella shell di chi viene dopo. */
const PEZZI = [
  (x) => `cd ${x}`,
  (x) => `cd ${x} &`,
  (x) => `cd ${x} | true`,
  (x) => `(cd ${x})`,
  (x) => `{ cd ${x}; }`,
  (x) => `(cd ${x} &)`,
  (x) => `{ cd ${x}; } | cat`,
  (x) => `if true; then cd ${x}; fi`,
  (x) => `while true; do cd ${x}; break; done`,
  (x) => `until false; do cd ${x}; break; done`,
  (x) => `for i in 1; do cd ${x}; done`,
  (x) => `select i in 1; do cd ${x}; break; done`,
  (x) => `case a in a) cd ${x} ;; esac`,
  (x) => `case a in (a) cd ${x} ;; esac`,
  (x) => `if true; then cd ${x}; fi | cat`,
  (x) => `for i in 1; do cd ${x}; done &`,
  (x) => `pushd ${x}`,
  (x) => `cd ${x} && true`,
];
/** I pezzi che non spostano ma hanno un `&` (vero o finto), una parentesi o una graffa che una lettura sbrigativa può fraintendere. */
const RUMORI = [
  `echo \${x/${BS}}/&}`, `echo \${x//${BS}}/&}`, `echo \${x:-${BS}}&}`, `echo \${x%${BS}}&}`, 'echo ${x:-a&b}', 'echo "${x:-}&}"',
  'echo $[1&1]', 'echo $[ 1 & 2 ]', 'x=$[1&1]', `x=$(echo ${BS}) & )`, 'x=$(true &)', 'echo "$(echo &)"', `echo ${BT}true &${BT}`,
  'echo "a&b"', `echo a${BS}&b`, `echo a${BS}${BS}&b`, 'cat <&0', 'true <&-', 'true 2>&1', 'true &>/dev/null',
  'true &', 'sleep 1 &', 'make & wait', 'npm run dev &', '(true &)', '{ make & wait; }', 'case a in a) true & ;; esac',
  'if make & then true; fi', 'while false & do break; done', 'until true & do break; done', 'for i in 1; do true & done',
  'cat <<< "a&b"', 'echo }', 'echo $((1&1))', '(( 1 & 1 ))', 'true |& cat', 'time true &', '! true &',
];
const GIUNTI = ['; ', ' && ', ' || ', ' & ', ' | ', '\n'];
const ULTIMI = ['; ', ' && ', '\n', ' & ', ' || '];
const FINE = ['rm -rf *', 'rm -rf .', 'rm -rf ./*', 'rm -rf ..', 'rm -rf ../*'];
const AVVOLTI = [
  (t) => t,
  (t) => `bash -c '${t}'`,
  (t) => `sh -c '${t}'`,
  (t) => `bash -c "${t}"`,
  (t) => `bash <<< '${t}'`,
  (t) => `bash -c 'bash -c "${t}"'`,
];

/** `n` forme dal seme: ognuna 1-4 pezzi (spostamenti o rumori) uniti a caso, poi la cancellazione, poi forse un involucro. */
export function formeCasuali(seme, n) {
  const caso = generatoreDiNumeri(seme);
  const uno = (a) => a[Math.floor(caso() * a.length)];
  const forme = [];
  for (let k = 0; k < n; k += 1) {
    const pezzi = [];
    const quanti = 1 + Math.floor(caso() * 4);
    for (let j = 0; j < quanti; j += 1) pezzi.push(caso() < 0.6 ? uno(PEZZI)(uno(DOVE)) : uno(RUMORI));
    let testo = pezzi[0];
    for (let j = 1; j < pezzi.length; j += 1) testo += uno(GIUNTI) + pezzi[j];
    testo += uno(ULTIMI) + uno(FINE);
    forme.push(uno(AVVOLTI)(testo));
  }
  return forme;
}

/** I segnaposti riempiti con le cartelle di un sistema (`{P}`, `{S}`, `{L}`, `{F}`). */
export const riempi = (testo, m) => testo.replace(/\{([PSLF])\}/gu, (x, k) => m[k] ?? x);
