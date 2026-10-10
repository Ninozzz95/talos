/*
 * C04 (coda Codex, A-4174-KILL; owner 10/10/2026 «Fermarsi e dirlo») — `aggiorna-4174.ps1` non termina MAI un processo.
 * Prima: se lo stop gentile non era possibile o il server non usciva, `Stop-Process -Force` (TerminateProcess a metà scrittura,
 * su un archivio condiviso con l'app installata). Ora lo script si ferma e lo dice: pid, catena dei genitori, il comando per
 * fermarlo a mano. Senza gettone si ferma PRIMA di costruire, così `public/` e server restano dello stesso codice.
 * Le prove di comportamento girano lo script VERO contro un ascoltatore finto su una porta libera, con una cartella dati vuota:
 * il controllo iniziale lo ferma prima della build, quindi niente si costruisce e niente si consegna.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/aggiorna-4174.ps1', import.meta.url));
const sorgente = readFileSync(SCRIPT, 'utf8');
const suWindows = process.platform === 'win32';

test('C04-01: nessuna riga ESEGUE Stop-Process (resta solo nei commenti e nel comando suggerito all\'owner)', () => {
  const eseguite = sorgente.split('\n').filter((riga) => /Stop-Process/u.test(riga) && !/^\s*#/u.test(riga) && !/Write-Output/u.test(riga));
  assert.deepEqual(eseguite, []);
  assert.match(sorgente, /function Stop-SenzaTerminare/u);
  assert.match(sorgente, /nessun processo e' stato terminato e niente e' stato riavviato \(C04\)/u);
  assert.ok(sorgente.indexOf('# ── 0) C04') < sorgente.indexOf('# ── 1) costruisci'), 'il controllo del gettone viene PRIMA della build');
});

async function ascoltatoreFinto(t) {
  const server = createServer((s) => s.destroy());
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  return server.address().port;
}

function lancia(porta, dati, ...altri) {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Porta', String(porta), ...altri], {
    encoding: 'utf8', timeout: 120_000, env: { ...process.env, TALOS_HARNESS_UI_SESSIONS_DIR: dati },
  });
  return { codice: r.status, uscita: `${r.stdout}\n${r.stderr}` };
}

test('C04-02: senza gettone lo script si ferma PRIMA di costruire, dice chi e come fermarlo, e il processo resta vivo', { skip: !suWindows }, async (t) => {
  const porta = await ascoltatoreFinto(t);
  const dati = mkdtempSync(join(tmpdir(), 'talos-c04-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  const { codice, uscita } = lancia(porta, dati);
  assert.notEqual(codice, 0, 'lo script esce con un errore');
  assert.match(uscita, /nessun gettone di spegnimento/u);
  assert.match(uscita, new RegExp(`catena: pid=${process.pid} `, 'u'), 'la catena comincia dal processo che ascolta (questa prova)');
  assert.match(uscita, new RegExp(`Stop-Process -Id ${process.pid}`, 'u'), 'il comando per l\'owner, senza -Force');
  assert.match(uscita, /nessun processo e' stato terminato/u);
  assert.doesNotMatch(uscita, /costruisco il frontend/u, 'non ha costruito niente');
  // il processo che ascolta è questo: se lo script l'avesse terminato, la prova non arriverebbe qui
  const ancora = await new Promise((ok) => { const s = createServer(); s.once('error', () => ok(true)); s.listen(porta, '127.0.0.1', () => s.close(() => ok(false))); });
  assert.equal(ancora, true, 'la porta è ancora occupata dall\'ascoltatore');
});

test('C04-03: a secco (-WhatIf) lo dice e non tocca niente', { skip: !suWindows }, async (t) => {
  const porta = await ascoltatoreFinto(t);
  const dati = mkdtempSync(join(tmpdir(), 'talos-c04-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  const { codice, uscita } = lancia(porta, dati, '-WhatIf');
  assert.equal(codice, 0, uscita.slice(-600));
  assert.match(uscita, /a secco: nessun gettone di spegnimento .* lo script si fermerebbe qui/u);
  assert.match(uscita, /niente fermato, niente costruito, niente consegnato, niente avviato/u); // C04: la consegna è un passo suo, dopo lo stop
});

/* REVISIONE C04 (sessione desktop, 10/10): un gettone VUOTO non permette lo stop gentile (passo 2 lo rifiuta), quindi il passo 0
   deve fermarsi PRIMA di costruire anche lì. PATH senza npm: un build non può partire davvero. */
test('C04-REV-01: con un gettone VUOTO lo script si ferma PRIMA di costruire', { skip: !suWindows }, async (t) => {
  const porta = await ascoltatoreFinto(t);
  const dati = mkdtempSync(join(tmpdir(), 'talos-c04-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  writeFileSync(join(dati, `.spegnimento-gettone-${porta}`), '');
  const r = spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Porta', String(porta)], {
    encoding: 'utf8', timeout: 120_000, env: { ...process.env, PATH: 'C:/Windows/System32;C:/Windows;C:/Windows/System32/WindowsPowerShell/v1.0', TALOS_HARNESS_UI_SESSIONS_DIR: dati },
  });
  const uscita = `${r.stdout}
${r.stderr}`;
  assert.equal(r.error, undefined, 'powershell è partito davvero');
  assert.match(uscita, /archivio delle sessioni/u, 'lo script è arrivato a girare');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(uscita, /costruisco il frontend/u, 'non deve costruire davanti a un server che non può fermare');
});

/* C04, owner 10/10/2026 «Sì, copia dopo lo stop»: la build resta prima, la consegna in public/ si fa solo a server uscito, così uno
   stop che fallisce lascia server e frontend dello stesso codice. E il gettone si legge in un posto solo (review della desktop). */
test('C04-04: public/ si tocca solo DOPO lo stop, e il gettone si legge in una funzione sola per il passo 0 e il passo 2', () => {
  const stop = sorgente.indexOf('# ── 2) ferma chi ascolta');
  const consegna = sorgente.indexOf("Copy-ConsegnaInPublic -Da (Join-Path $frontend 'dist\\*')");
  const avvio = sorgente.indexOf('# ── 3) avvia');
  assert.ok(stop > 0 && consegna > 0 && avvio > 0, 'premessa: le tre sezioni ci sono');
  assert.ok(stop < consegna && consegna < avvio, 'build → stop → consegna → avvio');
  assert.equal(sorgente.split('Copy-Item -Path').length, 2, 'una consegna sola');
  assert.equal(sorgente.split('Get-Content -Path $fileGettone').length, 2, 'il gettone si legge in un posto solo');
  assert.match(sorgente, /\$gettoneAllInizio = Get-GettoneDiSpegnimento/u);
  assert.match(sorgente, /\$letto = Get-GettoneDiSpegnimento/u);
});

/*
 * C04, nota della review (10/10/2026): una consegna che si ferma a meta' lo DICE (server uscito, public/ parziale, niente riavviato,
 *   rilancia) e ferma lo script. Si prova la funzione VERA, presa dal sorgente, con una sorgente che non esiste.
 */
test('C04-06: a copy into public/ that fails halfway says so and stops the script', { skip: !suWindows }, () => {
  const inizio = sorgente.indexOf('function Copy-ConsegnaInPublic');
  const fine = sorgente.indexOf('\n}\n', inizio);
  assert.ok(inizio > 0 && fine > inizio, 'premessa: la funzione c\'è');
  const funzione = sorgente.slice(inizio, fine + 3);
  const prova = `${funzione}\ntry { Copy-ConsegnaInPublic -Da 'C:\\non-esiste-c04\\dist\\*' -A $env:TEMP; Write-Output 'NESSUN-ERRORE' } catch { Write-Output ("FERMATO: " + $_.Exception.Message) }`;
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', prova], { encoding: 'utf8', timeout: 60_000 });
  assert.doesNotMatch(r.stdout, /NESSUN-ERRORE/u, 'Copy-Item must not fail silently (non-terminating error)');
  assert.match(r.stdout, /FERMATO: la consegna in public\/ si e' fermata a meta' \(.+\): il server vecchio e' gia' uscito, public\/ puo' essere parziale e niente e' stato riavviato\. Rilancia lo script/u);
});

/* C04: col gettone vuoto lo script dice PERCHÉ si ferma («è vuoto»), non solo che si ferma: chi lo legge sa cosa sistemare. */
test('C04-05: un gettone vuoto si nomina come vuoto, prima della build', { skip: !suWindows }, async (t) => {
  const porta = await ascoltatoreFinto(t);
  const dati = mkdtempSync(join(tmpdir(), 'talos-c04-'));
  t.after(() => rimuoviCartellaDiProva(dati));
  writeFileSync(join(dati, `.spegnimento-gettone-${porta}`), '   \n');
  const { codice, uscita } = lancia(porta, dati);
  assert.notEqual(codice, 0);
  assert.match(uscita, /il gettone di spegnimento in .* e' vuoto: chi ascolta sulla \d+ non si puo' fermare in modo gentile/u);
  assert.doesNotMatch(uscita, /costruisco il frontend/u);
});
