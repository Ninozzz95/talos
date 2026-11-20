/* Diviso da `permessi-grafie-senza-disco.test.mjs` (giro unico della riparazione, 12/11/2026): qui le prove di `cancellazioni-critiche.mjs` (GRAFIE-A5, GRAFIE-A6, GRAFIE-A7),
 * con la stessa preparazione; là quelle di `path-policy.mjs`, che si portano sulla CLI anche dove questo modulo non c'è. */
/*
 * Uscita di riparazione (owner 12/11/2026 14:06) — LA GRAFIA «/x/…» SENZA DISCO.
 * Su Windows `/T/casa/.ssh/id_ed25519` dato a un programma nativo (PowerShell, cmd, curl, node, python) è la cartella `\T` del disco
 * corrente, cioè del disco della cartella della sessione; il controllo dei permessi lo leggeva solo come «il disco T:» alla maniera
 * di Git Bash, e in Accesso pieno una credenziale di casa si leggeva dalla shell senza carta; la cancellazione del progetto o della
 * casa scritta così non chiedeva. La cura guarda TUTTE E DUE le letture: quella del sistema e quella di Git Bash e di WSL.
 * Fonti: nodejs.org/api/path.html (`path.resolve`: «If, after processing all given path segments, an absolute path has not yet been
 * generated, the current working directory is used»; «On Windows Node.js follows the concept of per-drive working directory»);
 * msys2.org/docs/filesystem-paths (la conversione vale solo per gli argomenti passati DA una shell MSYS2 a un programma nativo).
 *
 * Tutto finto: casa finta sotto la cartella temporanea, chiavi finte scritte qui, modello finto in locale, la carta risponde «no».
 * Le prove «a parole» usano cartelle che non esistono: sono rosse sul codice senza la cura qualunque sia la cartella temporanea
 * (il difetto era rimasto nascosto perché le prove giravano sotto `C:\Users\…`, che ha più di una lettera).
 * La cancellazione critica si prova SOLO al cancello: nessun comando di cancellazione viene eseguito.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { credenzialeDellaCasaLetta } from '../src/path-policy.mjs';
import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const SEGNO = 'CHIAVE-FINTA-DELLE-GRAFIE';
const LIVELLI = ['accesso-pieno', 'scrittura-progetto', 'su-richiesta'];

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-grafie-')));
const casa = join(radice, 'casa');
const progetto = join(radice, 'progetto');
mkdirSync(join(casa, '.ssh'), { recursive: true });
mkdirSync(join(casa, '.aws'), { recursive: true });
mkdirSync(progetto, { recursive: true });
writeFileSync(join(casa, '.ssh', 'id_ed25519'), `${SEGNO} ssh\n`);
writeFileSync(join(casa, '.aws', 'credentials'), `${SEGNO} aws\n`);
writeFileSync(join(casa, '.npmrc'), `${SEGNO} npmrc\n`);
writeFileSync(join(progetto, 'nota.txt'), 'una nota qualunque\n');
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
const mettiLaCasa = (c) => { process.env.USERPROFILE = c; process.env.HOME = c; dimenticaPercorsiVeri(); };
mettiLaCasa(casa);
test.after(async () => {
  if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(radice);
});

/* il disco dei file finti e le due cartelle «a parole», che non esistono: la prima sotto la radice ha UNA lettera */
const D = radice.slice(0, 1);
const d = D.toLowerCase();
const CASA_A_PAROLE = `${D}:\\Z\\utenti\\casa-a-parole`;
const PROGETTO_A_PAROLE = `${D}:\\q\\lavori\\clienti\\progetto-a-parole`;
const dritte = (p) => p.slice(2).replaceAll('\\', '/'); // `/cartella/…`: la barra in testa, senza la lettera del disco

/** Un giro VERO del nucleo: il modello finto chiama un attrezzo, il cancello decide, l'attrezzo gira solo se nessuno ferma. */
async function giro(cartella, livelloAccesso, chiamata) {
  const chieste = [];
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'k0', type: 'function', function: { name: chiamata.nome, arguments: JSON.stringify(chiamata.argomenti) } }] },
    { role: 'assistant', content: 'fatto', tool_calls: [] }];
  let indice = 0;
  const messaggi = [];
  const fetchDiRete = async (_url, init) => {
    try { messaggi.push(JSON.parse(init?.body ?? '{}').messages ?? []); } catch { /* niente */ }
    const scelta = risposte[Math.min(indice++, risposte.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete, livelloAccesso, consensiSessione: {},
    chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
    /* la shell di Windows, detta dall'ospite: nessuna sonda verso WSL, e il comando è letto da un programma nativo */
    ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }),
  });
  const esito = String((messaggi.at(-1) ?? []).filter((m) => m.role === 'tool').at(-1)?.content ?? '');
  return { chieste, esito };
}

/** Solo il cancello, con qualcuno davanti che dice «no»: quante carte, e con quali segni. */
async function cancello(azione, opzioni) {
  const chieste = [];
  const esito = await verificaPermessoScrittura(azione, { chiediApprovazioneFn: async (a) => { chieste.push(a); return false; }, ...opzioni });
  return { chieste, esito };
}

test('GRAFIE-A5 — la cancellazione critica scritta «/cartella/…» chiede in ogni modo, col segno (solo il cancello: niente viene eseguito)', { skip: !WINDOWS }, async () => {
  mettiLaCasa(CASA_A_PAROLE);
  const p = dritte(PROGETTO_A_PAROLE); // `/q/lavori/clienti/progetto-a-parole`
  const casi = [
    [`Remove-Item -Recurse -Force ${p}`, 'progetto'],
    [`powershell -NoProfile -Command "Remove-Item -Recurse -Force ${p}"`, 'progetto'],
    [`rd /s /q ${p.replaceAll('/', '\\')}`, 'progetto'], // chiedeva già: le barre rovesce
    [`rm -rf ${p}`, 'progetto'],
    [`rm -rf ${p}/`, 'progetto'],
    [`Remove-Item -Recurse -Force /q/lavori/clienti`, 'sopra-il-progetto'],
    [`cd ${p}; Remove-Item -Recurse -Force .`, 'progetto'],
    [`cd /q/lavori/clienti && rd /s /q progetto-a-parole`, 'progetto'],
    [`Remove-Item -Recurse -Force ${dritte(CASA_A_PAROLE)}`, 'casa'],
    /* la lettura di Git Bash non si perde */
    [`rm -rf /${d}${p}`, 'progetto'],
  ];
  for (const [comando, perche] of casi) {
    const critica = cancellazioneCritica(comando, { cartella: PROGETTO_A_PAROLE, home: CASA_A_PAROLE, piattaforma: 'win32', ambiente: {} });
    assert.equal(critica?.perche, perche, `la funzione: ${comando}`);
    assert.equal(critica.percorso.slice(0, 2).toUpperCase(), `${D}:`, `il posto detto sulla carta sta sul disco della sessione: ${comando}`);
    for (const livello of LIVELLI) {
      const { chieste, esito } = await cancello({ tipo: 'shell', comando }, { livelloAccesso: livello, cartella: PROGETTO_A_PAROLE, permessiPerAttrezzo: { shell: 'sempre' } });
      assert.equal(chieste.length, 1, `${livello} con shell «sempre»: una carta per ${comando}`);
      assert.equal(chieste[0].cancellazioneCritica?.perche, perche, `${livello}: il segno sulla carta (${comando})`);
      assert.equal(esito.consentito, false, `${livello}: col «no» il comando non parte`);
    }
    const ospite = await cancello({ tipo: 'shell', comando }, { livelloAccesso: 'su-richiesta', cartella: PROGETTO_A_PAROLE, accessoPienoDellOspite: () => true });
    assert.equal(ospite.chieste[0]?.cancellazioneCritica?.perche, perche, `col pieno dell'ospite la carta porta il segno: ${comando}`);
  }
});

test('GRAFIE-A6 — AL CONTRARIO: le sottocartelle e i posti qualunque scritti «/cartella/…» non prendono la carta della cancellazione', { skip: !WINDOWS }, async () => {
  mettiLaCasa(CASA_A_PAROLE);
  const p = dritte(PROGETTO_A_PAROLE);
  for (const comando of [`Remove-Item -Recurse -Force ${p}/node_modules`, `rm -rf ${p}/dist`, `rd /s /q ${p.replaceAll('/', '\\')}\\build`, `rm -rf /q/altro/roba/vecchia`,
    `rm -rf /${d}${p}/dist`, `cd ${p}; Remove-Item -Recurse -Force node_modules`, 'rm -rf node_modules', 'git clean -fdx']) {
    assert.equal(cancellazioneCritica(comando, { cartella: PROGETTO_A_PAROLE, home: CASA_A_PAROLE, piattaforma: 'win32', ambiente: {} }), null, comando);
    for (const livello of ['accesso-pieno', 'scrittura-progetto']) {
      const { chieste } = await cancello({ tipo: 'shell', comando }, { livelloAccesso: livello, cartella: PROGETTO_A_PAROLE, permessiPerAttrezzo: { shell: 'sempre' } });
      /* 0.2.4 B3 (owner 17/11/2026): in «Scrive nel progetto» `rm -rf /q/…` (il disco Q: per il `rm` di Git) cancella FUORI dal progetto e
         chiede con la carta del fuori, mai la critica; `Remove-Item` e `rd` leggono `\q\…` del disco del progetto, e non chiedono */
      const fuori = livello === 'scrittura-progetto' && /^rm -rf \/q\//u.test(comando)
      assert.equal(chieste.length, fuori ? 1 : 0, `${livello}: ${fuori ? 'la carta del fuori' : 'nessuna carta'} per ${comando}`);
      if (fuori) assert.ok(chieste[0].fuoriDalProgetto && !chieste[0].cancellazioneCritica, comando);
    }
  }
});

test('GRAFIE-A7 — AL CONTRARIO: fuori da Windows non ci sono dischi, e «/T/progetto» resta il progetto (telefono e Linux)', () => {
  for (const piattaforma of ['linux', 'android']) {
    assert.equal(cancellazioneCritica('rm -rf /T/progetto', { cartella: '/T/progetto', home: '/home/persona', piattaforma, ambiente: {} })?.perche, 'progetto', piattaforma);
    assert.equal(cancellazioneCritica('rm -rf /T/progetto/dist', { cartella: '/T/progetto', home: '/home/persona', piattaforma, ambiente: {} }), null, piattaforma);
  }
});
