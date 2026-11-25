/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — LE CARTE SU 20 COMANDI TIPICI, PRIMA E DOPO (decisione 375: nessuna carta deve sparire).
 *   Per ogni comando una firma: le carte chieste dal cancello del nucleo (`verificaPermessoScrittura`, con la cartella al posto del suo
 *   nome), le risposte di `ePercorsoDiControllo`, `scritturaDiUnaCredenziale`, `cancellazioneCritica`, `comandoNominaUnaBloccata`, e per
 *   i comandi git il giro intero (carte chieste e comandi partiti). Con `R199_CARTE=<file>` le firme si scrivono su quel file: la stessa
 *   prova sulla candidata e sulla cura dà due file da confrontare riga per riga (l'unica differenza attesa è il comando 15).
 *   Qui si fissano le carte che NON devono sparire (i rossi del primo tentativo). Disco spiato, ospite inventato, nessuna rete.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { verificaPermessoScrittura, talosLavora } = await import('../src/kernel/talosHarness.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { ePercorsoDiControllo, scritturaDiUnaCredenziale, comandoNominaUnaBloccata } = await import('../src/path-policy.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const processi = (await import('node:child_process')).default;
const { B, OSPITE, NAS, unc } = S;

const suC = { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir()) || !/^C:/iu.test(homedir())) && 'solo Windows, col profilo di prova su C:' };
const W = 'scrittura-progetto';
const P = 'accesso-pieno';
const chiama = (nome, argomenti) => ({ id: 'g', type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });

async function giro(cartella, chiamata, livelloAccesso) {
  let n = 0;
  const domande = [];
  const prima = S.distruttivi.length + S.eseguiti.length;
  await talosLavora({
    cartella, task: { consegna: 'Prova.' }, modello: 'test', chiave: 'test', livelloAccesso,
    chiediApprovazioneFn: async (a) => { domande.push(a); return true; },
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: n++ === 0 ? { role: 'assistant', content: null, tool_calls: [chiamata] } : { role: 'assistant', content: 'Fatto.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }) }),
  });
  return { domande: domande.map(riassuntoDellaCarta), partito: S.distruttivi.length + S.eseguiti.length > prima };
}
/* Di una carta: che cosa chiede e se offre «per la sessione»; mai i percorsi (cambiano a ogni corsa) */
function riassuntoDellaCarta(a) {
  const f = a?.fuoriDalProgetto;
  return {
    tipo: a?.tipo, critica: Boolean(a?.cancellazioneCritica), sessioneCritica: a?.cancellazioneCritica?.chiave !== undefined,
    fuori: f ? { frase: f.fraseChiave, sessione: f.chiave !== undefined, verificato: f.verificato } : null,
    sempreNonBasta: a?.sempreNonBasta === true, rete: Boolean(a?.percorsoDiRete || a?.rete),
  };
}
async function cancello(c, azione, livelloAccesso) {
  const chieste = [];
  const r = await verificaPermessoScrittura({ toolCallId: 'r', ...azione }, { livelloAccesso, cartella: c, consensiSessione: {}, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
  return { consentito: r?.consentito !== false, via: r?.via ?? null, carte: chieste.map(riassuntoDellaCarta) };
}

test('R199-CARTE: 20 comandi tipici, le carte di prima restano (firme su file con R199_CARTE)', suC, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-carte-'));
  t.after(() => rimuoviCartellaDiProva(c));
  mkdirSync(join(c, 'segreto'));
  const repo = join(c, 'repo');
  mkdirSync(repo);
  const conGit = processi.spawnSync('git', ['init', '-q', repo], { stdio: 'ignore', windowsHide: true }).status === 0;
  writeFileSync(join(repo, 'lavoro-della-persona.txt'), 'non salvato');
  const casa = homedir();
  const bloccati = [join(c, 'segreto')];
  const firme = {};
  S.azzera();
  const scrivi = async (n, percorso, livello) => {
    firme[n] = { controllo: ePercorsoDiControllo(c, percorso), credenziale: Boolean(scritturaDiUnaCredenziale(percorso, { cartella: c })), cancello: await cancello(c, { tipo: 'scrivi', percorso, contenuto: 'x' }, livello) };
  };
  const shell = async (n, comando, livello) => {
    dimenticaPercorsiVeri();
    firme[n] = { critica: Boolean(cancellazioneCritica(comando, { cartella: c })), cancello: await cancello(c, { tipo: 'shell', comando }, livello) };
  };
  await scrivi('01 scrivi .talos/hooks.json', `.talos${B}hooks.json`, W);
  await scrivi('02 scrivi \\\\.\\C: .talos', `${B}${B}.${B}${c}${B}.talos${B}h.json`, W);
  await scrivi('03 scrivi \\\\?\\C: CLAUDE.md', `${B}${B}?${B}${c}${B}CLAUDE.md`, W);
  await scrivi('04 scrivi GLOBALROOT ?? .claude', `${B}${B}?${B}GLOBALROOT${B}??${B}${c}${B}.claude${B}settings.json`, W);
  await scrivi('05 scrivi rete .talos', unc(OSPITE, 'cond', '.talos', 'hooks.json'), W);
  firme['06 file_edit \\\\?\\UNC'] = { controllo: ePercorsoDiControllo(c, `${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}a.txt`), cancello: await cancello(c, { tipo: 'file_edit', percorso: `${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}a.txt` }, W) };
  await shell('07 rm -rf C:\\Windows\\', `rm -rf C:${B}Windows${B}`, P);
  await shell('08 rm -rf \\\\.\\C:\\Windows\\', `rm -rf ${B}${B}.${B}C:${B}Windows${B}`, P);
  await shell('09 Remove-Item GLOBALROOT SystemRoot', `Remove-Item -Recurse ${B}${B}?${B}GLOBALROOT${B}SystemRoot`, P);
  await shell('10 rm -rf rete\\', `rm -rf ${unc(OSPITE, 'cond', 'x')}${B}`, P);
  await shell('11 del /s \\\\?\\UNC', `del /s ${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}x`, P);
  await shell('12 Remove-Item \\\\localhost\\C$\\Users', `Remove-Item -Recurse ${B}${B}localhost${B}C$${B}Users`, P);
  if (conGit) {
    firme['13 git -C \\\\.\\C: clean -fdx (lavoro)'] = await giro(c, chiama('shell', { comando: `git -C ${B}${B}.${B}${repo} clean -fdx` }), P);
    firme['14 git clean -fd (lavoro)'] = await giro(repo, chiama('shell', { comando: 'git clean -fd' }), P);
  }
  firme['15 git -C rete reset --hard'] = await giro(c, chiama('shell', { comando: `git -C ${unc(OSPITE, 'cond', 'repo')} reset --hard` }), W);
  firme['16 git reset --hard, progetto sulla condivisione'] = await giro(unc(NAS, 'lavoro', 'repo'), chiama('shell', { comando: 'git reset --hard' }), W);
  await scrivi('17 scrivi \\\\.\\C: authorized_keys', `${B}${B}.${B}${casa}${B}.ssh${B}authorized_keys`, P);
  await scrivi('18 scrivi rete .ssh', unc(OSPITE, 'home', 'io', '.ssh', 'id_rsa'), W);
  firme['19 type \\\\.\\C: bloccata'] = { bloccata: comandoNominaUnaBloccata(`type ${B}${B}.${B}${c}${B}segreto${B}a.txt`, { cartella: c, bloccati }) !== null };
  firme['20 type rete, con bloccate'] = { bloccata: comandoNominaUnaBloccata(`type ${unc(OSPITE, 'cond', 'a.txt')}`, { cartella: c, bloccati }) !== null };
  for (const [n, comando] of [['R1 npm test', 'npm test'], ['R2 echo > out.txt', 'echo x > out.txt'], ['R3 cp -r src dist', 'cp -r src dist']]) await shell(n, comando, W);
  if (process.env.R199_CARTE) writeFileSync(process.env.R199_CARTE, `${JSON.stringify(firme, null, 1)}\n`);
  t.diagnostic(`tocchi: ${S.tocchi.length}; git: ${conGit ? 'sì' : 'no'}`);
  /* le carte che non devono sparire */
  for (const n of ['01 scrivi .talos/hooks.json', '02 scrivi \\\\.\\C: .talos', '03 scrivi \\\\?\\C: CLAUDE.md', '04 scrivi GLOBALROOT ?? .claude', '05 scrivi rete .talos']) assert.equal(firme[n].controllo, true, n);
  for (const n of ['07 rm -rf C:\\Windows\\', '08 rm -rf \\\\.\\C:\\Windows\\']) assert.ok(firme[n].critica && firme[n].cancello.carte.some((x) => x.critica), n);
  assert.equal(firme['17 scrivi \\\\.\\C: authorized_keys'].credenziale, true);
  assert.equal(firme['19 type \\\\.\\C: bloccata'].bloccata, true);
  if (conGit) for (const n of ['13 git -C \\\\.\\C: clean -fdx (lavoro)', '14 git clean -fd (lavoro)']) assert.equal(firme[n].partito, false, n);
  for (const n of ['R1 npm test', 'R2 echo > out.txt', 'R3 cp -r src dist']) assert.deepEqual(firme[n].cancello.carte, [], n);
});
