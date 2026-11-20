/*
 * Tredicesimo giro della riparazione dei permessi (16/11/2026, owner v1977, giudice v1979, lente v1952) — GLI INSIEMI CON MOLTE VOCI
 * SI PROVANO UNA VOLTA E OGNI VOCE ENTRA NEL CONTO; SU macOS I NOMI SI CONFRONTANO COME APFS; SULLA MEMORIA CONDIVISA DEL TELEFONO
 * ANCHE I GLOB NON BADANO ALLE MAIUSCOLE.
 * Il revisore del dodicesimo giro (ROSSO, 15/11): `a='*[b×4000]'` e `rm -rf ../$a` × 1.000 (10.015 caratteri, cartella di 64 lettere)
 * teneva il cancello 4,1-4,6 s su macOS e Windows contro 0,30-0,39 s della 0.2.1: il confronto provava ogni voce dell insieme per ogni
 * forma del carattere a ogni posizione, e il conto contava le posizioni, non le voci.
 *  - INSIEMI-TEMPO-*: la forma del revisore e le varianti (intervalli, classi, `[!…]`, più pezzi, un comando a tetto quasi pieno) al
 *    cancello intero sotto 0,5 s su W, L, A, M (solo con la CPU sotto il 50 %).
 *  - INSIEMI-CONTO-*: ogni voce provata si conta; la risposta di un insieme per un carattere si calcola una volta; il lavoro del glob
 *    del comando resta sotto k·(lunghezza del comando).
 *  - INSIEMI-TETTO-*: quando le voci passano il tetto del glob la lettura chiede (`troppo-complesso`), mai «nome diverso».
 *  - MAC-UNICODE-*: su macOS (APFS non bada né alla forma Unicode né alle maiuscole) `josé` scritto composto o scomposto, `caffè`,
 *    `ß` contro `SS`, `ẞ`, `İ` nominano lo stesso posto, nei due accessi; su Windows e Linux nessuna carta in più.
 *  - CONDIVISA-MAIUSCOLE-*: sul telefono, nella memoria condivisa (che non bada alle maiuscole), `Documents/W*`, `w/PROG*`, `[W]`
 *    nominano la cartella come `w`; fuori (`/data`, il nome del volume) le maiuscole contano ancora.
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono; la carta risponde «no». Nessuna cancellazione.
 * Fonti (riaperte il 16/11/2026): Apple, APFS Guide FAQ (la variante senza maiuscole non bada alla forma Unicode); Hermes
 * `tools/approval_detection.py:525` (NFKC prima del controllo), `tools/file_operations.py:1197` (NFC), `tools/skills_hub_models.py:336`
 * (`casefold`), `:696` e `:1548-1550` (tetto del lettore); Codex `codex-rs/shell-command/src/bash.rs:272`; Claude Code `CHANGELOG.md:3243`;
 * pi `core/package-manager.ts:680`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const NOME19 = 'AVM-harness-desktop';
const N64 = 'progetto-con-un-nome-lungo-sessantaquattro-lettere-per-la-prova-x'.slice(0, 64);
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};
const CARTELLA64 = { W: `${D}:${BS}w${BS}${N64}`, L: `/home/tizio/projects/${N64}`, A: `/storage/emulated/0/Documents/${N64}`, M: `/Users/tizio/projects/${N64}` };
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];
const P = critiche.__perLeProve;
const mondo = (s, altro = {}) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: altro.home ?? SIS[s].home }, realpathFn: (p) => p, ...altro });
const COMPLESSO = { percorso: null, perche: 'troppo-complesso' };
const SISTEMI = WINDOWS && !SALTA_W ? ['W', 'L', 'A', 'M'] : ['L', 'A', 'M'];

/* la CPU della macchina, tre campioni da un secondo (nodejs.org/api/os.html#oscpus: tempi cumulativi, si fanno le differenze) */
const totali = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { t: a.t + t, i: a.i + c.times.idle }; }, { t: 0, i: 0 });
const campioni = [];
for (let k = 0; k < 3; k += 1) {
  const a = totali();
  await new Promise((ok) => setTimeout(ok, 1000));
  const b = totali();
  campioni.push(Math.round(100 * (1 - (b.i - a.i) / Math.max(1, b.t - a.t))));
}
const SOTTO_CARICO = os.cpus().length === 0 ? 'os.cpus() vuoto: la CPU non si legge' : Math.max(...campioni) >= 50 ? `sotto carico: CPU ${campioni.join('/')}% (serve sotto il 50%)` : false;

/** Il cancello intero su un sistema, nel processo principale (`process.platform` finto fuori da Windows): carte, esito, millisecondi. */
async function cancello(s, comando, livelloAccesso = 'accesso-pieno', { cartella = SIS[s].cartella, home = SIS[s].home } = {}) {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = home; process.env.HOME = home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  const t0 = performance.now();
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 't13', tipo: 'shell', comando }, { livelloAccesso, cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  const ms = performance.now() - t0;
  const carte = chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica);
  return { consentito: esito?.consentito ?? null, perche: carte.map((c) => c.perche), ms };
}

const rip = (x, k, sep = ' ') => Array.from({ length: k }, () => x).join(sep);
/** `r` intervalli tutti diversi, di due punti di codice ciascuno, da `base` in su (ideogrammi: nessuno prende le lettere dei nomi). */
const intervalli = (r, base = 0x4e00) => Array.from({ length: r }, (_, k) => `${String.fromCodePoint(base + 2 * k)}-${String.fromCodePoint(base + 2 * k + 1)}`).join('');
const CLASSI = ['alnum', 'alpha', 'ascii', 'blank', 'cntrl', 'digit', 'graph', 'lower', 'print', 'punct', 'space', 'upper', 'word', 'xdigit'];

/** Le forme del punto 1: la forma del revisore e le varianti (insiemi da circa 4 KiB). */
const FORME = {
  'revisore-b4000x1000': `a='*[${'b'.repeat(4000)}]'; rm -rf ${rip('../$a', 1000)}`,
  'intervalli-uguali': `a='*[${'b-b'.repeat(1300)}]'; rm -rf ${rip('../$a', 1000)}`,
  'intervalli-diversi': `a='*[${intervalli(1300)}]'; rm -rf ${rip('../$a', 1000)}`,
  'classi-posix': `a='*[${rip('[:cntrl:]', 450, '')}]'; rm -rf ${rip('../$a', 1000)}`,
  'classi-tutte': `a='*[${rip(CLASSI.map((c) => `[:${c}:]`).join(''), 40, '')}]Z'; rm -rf ${rip('../$a', 1000)}`,
  'negato': `a='*[!${'b'.repeat(4000)}]Z'; rm -rf ${rip('../$a', 1000)}`,
  'due-pezzi': `a='*[${'b'.repeat(4000)}]'; rm -rf ${rip('../$a/../$a', 500)}`,
  'pezzi-in-fila': `a='*[${intervalli(1300)}]'; rm -rf ${rip('../../$a/$a', 500)}`,
  'tetto-quasi-pieno': `a='*[${intervalli(1300)}]'; b='*[${intervalli(1300, 0x6000)}]'; rm -rf ${rip('../$a ../$b', 600)}`,
};

/* ───────────── il tempo ───────────── */

test('INSIEMI-TEMPO-REVISORE — `a=\'*[b×4000]\'` e `rm -rf ../$a` × 1.000, cartella di 64 lettere: sotto 0,5 s al cancello e senza carta (come la 0.2.1)', { timeout: 600000 }, async () => {
  const c = FORME['revisore-b4000x1000'];
  assert.equal(c.length, 10015);
  for (const s of SISTEMI) {
    await cancello(s, c, 'accesso-pieno', { cartella: CARTELLA64[s] }); // a caldo
    for (const livello of LIVELLI) {
      const r = await cancello(s, c, livello, { cartella: CARTELLA64[s] });
      /* 0.2.4, apice ANSI (Forma 2, giudice v2304 strada a): su Windows il testo con un apostrofo si rilegge ANCHE come lo legge cmd
         (dove `'` non è un apice: `$a` vale `'*[b…]'` con gli apici), nello STESSO tetto del comando: l'espansione arriva a 4.195.240
         caratteri, oltre il tetto di 4.194.304, e la carta è «troppo complesso» (misurato). L A M senza carta, come la 0.2.1. */
      assert.deepEqual(r.perche, s === 'W' ? ['troppo-complesso'] : [], `${s} ${livello}: ${JSON.stringify(r.perche)}`);
      if (!SOTTO_CARICO) assert.ok(r.ms < 500 * MOLTIPLICATORE_CI, `[ceiling ${500 * MOLTIPLICATORE_CI} ms] ${s} ${livello}: ${r.ms.toFixed(0)} ms (CPU ${campioni.join('/')}%)`);
    }
  }
});

test('INSIEMI-TEMPO-VARIANTI — intervalli, classi POSIX, `[!…]`, più pezzi e un comando vicino al tetto: sotto 0,5 s al cancello su ogni sistema', { skip: SOTTO_CARICO, timeout: 900000 }, async () => {
  for (const [nome, c] of Object.entries(FORME)) {
    for (const s of SISTEMI) {
      await cancello(s, c, 'accesso-pieno', { cartella: CARTELLA64[s] });
      const r = await cancello(s, c, 'accesso-pieno', { cartella: CARTELLA64[s] });
      assert.ok(r.ms < 500 * MOLTIPLICATORE_CI, `[ceiling ${500 * MOLTIPLICATORE_CI} ms] ${nome} ${s} [${c.length} car]: ${r.ms.toFixed(0)} ms, carte ${JSON.stringify(r.perche)} (CPU ${campioni.join('/')}%)`);
    }
  }
});

/* ───────────── il conto ───────────── */

test('INSIEMI-CONTO-VOCI — ogni voce provata entra nel conto: un insieme di r intervalli contro un nome di d lettere diverse costa almeno r·d passi', () => {
  const glob = `*[${intervalli(1000)}]`;
  for (const [nome, senzaMaiuscole, forme] of [[NOME19, false, 1], [NOME19, true, 3], [N64, false, 1]]) {
    const d = new Set(nome).size;
    const conto = { glob: 0 };
    assert.equal(P.globPrende(glob, nome, senzaMaiuscole, conto), false);
    assert.ok(conto.glob >= 1000 * d * forme, `«${nome}» ${senzaMaiuscole ? 'senza maiuscole' : ''}: ${conto.glob} passi, le voci provate sono almeno ${1000 * d * forme}`);
  }
});

test('INSIEMI-CONTO-UNA-VOLTA — la risposta di un insieme per un carattere si calcola una volta: 255 volte la stessa lettera costano come una', () => {
  const glob = `*[${intervalli(1000)}]b`;
  for (const senzaMaiuscole of [false, true]) {
    const conto = { glob: 0 };
    assert.equal(P.globPrende(glob, 'a'.repeat(255), senzaMaiuscole, conto), false);
    /* lettura ≤ 4 per carattere, voci 3·1.000 per la sola `a`, confronto ≤ 2·256: ricalcolare a ogni posizione costerebbe 255.000 */
    assert.ok(conto.glob <= 5 * glob.length + 3 * 1000 + 4 * 256, `${conto.glob} passi: l insieme si ricalcola`);
  }
});

test('INSIEMI-RISPOSTE-PER-MAIUSCOLE — la risposta ricordata di un insieme vale solo per lo stesso modo (con o senza maiuscole), nello stesso conto', () => {
  for (const ordine of [[false, true], [true, false]]) {
    const conto = { glob: 0 };
    for (const senzaMaiuscole of ordine) assert.equal(P.globPrende('[W]x', 'wx', senzaMaiuscole, conto), senzaMaiuscole, `ordine ${ordine}: ${senzaMaiuscole}`);
  }
  /* più intervalli diversi nello stesso insieme valgono tutti, anche dopo i doppioni */
  for (const [glob, nome, atteso] of [['[a-cx-z]', 'y', true], ['[a-cx-za-c]', 'b', true], ['[x-za-c]', 'b', true], ['[!a-cx-z]', 'y', false], ['[!a-cx-z]', 'm', true], ['[b-ba-c]', 'a', true]]) {
    assert.equal(P.globPrende(glob, nome, false, { glob: 0 }), atteso, `«${glob}» contro «${nome}»`);
  }
});

test('INSIEMI-RISPOSTE-PER-MAIUSCOLE-NEGATO — un insieme negato senza maiuscole prende il carattere quando UNA delle sue forme è fuori; la risposta ricordata vale per il suo modo, nello stesso conto', () => {
  for (const ordine of [[false, true], [true, false]]) {
    const conto = { glob: 0 };
    /* Revisore del tredicesimo giro (17/11/2026): con le maiuscole la `b` non sta in `A-C` (l insieme negato la prende); senza, la forma
       `b` resta fuori da `A-C` e una shell che bada alle maiuscole la prende: la risposta prudente è «la prende» in tutti e due i modi */
    for (const senzaMaiuscole of ordine) assert.equal(P.globPrende('[!A-C]x', 'bx', senzaMaiuscole, conto), true, `ordine ${ordine}: ${senzaMaiuscole}`);
    /* le due risposte restano distinte per modo: con le maiuscole la `B` sta in `A-C` (non la prende); senza, la forma `b` è fuori (la prende) */
    for (const senzaMaiuscole of ordine) assert.equal(P.globPrende('[!A-C]x', 'Bx', senzaMaiuscole, conto), senzaMaiuscole, `ordine ${ordine}, «Bx»: ${senzaMaiuscole}`);
  }
  /* al contrario: quando TUTTE le forme stanno nell insieme, il negato non prende il carattere nemmeno senza maiuscole */
  for (const senzaMaiuscole of [false, true]) assert.equal(P.globPrende('[!a-cA-C]x', 'bx', senzaMaiuscole, { glob: 0 }), false, `tutte le forme dentro: ${senzaMaiuscole}`);
});

test('INSIEMI-CONTO-NOME — i caratteri del nome confrontato entrano nel conto, una volta per comando', () => {
  const conto = { glob: 0 };
  assert.equal(P.globPrende('Z*', 'a'.repeat(255), false, conto), false);
  const primo = conto.glob;
  assert.ok(primo >= 255, `${primo} passi: i 255 caratteri del nome sono fuori dal conto`);
  assert.equal(P.globPrende('Z*', 'a'.repeat(255), false, conto), false);
  assert.ok(conto.glob - primo <= 2, `il secondo confronto costa ${conto.glob - primo} passi: il nome si riprende`);
});

test('INSIEMI-CONTO-NOME-FRA-GLOB — il nome preso da un glob vale per gli altri glob dello stesso comando, e la prima volta si conta', () => {
  const nome = 'abcdefghijklmnopqrstuvwxy'.repeat(10);
  const conto = { glob: 0 };
  assert.equal(P.globPrende('[Z]*', nome, false, conto), false);
  const primo = conto.glob;
  assert.ok(primo >= nome.length, `${primo} passi: i ${nome.length} caratteri del nome sono fuori dal conto`);
  /* il secondo glob: la lettura (2 passi) e un passo di confronto; riprendere il nome costerebbe altri 250 */
  assert.equal(P.globPrende('Y*', nome, false, conto), false);
  assert.ok(conto.glob - primo <= 4, `il secondo glob costa ${conto.glob - primo} passi: il nome si riprende`);
});

test('INSIEMI-CONTO-COMANDO — al cancello il lavoro del glob delle forme del punto 1 resta sotto 32·(lunghezza del comando)', () => {
  for (const [nome, c] of Object.entries(FORME)) {
    for (const s of SISTEMI) {
      for (const cartella of [CARTELLA64[s], SIS[s].cartella]) {
        const r = P.letturaNuova(c, mondo(s, { cartella }));
        const passi = P.globPassi();
        assert.ok(passi <= 32 * c.length, `${nome} ${s}: ${passi} passi per ${c.length} caratteri (${(passi / c.length).toFixed(1)} a carattere), ${JSON.stringify(r?.perche ?? null)}`);
      }
    }
  }
});

test('INSIEMI-INTERVALLO-ESTREMI — un intervallo prende i suoi due estremi, anche fra altri intervalli e negato', () => {
  for (const [glob, nome, atteso] of [['[a-c]', 'a', true], ['[a-c]', 'c', true], ['[x-za-c]', 'c', true], ['[a-cx-z]', 'z', true], ['[!a-cA-C]', 'c', false], ['[a-c]', 'd', false]]) {
    for (const senzaMaiuscole of [false, true]) assert.equal(P.globPrende(glob, nome, senzaMaiuscole, { glob: 0 }), atteso, `«${glob}» contro «${nome}» ${senzaMaiuscole}`);
  }
  /* il negato con il solo intervallo minuscolo: con le maiuscole l estremo `c` è dentro (non lo prende); senza, la forma `C` è fuori e la risposta prudente è «lo prende» */
  for (const senzaMaiuscole of [false, true]) assert.equal(P.globPrende('[!a-c]', 'c', senzaMaiuscole, { glob: 0 }), senzaMaiuscole, `«[!a-c]» contro «c» ${senzaMaiuscole}`);
});

test('INSIEMI-INTERVALLO-ESTREMI-CANCELLO — sul cancello `[n-p]rogetto` e `[r-t]izio` nominano il progetto e la casa (l estremo alto)', () => {
  for (const [c, uguale] of [['rm -rf /home/tizio/w/[n-p]rogetto', 'rm -rf /home/tizio/w/progetto'], ['rm -rf /home/[r-t]izio', 'rm -rf /home/tizio']]) {
    const atteso = P.letturaNuova(uguale, mondo('L'))?.perche;
    assert.ok(atteso, `«${uguale}» ha la carta`);
    assert.equal(P.letturaNuova(c, mondo('L'))?.perche, atteso, `L «${c}»`);
  }
});

/* `[` seguita da 400 volte «[<x>y» senza nessuna `]`: dopo la prima lettura ogni `[` legge un passo, negata (`!`, `^`) o no */
const quadreAperte = (x) => `[${rip(`[${x}y`, 400, '')}`;

test('INSIEMI-CONTO-NEGATO-APERTO — un insieme negato che non si chiude conta il suo passo come quello non negato', () => {
  const passi = (x) => { const conto = { glob: 0 }; assert.equal(P.globPrende(quadreAperte(x), 'q', false, conto), false); return conto.glob; };
  assert.equal(passi('!'), passi('z'), 'la lettura di `[!y` senza chiusura costa meno di quella di `[zy`: un passo fuori dal conto');
});

test('INSIEMI-CONTO-NEGATO-APERTO-CANCELLO — al cancello, `[^y` senza chiusura conta come `[zy`', () => {
  const passi = (x) => { P.letturaNuova(`rm -rf ../${quadreAperte(x)}`, mondo('L')); return P.globPassi(); };
  assert.equal(passi('^'), passi('z'), 'la lettura di `[^y` senza chiusura costa meno di quella di `[zy`: un passo fuori dal conto');
});

/* ───────────── il tetto ───────────── */

test('INSIEMI-TETTO-CONFRONTO — quando le voci da provare passano il tetto il confronto lancia `GLOB_ILLEGGIBILE`, mai «nome diverso»', () => {
  const glob = `*[${intervalli(1000)}]`;
  for (const senzaMaiuscole of [false, true]) {
    const conto = { glob: 0 };
    assert.equal(P.globPrende(glob, 'zzzz', senzaMaiuscole, conto), false); // modello letto, la `z` provata
    conto.glob = P.TETTO_DEL_GLOB - 500;
    assert.throws(() => P.globPrende(glob, NOME19, senzaMaiuscole, conto), (e) => e?.trabocco === 'glob', 'le voci oltre il tetto chiedono');
    assert.ok(conto.glob <= P.TETTO_DEL_GLOB + 1, `${conto.glob - P.TETTO_DEL_GLOB} passi oltre il tetto`);
  }
});

const trabocco = (e) => e?.trabocco === 'glob';

test('INSIEMI-TETTO-PASSI-DEL-CONFRONTO — i passi del confronto (nome già preso, modello già letto) oltre il tetto lanciano, mai «nome diverso»', () => {
  const conto = { glob: 0 };
  assert.equal(P.globPrende('*z', 'a'.repeat(50), false, conto), false);
  conto.glob = P.TETTO_DEL_GLOB - 5;
  assert.throws(() => P.globPrende('*z', 'a'.repeat(50), false, conto), trabocco, 'i passi oltre il tetto chiedono');
  assert.ok(conto.glob <= P.TETTO_DEL_GLOB + 1, `${conto.glob - P.TETTO_DEL_GLOB} passi oltre il tetto`);
});

test('INSIEMI-TETTO-LETTURA-LUNGHEZZA — un modello più lungo dei passi che restano chiede subito, e il conto si ferma al tetto più uno', () => {
  const glob = `*[${intervalli(1000)}]`;
  for (const senzaMaiuscole of [false, true]) {
    const conto = { glob: P.TETTO_DEL_GLOB - 500 };
    assert.throws(() => P.globPrende(glob, NOME19, senzaMaiuscole, conto), trabocco, 'la lettura oltre il tetto chiede');
    assert.ok(conto.glob <= P.TETTO_DEL_GLOB + 1, `${conto.glob - P.TETTO_DEL_GLOB} passi oltre il tetto`);
  }
});

test('INSIEMI-TETTO-LETTURA-VOCI — le voci di un insieme oltre i passi che restano chiedono, e il conto si ferma al tetto più uno', () => {
  const glob = `*[${intervalli(1000)}]`;
  /* la lunghezza (3.003) e i 1.000 passi delle voci lette ci stanno; il conto delle 1.000 voci da mettere in fila no */
  const conto = { glob: P.TETTO_DEL_GLOB - (glob.length + 1000 + 500) };
  assert.throws(() => P.globPrende(glob, NOME19, false, conto), trabocco, 'le voci oltre il tetto chiedono');
  assert.ok(conto.glob <= P.TETTO_DEL_GLOB + 1, `${conto.glob - P.TETTO_DEL_GLOB} passi oltre il tetto`);
});

/* il nome vuoto, già preso nello stesso conto, non costa passi al confronto: resta solo la lettura del modello a dover chiedere */
const contoColNomeVuoto = () => { const conto = { glob: 0 }; assert.equal(P.globPrende('x', '', false, conto), false); conto.glob = P.TETTO_DEL_GLOB - 500; return conto; };

test('INSIEMI-TETTO-LETTURA-DEL-COMANDO — la lettura di un modello ha solo i passi che il comando non ha ancora speso (un insieme)', () => {
  assert.throws(() => P.globPrende(`*[${intervalli(1000)}]`, '', false, contoColNomeVuoto()), trabocco, 'la lettura usa il tetto intero, non quello che resta');
});

test('INSIEMI-TETTO-LETTURA-DEL-COMANDO-STELLE — la lettura di un modello ha solo i passi che il comando non ha ancora speso (stelle)', () => {
  /* 600 stelle sono una stella sola, che prende il nome vuoto: senza il conto del comando sarebbe «lo stesso nome», senza carta */
  assert.throws(() => P.globPrende('*'.repeat(600), '', false, contoColNomeVuoto()), trabocco, 'la lettura usa il tetto intero, non quello che resta');
});

test('INSIEMI-TETTO-COMANDO — un comando con insiemi grandi e tutti diversi: oltre il tetto la lettura chiede (`troppo-complesso`), mai «nome diverso»', async () => {
  const globi = Array.from({ length: 6 }, (_, k) => `*[${intervalli(1300, 0x4e00 + 4000 * k)}]`);
  const c = `rm -rf ${globi.map((g) => `../${g}`).join(' ')}`;
  /* cartella di 64 lettere (una ventina di lettere diverse): ogni insieme costa circa 3·1.300·20 passi su macOS e Windows */
  for (const s of ['M', ...(SALTA_W ? [] : ['W'])]) {
    assert.deepEqual(P.letturaNuova(c, mondo(s, { cartella: CARTELLA64[s] })), COMPLESSO, `${s} [${c.length} car]: ${P.globPassi()} passi`);
    assert.ok(P.globPassi() <= P.TETTO_DEL_GLOB + 1, `${s}: ${P.globPassi()} passi oltre il tetto`);
    for (const livello of LIVELLI) assert.deepEqual((await cancello(s, c, livello, { cartella: CARTELLA64[s] })).perche, ['troppo-complesso'], `${s} ${livello}`);
  }
});

/* ───────────── macOS: la forma Unicode e il confronto senza maiuscole completo ───────────── */

const NFC = (x) => x.normalize('NFC');
const NFD = (x) => x.normalize('NFD');
const CASI_MAC = [
  ['casa-nfd-comando-nfc', { home: NFD('/Users/josé') }, `rm -rf ${NFC('/Users/josé')}`, 'casa'],
  ['casa-nfc-comando-nfd', { home: NFC('/Users/josé') }, `rm -rf ${NFD('/Users/josé')}`, 'casa'],
  ['casa-nfd-maiuscole', { home: NFC('/Users/josé') }, `rm -rf ${NFD('/Users/JOSÉ')}`, 'casa'],
  ['casa-tilde-nfc', { home: NFD('/Users/josé') }, `rm -rf ${NFC('~josé')}`, 'casa'],
  ['casa-tilde-nfd-maiuscole', { home: NFC('/Users/josé') }, `rm -rf ${NFD('~JOSÉ')}`, 'casa'],
  ['casa-tilde-eszett', { home: '/Users/strauß' }, 'rm -rf ~STRAUSS', 'casa'],
  ['casa-primo-nome-maiuscolo', { home: NFD('/Users/josé') }, `rm -rf ${NFC('/USERS/josé')}`, 'casa'],
  ['progetto-primo-nome-maiuscolo', { cartella: '/Users/tizio/w/caffè' }, 'rm -rf /USERS/tizio/w/caffè', 'progetto'],
  ['casa-glob-nfd', { home: NFD('/Users/josé') }, 'rm -rf /Users/jos?', 'casa'],
  ['progetto-nfd', { cartella: NFD('/Users/tizio/w/caffè') }, `rm -rf ../${NFC('caffè')}`, 'progetto'],
  ['progetto-nfc', { cartella: NFC('/Users/tizio/w/caffè') }, `rm -rf ../${NFD('CAFFÈ')}`, 'progetto'],
  ['progetto-glob-nfd', { cartella: NFD('/Users/tizio/w/caffè') }, 'rm -rf ../CAFF?', 'progetto'],
  ['eszett-contro-ss', { home: '/Users/strauß' }, 'rm -rf /Users/STRAUSS', 'casa'],
  ['ss-contro-eszett', { home: '/Users/strauss' }, 'rm -rf /Users/strauß', 'casa'],
  ['eszett-maiuscola', { home: '/Users/strasse' }, 'rm -rf /Users/STRAẞE', 'casa'],
  ['i-col-punto', { home: '/Users/İlker' }, `rm -rf ${NFD('/Users/i̇LKER')}`, 'casa'],
];
for (const [nome, dove, comando, perche] of CASI_MAC) {
  test(`MAC-UNICODE-${nome} — su macOS (APFS non bada alla forma Unicode né alle maiuscole) «${JSON.stringify(comando).slice(1, -1)}» nomina un posto critico, nei due accessi`, async () => {
    const extra = { ...dove, ...(dove.home ? { ambiente: { HOME: dove.home } } : {}) };
    assert.equal(P.letturaNuova(comando, mondo('M', extra))?.perche, perche, `M lettura nuova «${comando}»`);
    for (const livello of LIVELLI) {
      const r = await cancello('M', comando, livello, { cartella: dove.cartella ?? SIS.M.cartella, home: dove.home ?? SIS.M.home });
      assert.deepEqual(r.perche, [perche], `M ${livello} «${comando}»`);
      assert.equal(r.consentito, false);
    }
  });
}

test('MAC-UNICODE-GUARDIE — su Linux la forma Unicode e `ß` contano ancora; su macOS un nome davvero diverso resta diverso', async () => {
  for (const [home, comando] of [[NFD('/home/josé'), `rm -rf ${NFC('/home/josé')}`], ['/home/strauß', 'rm -rf /home/STRAUSS'], ['/home/strauss', 'rm -rf /home/strauß']]) {
    assert.equal(P.letturaNuova(comando, mondo('L', { home, ambiente: { HOME: home } })), null, `L «${comando}»`);
    assert.deepEqual((await cancello('L', comando, 'accesso-pieno', { home })).perche, [], `L cancello «${comando}»`);
  }
  for (const [home, comando] of [[NFD('/Users/josé'), `rm -rf ${NFC('/Users/josè')}`], ['/Users/strauß', 'rm -rf /Users/STRAUS'], ['/Users/strasse', 'rm -rf /Users/strase']]) {
    assert.equal(P.letturaNuova(comando, mondo('M', { home, ambiente: { HOME: home } })), null, `M «${comando}»`);
  }
});

test('MAC-UNICODE-GUARDIE-W — su Windows (NTFS) `ß` contro `SS` e la forma Unicode restano nomi diversi: nessuna carta in più', { skip: SALTA_W }, () => {
  for (const [home, comando] of [[`${D}:${BS}Users${BS}strauß`, `rd /s /q ${D}:${BS}Users${BS}STRAUSS`], [NFD(`${D}:${BS}Users${BS}josé`), `rd /s /q ${NFC(`${D}:${BS}Users${BS}josé`)}`]]) {
    assert.equal(P.letturaNuova(comando, mondo('W', { home, ambiente: { HOME: home } })), null, `W «${comando}»`);
  }
});

/* ───────────── telefono: la memoria condivisa non bada alle maiuscole, anche nei glob ───────────── */

const DOC = '/storage/emulated/0/Documents';
for (const [nome, comando, uguale] of [['W-stella', `rm -rf ${DOC}/W*`, `rm -rf ${DOC}/w`], ['PROG-stella', `rm -rf ${DOC}/w/PROG*`, `rm -rf ${DOC}/w/progetto`],
  ['insieme-W', `rm -rf ${DOC}/[W]`, `rm -rf ${DOC}/w`], ['relativo', 'rm -rf ../PROGETT?', 'rm -rf ../progetto'], ['classe', `rm -rf ${DOC}/[[:upper:]]`, `rm -rf ${DOC}/w`]]) {
  test(`CONDIVISA-MAIUSCOLE-${nome} — sul telefono «${comando}» nella memoria condivisa nomina la cartella come «${uguale}», nei due accessi`, async () => {
    const atteso = P.letturaNuova(uguale, mondo('A'))?.perche;
    assert.ok(atteso, `«${uguale}» ha la carta`);
    assert.equal(P.letturaNuova(comando, mondo('A'))?.perche, atteso, `A «${comando}»`);
    for (const livello of LIVELLI) {
      const r = await cancello('A', comando, livello);
      assert.deepEqual(r.perche, [atteso], `A ${livello} «${comando}»`);
    }
  });
}

test('CONDIVISA-MAIUSCOLE-GUARDIE — fuori dalla memoria condivisa (`/data`, il nome del volume) e su Linux le maiuscole dei glob contano ancora', () => {
  for (const c of ['rm -rf /data/user/0/ai.talos.dev/FIL*', 'rm -rf /data/user/0/ai.talos.dev/[F]iles', `rm -rf /storage/EMULATED/0/Documents/w`, 'rm -rf /storage/EMUL*/0/Documents/w', `rm -rf ${DOC}/w/PROGETTX*`]) {
    assert.equal(P.letturaNuova(c, mondo('A')), null, `A «${c}»`);
  }
  for (const c of ['rm -rf /home/tizio/w/PROG*', 'rm -rf /home/tizio/[W]']) assert.equal(P.letturaNuova(c, mondo('L')), null, `L «${c}»`);
});
