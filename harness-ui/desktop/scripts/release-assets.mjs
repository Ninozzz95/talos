import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function nomiArtefatti(versione) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(versione)) throw Error('Versione desktop non valida.');
  return { exe: `TALOS-Setup-${versione}.exe`, zip: `TALOS-${versione}-win.zip`, sha: 'SHA256SUMS.txt', note: 'NOTE-RELEASE.md' };
}

export async function preparaRelease({ versione, tag, repository, distDir, smoke }) {
  const nomi = nomiArtefatti(versione);
  if (tag !== `desktop-v${versione}`) throw Error('Il tag deve corrispondere alla versione del package desktop.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Repository GitHub non valido.');
  if (smoke?.completato !== true) throw Error('Smoke installato non riuscito: pubblicazione vietata.');
  const artefatti = [];
  for (const nome of [nomi.exe, nomi.zip]) {
    const path = resolve(distDir, nome);
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) throw Error(`Artefatto vuoto o non regolare: ${nome}`);
    const hash = createHash('sha256');
    for await (const dati of createReadStream(path)) hash.update(dati);
    artefatti.push({ nome, path, bytes: info.size, sha256: hash.digest('hex') });
  }
  if (artefatti[0].sha256 !== smoke.installerSha256) throw Error('Lo SHA256 dell’installer differisce da quello provato nello smoke.');
  const somme = artefatti.map(a => `${a.sha256}  ${a.nome}\n`).join('');
  const note = `# TALOS Desktop ${versione}

Windows 10 1809 o successivo, x64, oppure Windows 11 x64. Non occorre installare Node.
Il runner Windows Server 2025 verifica build e smoke; la compatibilità minima con Windows 10 richiede anche la prova su quel sistema.

## Installazione

Aprire ${nomi.exe}: installazione NSIS per l'utente corrente, senza richiesta di amministratore.
In alternativa estrarre interamente ${nomi.zip} e aprire TALOS.exe mantenendo resources e DLL accanto all'eseguibile.

La v0.1 è **non firmata**: SmartScreen può mostrare «PC protetto da Windows» e autore sconosciuto.
Dopo aver verificato SHA256 e provenienza, scegliere «Ulteriori informazioni», controllare il nome ${nomi.exe}, quindi «Esegui comunque» se si intende procedere.
Se l'opzione è bloccata dalla gestione del dispositivo, rivolgersi all'amministratore. Non disattivare SmartScreen o Defender.
L'attestazione GitHub certifica la provenienza della build; non è una firma Authenticode e non elimina l'avviso SmartScreen.

## Contenuto

Guscio Electron 44.3.0 con runtime Node incluso, backend TALOS, frontend costruito, kernel, context-engine, addon nativi e llama.cpp b10517 CPU/Vulkan con licenze.
Per Vulkan serve un driver compatibile; il motore CPU è incluso come alternativa.
Nessun modello GGUF o credenziale incluso. Il guscio non aggiunge aggiornamenti automatici o telemetria.
Provider remoti e download di modelli richiedono rete e la relativa configurazione; questo installer non ne certifica il funzionamento.

## Verifica SHA256

Confrontare entrambi i valori con SHA256SUMS.txt e con quelli pubblicati qui:

\`\`\`text
${somme.trimEnd()}
\`\`\`

\`\`\`powershell
Get-FileHash -Algorithm SHA256 .\\${nomi.exe}
Get-FileHash -Algorithm SHA256 .\\${nomi.zip}
Get-Content .\\SHA256SUMS.txt
\`\`\`

## Verifica provenienza GitHub

Con GitHub CLI installata, verificare ogni file scaricato contro il repository che ha prodotto questa release:

\`\`\`powershell
gh attestation verify .\\${nomi.exe} --repo ${repository}
gh attestation verify .\\${nomi.zip} --repo ${repository}
\`\`\`

La provenienza lega gli artefatti al workflow e al commit del tag ${tag}.
Il job desktop esegue i cancelli prima del pacchetto e verifica installazione silenziosa, avvio dell'EXE installato, health con cookie, ricarica, chiusura e disinstallazione senza processi residui.
`;
  await writeFile(join(distDir, nomi.sha), somme, 'utf8');
  await writeFile(join(distDir, nomi.note), note, 'utf8');
  return { nomi, artefatti };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version) throw Error('Versione package/lock non allineata.');
    const distDir = join(root, 'dist');
    const smoke = JSON.parse(await readFile(join(root, '.prove/R04-ci-smoke.json'), 'utf8'));
    const risultato = await preparaRelease({ versione: pkg.version, tag: process.env.GITHUB_REF_NAME, repository: process.env.GITHUB_REPOSITORY, distDir, smoke });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries(risultato.nomi).map(([k, nome]) => `${k}=${join(distDir, nome).replaceAll('\\', '/')}\n`).join(''));
    const righe = risultato.artefatti.map(a => `| ${a.nome} | ${a.bytes} | ${(a.bytes / 1048576).toFixed(2)} | ${a.sha256} |`).join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Artefatti desktop\n\n| File | Byte | MiB | SHA256 |\n|---|---:|---:|---|\n${righe}\n`);
    console.log(righe);
  } catch (errore) { console.error(`Release non preparata: ${errore.message}`); process.exitCode = 1; }
}
