/*
 * 0.2.4, cura dell'apice ANSI (owner riga 187 «Subito, su tutti e tre»; forma FORMA-CURA-APICE-ANSI-2026-11-19, giudice v2288).
 * Il difetto (già nella 0.2.1 e nella 0.2.3, decimo giro dei permessi riga 3): `x=$'\''; rm -rf ~` passava SENZA carta. Il lettore
 * delle parole (`comandiSemplici`, kernel/cancellazioni-critiche.mjs) saltava il `$` di `$'` e apriva un apice semplice, dove la barra
 * non protegge: il secondo `'` chiudeva, il terzo apriva un apice che si mangiava `; rm -rf ~`, e un apice aperto in fondo si chiudeva
 * in silenzio. Il pavimento dei comandi (`scansiona`, port di Hermes `_scan_shell`) aveva la stessa regola.
 * Regola (manuale di bash 3.1.2.4; POSIX 2024, Issue 8, «Dollar-Single-Quotes»): dentro `$'…'` la barra protegge il carattere dopo
 * e `\xHH`, `\NNN`, `\uHHHH` diventano il carattere; un apice aperto in fondo al testo = «troppo complesso» ⇒ chiede (come Codex,
 * codex-rs/shell-command/src/bash.rs:30-31 e :36-62: un albero con un errore o un `ansi_c_string` non dà mai il sì).
 * ⛔ Niente viene eseguito: solo testo al riconoscitore e al cancello a parole, su cartelle e dischi che non esistono; la carta
 * risponde «no». Nessuna cancellazione. La copia ferma della 0.2.1 non si tocca: qui si prova che da sola continua a non vedere, e
 * che la carta arriva dalla lettura nuova (il doppio controllo chiede se chiede una delle due).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { rilevaComandoSenzaRecupero } from '../src/kernel/pavimento-comandi.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};
const POSIX = ['L', 'A', 'M'];
const SISTEMI = SALTA_W ? POSIX : ['W', ...POSIX];
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];
const P = critiche.__perLeProve;
/* ambiente FINTO, passato come argomento: la funzione non legge mai process.env qui */
const mondo = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home, USERPROFILE: SIS[s].home }, realpathFn: (p) => p });

/** Il cancello intero su un sistema (stesso schema di permessi-variabile-vuota-chiede.test.mjs): carte ed esito. */
async function cancello(s, comando, livelloAccesso) {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 'apice', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return { consentito: esito?.consentito ?? null, carte: chieste.filter((c) => c.cancellazioneCritica).length };
}

/* ── i casi che passavano (misura del 19/11, candidata 79449fa43 e 0.2.3, W L A M) e i vicini ── */
const PASSAVANO = [
  String.raw`x=$'\''; rm -rf ~`,
  String.raw`x=$'\''; rm -rf /`,
  String.raw`x=$'\''; rm -rf ..`,
  String.raw`x=$'\''; rm -rf "$HOME"`,
  String.raw`y=$'a\'b'; rm -rf ~`,
  String.raw`bash -c "x=\$'\\''; rm -rf ~"`,
];
/* la radice scritta in ANSI: `\x2f`, `\057`, `/` sono «/» (fra apici: niente espansione, ma resta la radice) */
const RADICE_IN_ANSI = [String.raw`rm -rf $'\x2f'`, String.raw`rm -rf $'\057'`, String.raw`rm -rf $'/'`];
/* guardie: l'apice scritto in codice NON chiude l'apice ANSI; questi chiedono oggi e devono continuare a chiedere */
const APICE_CODIFICATO = [String.raw`x=$'\x27'; rm -rf ~`, String.raw`x=$'\047'; rm -rf ~`, String.raw`x=$'''; rm -rf ~`];
/* onesti: nessuna carta, prima e dopo */
const ONESTI = [String.raw`IFS=$'\n'; rm -rf build/`, String.raw`sed -i $'s/\'/"/g' a.txt && rm -rf dist`, String.raw`printf $'a\tb'`];

for (const s of POSIX) {
  test(`APICE-${s} — l'apice ANSI non nasconde più la cancellazione critica: la funzione chiede (lettura nuova), la copia ferma da sola no`, () => {
    for (const c of [...PASSAVANO, ...RADICE_IN_ANSI, ...APICE_CODIFICATO]) {
      const r = critiche.cancellazioneCritica(c, mondo(s));
      assert.notEqual(r, null, `${s} «${c}»: deve chiedere`);
    }
    /* doppio controllo: la copia ferma della 0.2.1 non si tocca e continua a non vedere il primo caso; la carta viene dalla nuova */
    assert.equal(P.della021(PASSAVANO[0], mondo(s)), null, `${s}: la copia ferma da sola non vede (ed è intatta)`);
    assert.notEqual(P.letturaNuova(PASSAVANO[0], mondo(s)), null, `${s}: la lettura nuova vede`);
  });
}

test('APICE-ONESTI — gli apici ANSI bilanciati di tutti i giorni non danno carte (L A M; W se c è un disco libero)', () => {
  for (const s of SISTEMI) for (const c of ONESTI) assert.equal(critiche.cancellazioneCritica(c, mondo(s)), null, `${s} «${c}»`);
});

test('APICE-APERTO — un apice rimasto aperto in fondo a un testo che cancella è «troppo complesso»: chiede (L A M)', () => {
  for (const s of POSIX) for (const c of [String.raw`rm -rf dist 'oops`, String.raw`x=$'abc; rm -rf build`]) {
    assert.deepEqual(critiche.cancellazioneCritica(c, mondo(s))?.perche, 'troppo-complesso', `${s} «${c}»`);
  }
});

test('APICE-CMD — sul PC il guscio vero è cmd (`shell: true` = ComSpec): l apostrofo non è un apice, e `rd` dopo `&` chiede', { skip: SALTA_W }, () => {
  for (const c of [`x=$'${BS}'' & rd /s /q ${D}:${BS}`, `echo it's & rd /s /q ${D}:${BS}`, `echo 'a & rd /s /q ${D}:${BS}`]) {
    assert.notEqual(critiche.cancellazioneCritica(c, mondo('W')), null, `W «${c}»`);
  }
  /* al contrario: un percorso con l apostrofo dentro il progetto e un echo con l apostrofo restano senza carta */
  for (const c of [`rd /s /q "${D}:${BS}w${BS}progetto${BS}l'altro"`, "echo it's"]) {
    assert.equal(critiche.cancellazioneCritica(c, mondo('W')), null, `W onesto «${c}»`);
  }
});

/* `powershell -Command` e `pwsh -c` (condizione del giudice v2301): il testo che riceve PowerShell si legge coi SUOI apici, dove l apice
   inverso protegge il carattere dopo (`` a`'b `` è «a'b», nessun apice aperto) e `''` dentro `'…'` è un apostrofo */
const TICK = String.fromCharCode(96);
test('APICE-POWERSHELL-W — `powershell -Command` e `pwsh -c` con l apice inverso davanti a un apostrofo: la cancellazione dopo chiede', { skip: SALTA_W }, () => {
  for (const shell of ['powershell -Command', 'pwsh -c', 'powershell -c', 'pwsh -Command']) {
    const c = `${shell} "echo a${TICK}'b; Remove-Item -Recurse -Force ${D}:${BS}"`;
    assert.notEqual(critiche.cancellazioneCritica(c, mondo('W')), null, `W «${c}»`);
  }
  /* fra le doppie di PowerShell l apice inverso protegge anche `"`: `"a`" b"` è UNA stringa, e il `;` dopo separa */
  const doppie = `pwsh -c 'echo "a${TICK}" b"; Remove-Item -Recurse -Force ${D}:${BS}'`;
  assert.notEqual(critiche.cancellazioneCritica(doppie, mondo('W')), null, `W «${doppie}»`);
  for (const c of [`powershell -Command "echo it''s fine; Get-ChildItem"`, `pwsh -c "echo a${TICK}'b"`]) assert.equal(critiche.cancellazioneCritica(c, mondo('W')), null, `W onesto «${c}»`);
});
for (const s of POSIX) {
  test(`APICE-POWERSHELL-${s} — \`pwsh -c\` e \`powershell -Command\` fuori da Windows: stessa regola, la radice chiede`, () => {
    for (const shell of ['pwsh -c', 'powershell -Command']) {
      const c = `${shell} 'echo a${TICK}'"'"'b; Remove-Item -Recurse -Force /'`;
      assert.notEqual(critiche.cancellazioneCritica(c, mondo(s)), null, `${s} «${c}»`);
      const doppie = `${shell} 'echo "a${TICK}" b"; Remove-Item -Recurse -Force /'`;
      assert.notEqual(critiche.cancellazioneCritica(doppie, mondo(s)), null, `${s} «${doppie}»`);
      /* al contrario: l apice aperto in fondo chiede solo nella shell POSIX; nel testo di PowerShell resta come prima (nessuna carta) */
      const aperto = `${shell} "echo 'it''s; Remove-Item -Recurse build"`;
      assert.equal(critiche.cancellazioneCritica(aperto, mondo(s)), null, `${s} onesto «${aperto}»`);
    }
  });
}

/* Reperto del 19/11 (giudice v2304, punto 5): il NOME del comando scritto in ANSI o spezzato (`$'\x72m'`, `r$'m'`) passava senza carta
   su W L A M, prima e dopo la Forma 2: il primo filtro (`sembraCancellare`) toglie apici e barre ma non decodificava `$'…'`. Su Windows
   `rd` e `del` scritti così non hanno senso (cmd non decodifica `$'…'`, bash non ha `rd` né `del`): si provano solo i comandi POSIX. */
const NOME_IN_ANSI = [String.raw`$'\x72m' -rf /`, String.raw`r$'m' -rf ~`, String.raw`$'\162m' -rf /`, `$'${BS}u0072m' -rf ~`, String.raw`$'r'$'m' -rf /`, String.raw`$'\x72\x6d' -r -f ~`];
test('APICE-NOME-IN-ANSI — `rm` scritto in ANSI o spezzato fra apici ANSI chiede su W L A M; `r\'\'m` chiedeva già e chiede', () => {
  for (const s of SISTEMI) {
    for (const c of NOME_IN_ANSI) assert.notEqual(critiche.cancellazioneCritica(c, mondo(s)), null, `${s} «${c}»`);
    assert.notEqual(critiche.cancellazioneCritica(String.raw`r''m -rf ~`, mondo(s)), null, `${s} «r''m -rf ~»`);
    /* al contrario: un nome in ANSI che non cancella resta senza carta */
    for (const c of [String.raw`$'\x6c\x73' -la`, String.raw`$'\x72m' -f build/a.o`, String.raw`printf $'rm -rf /\n'`]) assert.equal(critiche.cancellazioneCritica(c, mondo(s)), null, `${s} onesto «${c}»`);
  }
});

test('APICE-GUSCIO-ARGOMENTO — il guscio è un argomento del lettore (`gusci`), mai dedotto dal testo: lo stesso testo, gusci diversi', { skip: SALTA_W }, () => {
  const c = `echo it's & rd /s /q ${D}:${BS}`;
  assert.notEqual(P.letturaNuova(c, { ...mondo('W'), gusci: ['cmd'] }), null, 'cmd: l apostrofo non è un apice');
  assert.equal(P.letturaNuova(c, { ...mondo('W'), gusci: ['posix'] }), null, 'posix soltanto: l apostrofo apre un apice e il resto è testo');
  assert.notEqual(P.letturaNuova(c, mondo('W')), null, 'di serie su Windows: cmd E posix (WSL), chiede se una chiede');
  for (const sbagliato of ['cmd', [], ['bash'], null]) {
    assert.deepEqual(P.letturaNuova(c, { ...mondo('W'), gusci: sbagliato }), P.letturaNuova(c, mondo('W')), `gusci ${JSON.stringify(sbagliato)}: quelli di serie`);
    assert.equal(P.letturaNuova('rd /s /q build', { ...mondo('W'), gusci: sbagliato }), null, `gusci ${JSON.stringify(sbagliato)}: un comando onesto resta senza carta`);
  }
});

test('APICE-PAVIMENTO — il pavimento rifiuta `rm -rf ~` anche dietro un apice ANSI, come senza', () => {
  assert.ok(rilevaComandoSenzaRecupero('rm -rf ~'), 'controllo: senza apice rifiuta');
  for (const c of [String.raw`x=$'\''; rm -rf ~`, String.raw`y=$'a\'b'; rm -rf ~`, String.raw`x=$'\''; rm -rf /`]) {
    assert.ok(rilevaComandoSenzaRecupero(c), `«${c}»: rifiuta`);
  }
  for (const c of ONESTI) assert.equal(rilevaComandoSenzaRecupero(c), null, `onesto «${c}»`);
});

for (const s of SISTEMI) {
  test(`APICE-CANCELLO-${s} — col cancello intero, nei due livelli, l apice ANSI dà la carta della cancellazione critica`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    for (const c of PASSAVANO.slice(0, 2)) for (const livello of LIVELLI) {
      const g = await cancello(s, c, livello);
      assert.equal(g.consentito, false, `${s} ${livello} «${c}»: consentito`);
      assert.equal(g.carte, 1, `${s} ${livello} «${c}»: una carta`);
    }
    for (const livello of LIVELLI) assert.equal((await cancello(s, ONESTI[0], livello)).carte, 0, `${s} ${livello}: onesto senza carta`);
  });
}
