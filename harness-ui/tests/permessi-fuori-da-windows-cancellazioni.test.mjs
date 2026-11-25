/* Diviso da `permessi-fuori-da-windows.test.mjs` (giro unico della riparazione, 12/11/2026): qui le prove di `cancellazioni-critiche.mjs` (FUORI-W4),
 * con la stessa preparazione; là quelle di `path-policy.mjs`, che si portano sulla CLI anche dove questo modulo non c'è. */
/*
 * Uscita di riparazione, giro 2 (12/11/2026, revisore C «blocca 3»; giudice v1686) — FUORI DA WINDOWS NON CAMBIA NIENTE.
 * La prima cura leggeva `\cartella\file` come un percorso senza disco anche su Linux, Android e macOS, dove la barra rovescia è
 * un carattere qualunque di un nome: 724 chiamate su 73.728 rispondevano diverso dalla 0.2.1 (rifiuti e divieti in più).
 * `path-policy.mjs` legge `process.platform` e `node:path` da sé: qui se ne fa un GEMELLO a parole in una cartella temporanea
 * (`node:path` → `node:path/posix`, `process.platform` → 'linux'), come ha fatto il revisore, e gli si chiedono le risposte che dà
 * la 0.2.1. `cancellazioni-critiche.mjs` prende la piattaforma per argomento: lì si prova il modulo vero.
 * Le attese sono quelle della base 5e9fdc1b9 (misurate col gemello della base il 12/11/2026): la prova è verde sulla base, rossa
 * sulla prima cura 985ff74ba. Il disco non si tocca: i percorsi sono solo parole e le letture sono finte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BS = String.fromCharCode(92);
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-gemello-')));
mkdirSync(join(radice, 'src', 'kernel'), { recursive: true });
/* 0.2.4: `path-policy.mjs` legge `$'…'` col lettore unico del nucleo (`kernel/apici-ansi-c.mjs`, soli builtin): va nel gemello anche lui.
   Riga 199 (0.2.5): e riconosce la rete dal testo con `kernel/file-namespace-contract.mjs` (soli builtin): anche lui nel gemello. */
for (const nome of ['path-policy.mjs', 'forme-di-segreto.mjs', 'kernel/apici-ansi-c.mjs', 'kernel/file-namespace-contract.mjs']) {
  const testo = readFileSync(join(SRC, nome), 'utf8');
  writeFileSync(join(radice, 'src', nome), testo.replaceAll("from 'node:path'", () => "from 'node:path/posix'").replaceAll('process.platform', () => "'linux'"));
}
const linux = await import(pathToFileURL(join(radice, 'src', 'path-policy.mjs')).href);
test.after(async () => { await rimuoviCartellaDiProvaAttesa(radice); });

const enoent = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
const fsFinto = { lstatSync: enoent, readlinkSync: enoent };
const CASA = '/home/u';
const PROGETTO = '/home/u/proj';
const BLOCCATI = ['/home/u/proj/privata', '/blocc', '/mnt/c/Users/u/Documents'];
const tale = (p) => p;
const letta = (tipo, testo, cartella = PROGETTO, casa = CASA) => linux.credenzialeDellaCasaLetta({ tipo, ...(tipo === 'shell' ? { comando: testo } : { percorso: testo }), cartella, home: casa, fsSync: fsFinto, statFn: enoent, elencaFn: () => [] });
const bloccata = (percorso, cartella = PROGETTO) => linux.bloccataDa(percorso, { cartella, bloccati: BLOCCATI, realpathFn: tale });
const nomina = (comando, cartella = PROGETTO) => linux.comandoNominaUnaBloccata(comando, { cartella, bloccati: BLOCCATI, realpathFn: tale });
const scrive = (percorso, cartella = PROGETTO) => linux.scritturaDiUnaCredenziale(percorso, { cartella, home: CASA, realpathFn: tale });

test('FUORI-W4 — le cancellazioni critiche su Linux, Android e macOS: il disco di Windows non c\'entra, e le risposte restano quelle', () => {
  for (const piattaforma of ['linux', 'android', 'darwin']) {
    const mondo = { cartella: PROGETTO, home: CASA, piattaforma, ambiente: {}, realpathFn: tale };
    assert.deepEqual(cancellazioneCritica('rm -rf /home/u', mondo), { percorso: '/home/u', perche: 'casa' }, piattaforma);
    assert.deepEqual(cancellazioneCritica('cd .. && rm -rf proj', mondo), { percorso: '/home/u/proj', perche: 'progetto' }, piattaforma);
    assert.deepEqual(cancellazioneCritica('rm -rf /', mondo)?.percorso, '/', piattaforma);
    /* una parola che su Windows cambierebbe disco qui è un comando qualunque; `a:/x` e `/a/b` sono nomi qualunque */
    for (const comando of ['C: && rm -rf build', 'rm -rf a:/x', 'rm -rf /a/b/c', `rm -rf ${BS}home${BS}u`, 'cd /a && rm -rf b/c', 'rm -rf //home//u//proj//build']) {
      assert.equal(cancellazioneCritica(comando, mondo), null, `${piattaforma}: ${comando}`);
    }
  }
});

/* Giro piccolo dopo il controllore (13/11/2026): la cura di `%ComSpec%` e del `cd` che non resta vale SOLO su Windows. Fuori da Windows
   le risposte restano quelle della 0.2.1: un limite fissato qui (come PERM-D27), perché ciò che tocca il telefono lo approva prima il Mobile.
   R15 (13/11/2026, giudice v1757 f, sì dell'owner alle 12:25): la regola di bash del sottofondo vale anche fuori da Windows, dove il comando
   lo esegue davvero una shell POSIX; `$COMSPEC` resta un nome qualunque. */
test('FUORI-W5 — su Linux, Android e macOS `$COMSPEC` non diventa cmd, e un `cd` in sottofondo, in una sottoshell o in una pipe di bash non resta (R15)', () => {
  for (const piattaforma of ['linux', 'android', 'darwin']) {
    const mondo = { cartella: PROGETTO, home: CASA, piattaforma, ambiente: {}, realpathFn: tale };
    assert.equal(cancellazioneCritica('$COMSPEC /c rd /s /q .', mondo)?.perche, 'troppo-annidato', piattaforma);
    assert.equal(cancellazioneCritica('$COMSPEC /c "rd /s /q ."', mondo), null, piattaforma);
    for (const comando of ['bash -c "cd /tmp/x & rm -rf *"', 'bash -c "(cd /tmp/x) && rm -rf *"', 'sh -c "cd /tmp/x | true; rm -rf *"']) {
      assert.equal(cancellazioneCritica(comando, mondo)?.perche, 'progetto', `${piattaforma}: ${comando}`);
    }
  }
});
