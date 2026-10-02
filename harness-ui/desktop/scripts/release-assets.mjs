import { createHash, createPublicKey } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOME_FIRMA, NOME_MANIFESTO, chiavePubblicaDa, firmaManifesto, leggiManifesto, sha512Base64, verificaFirmaManifesto } from '../firma-aggiornamenti.mjs';

export function nomiArtefatti(versione) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(versione)) throw Error('Versione desktop non valida.');
  return { exe: `TALOS-Setup-${versione}.exe`, zip: `TALOS-${versione}-win.zip`, sha: 'SHA256SUMS.txt', note: 'NOTE-RELEASE.md',
    manifesto: NOME_MANIFESTO, firma: NOME_FIRMA };
}

/*
 * ⛔⛔ 14/09 — LE NOTE DEVONO DIRE COSA È CAMBIATO, e queste non lo dicevano.
 *
 * Regola permanente dell'owner (16/08): «ad ogni release non creare del testo statico, o meglio
 * assieme al testo statico metti anche il changelog breve delle fix e delle implementazioni nuove».
 * Il mobile ha un cancello che lo impone dal 16/08; il desktop no, e le sue note erano un testo
 * IDENTICO a ogni versione: installazione, SmartScreen, SHA256. Tutto vero, e muto su cosa fosse
 * cambiato.
 *
 * ⛔ E non lo risolve `--generate-notes` di GitHub: quelle note elencano le pull request, cioè il
 * MATERIALE da cui si scrive un changelog, non un changelog (GitHub, «Automatically generated
 * release notes», letto il 14/09/2026). La fonte autorevole resta il file: Keep a Changelog 1.1.0
 * dice che una release su una piattaforma «crea un changelog non portabile, mostrabile solo dentro
 * quella piattaforma», e che a ogni versione corrisponde una sezione (letto il 14/09/2026).
 *
 * ⇒ Le note si COMPONGONO: la sezione del CHANGELOG per QUESTO tag, più il testo stabile che
 *   riguarda l'installazione. Se la sezione manca, non si pubblica — un cancello da 2 secondi
 *   prima della build, non una scoperta dopo quaranta minuti.
 */
export function sezioneDelChangelog(testo, tag) {
  const righe = String(testo).split(/\r?\n/);
  const intestazione = `## ${tag}`;
  const inizio = righe.findIndex((r) => r.trimEnd() === intestazione || r.startsWith(`${intestazione} `));
  if (inizio < 0) return '';
  const resto = righe.slice(inizio + 1);
  const fine = resto.findIndex((r) => r.startsWith('## '));
  return (fine < 0 ? resto : resto.slice(0, fine)).join('\n').trim();
}

/*
 * ⭐ 01/10/2026 — L'AGGIORNAMENTO AUTOMATICO PARTE DA QUI (owner: «Firma Ed25519 fatta da noi»). L'app accetta un
 *   aggiornamento solo se `latest.yml` porta una firma valida della chiave pubblica che ha dentro (`firma-aggiornamenti.mjs`).
 * ⇒ Tre no prima di pubblicare, perché un errore qui si scopre solo DOPO, quando ogni app installata rifiuta l'aggiornamento:
 *   1. senza la chiave privata (segreto `TALOS_UPDATE_SIGN_KEY`) non si pubblica;
 *   2. se la privata non è la gemella della pubblica che l'app porta con sé (`assets/aggiornamenti-pubblica.pem`), non si
 *      pubblica: una firma valida ma di un'altra chiave varrebbe quanto nessuna firma;
 *   3. se `latest.yml` non descrive ESATTAMENTE l'installer provato nello smoke (versione, nome, sha512, byte), non si pubblica.
 */
function controllaManifesto(testo, { versione, nome, sha512, byte }) {
  const m = leggiManifesto(testo);
  if (m.version !== versione) throw Error(`latest.yml dice ${m.version}, il pacchetto è ${versione}.`);
  if (m.path !== nome) throw Error(`latest.yml punta a ${m.path}, l'installer è ${nome}.`);
  if (m.sha512 !== sha512) throw Error('latest.yml porta uno sha512 diverso da quello dell’installer.');
  // `size` manca nel latest.yml vero di electron-builder 26 senza pacchetti differenziali (misurato il 01/10/2026): se c'è, deve tornare.
  if (m.size !== null && m.size !== byte) throw Error('latest.yml porta una misura diversa da quella dell’installer.');
  return m;
}

export async function preparaRelease({ versione, tag, repository, distDir, smoke, changelogPath, chiavePrivata, chiavePubblicaApp }) {
  const nomi = nomiArtefatti(versione);
  if (tag !== `desktop-v${versione}`) throw Error('Il tag deve corrispondere alla versione del package desktop.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Repository GitHub non valido.');
  if (smoke?.completato !== true) throw Error('Smoke installato non riuscito: pubblicazione vietata.');
  if (!changelogPath) throw Error('Serve il percorso del CHANGELOG: una release che non dice cosa è cambiato non si pubblica.');
  const cambiamenti = sezioneDelChangelog(await readFile(changelogPath, 'utf8'), tag);
  if (!cambiamenti) throw Error(`Il CHANGELOG non ha una sezione "## ${tag}": scrivila prima di taggare — cosa è nuovo, cosa è stato corretto.`);
  /*
   * ⛔ 01/10/2026 — la 0.1.19 è uscita con «This release candidate addresses…» nelle note. Un tag `desktop-vX.Y.Z` senza
   *   suffisso è una release FINALE (SemVer 2.0.0 §9: una pre-release si scrive col trattino, `1.0.0-rc.1`): le sue note non si
   *   presentano come candidata. Le note già pubblicate non si riscrivono; la prossima non ci ricade.
   */
  if (/\brelease[\s-]+candidates?\b/iu.test(cambiamenti)) {
    throw Error(`La sezione "## ${tag}" del CHANGELOG si presenta come «release candidate»: un tag finale non è una candidata. Correggi la sezione prima di taggare.`);
  }
  if (!chiavePrivata) throw Error('Manca la chiave che firma gli aggiornamenti (segreto TALOS_UPDATE_SIGN_KEY): senza, le app installate rifiuterebbero l’aggiornamento.');
  if (!chiavePubblicaApp) throw Error('Manca la chiave pubblica che l’app porta con sé (assets/aggiornamenti-pubblica.pem).');
  let gemelle = false;
  try { gemelle = chiavePubblicaDa(chiavePrivata).trim() === createPublicKey(chiavePubblicaApp).export({ type: 'spki', format: 'pem' }).toString().trim(); }
  catch (errore) { throw Error(`Chiavi degli aggiornamenti illeggibili: ${errore.message}`); }
  if (!gemelle) throw Error('La chiave del segreto TALOS_UPDATE_SIGN_KEY non è la gemella di assets/aggiornamenti-pubblica.pem: le app installate rifiuterebbero l’aggiornamento.');
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
  const installer = await readFile(artefatti[0].path);
  const testoManifesto = await readFile(join(distDir, nomi.manifesto));
  controllaManifesto(testoManifesto.toString('utf8'), { versione, nome: nomi.exe, sha512: sha512Base64(installer), byte: installer.length });
  const firma = firmaManifesto(testoManifesto, chiavePrivata);
  if (!verificaFirmaManifesto(testoManifesto, firma, chiavePubblicaApp)) throw Error('La firma appena fatta non si verifica con la chiave dell’app.');
  await writeFile(join(distDir, nomi.firma), `${firma}\n`, 'utf8');
  for (const nome of [nomi.manifesto, nomi.firma]) {
    const dati = await readFile(join(distDir, nome));
    artefatti.push({ nome, path: resolve(distDir, nome), bytes: dati.length, sha256: createHash('sha256').update(dati).digest('hex') });
  }
  const somme = artefatti.map(a => `${a.sha256}  ${a.nome}\n`).join('');
  /*
   * ⛔ IN INGLESE, e non è una preferenza: è la stessa trappola che il mobile ha già pagato. La sua
   * v0.1.0 uscì in italiano, fu corretta A MANO, e la SORGENTE rimase italiana — quindi la release
   * dopo sarebbe tornata italiana da sola (vedi il commento in `.github/workflows/release.yml`).
   * Correggere il sintomo e lasciare la causa è come non aver corretto niente. Qui la sorgente è
   * inglese: tutto ciò che si pubblica lo è.
   */
  const note = `# TALOS Desktop ${versione}

Windows 10 1809 or later, x64, or Windows 11 x64. Node does not need to be installed.
Build and smoke test run on a Windows Server 2025 runner; the minimum Windows 10 compatibility still needs a test on that system.

## What changed

${cambiamenti}

## Install

Open ${nomi.exe}: NSIS installer for the current user, no administrator prompt.
Alternatively extract ${nomi.zip} in full and open TALOS.exe, keeping resources and the DLLs next to the executable.

The v0.1 is **not code-signed**: SmartScreen may show "Windows protected your PC" and an unknown publisher.
After checking the SHA256 and the provenance, choose "More info", check the name ${nomi.exe}, then "Run anyway" if you intend to proceed.
If your device management blocks that option, ask your administrator. Do not turn SmartScreen or Defender off.
The GitHub attestation certifies where the build came from; it is not an Authenticode signature and does not remove the SmartScreen warning.

## What is inside

An Electron 44.3.0 shell with the Node runtime included, the TALOS backend, the built frontend, the kernel, the context engine, native addons, and llama.cpp b10517 CPU/Vulkan builds with their licences.
Vulkan needs a compatible driver; the CPU engine is included as the alternative.
Node.js 24.18.0 and ripgrep 15.0.0 for Linux, with their licences: when WSL is installed and a session runs its commands in Linux, the file tools run there too, with these binaries. Nothing is installed inside the WSL distribution.
No GGUF model and no credential is bundled, and there is no telemetry.

## Automatic updates

The app checks for a new desktop release when it starts and every 4 hours, downloads it in the background and installs it when you close the app, or at once with *Riavvia ora*. ${nomi.manifesto} is signed with an Ed25519 key (${nomi.firma}): the app verifies the signature with the public key it carries before downloading anything, and checks the downloaded installer against the signed SHA-512 before installing it. Automatic updates can be turned off in Settings, under *Account, Doctor e backup*.
Remote providers and model downloads need the network and their own configuration; this installer does not certify that they work.

## Check the SHA256

Compare both values with SHA256SUMS.txt and with the ones published here:

\`\`\`text
${somme.trimEnd()}
\`\`\`

\`\`\`powershell
Get-FileHash -Algorithm SHA256 .\\${nomi.exe}
Get-FileHash -Algorithm SHA256 .\\${nomi.zip}
Get-Content .\\SHA256SUMS.txt
\`\`\`

## Check the GitHub provenance

With the GitHub CLI installed, verify every file you downloaded against the repository that produced this release:

\`\`\`powershell
gh attestation verify .\\${nomi.exe} --repo ${repository}
gh attestation verify .\\${nomi.zip} --repo ${repository}
\`\`\`

The provenance ties the artifacts to the workflow and to the commit of tag ${tag}.
The desktop job runs the gates before packaging, then verifies silent install, start of the installed EXE, health with cookie, reload, close and uninstall with no processes left behind.
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
    const risultato = await preparaRelease({
      versione: pkg.version, tag: process.env.GITHUB_REF_NAME, repository: process.env.GITHUB_REPOSITORY, distDir, smoke,
      changelogPath: join(root, 'CHANGELOG.md'),
      chiavePrivata: process.env.TALOS_UPDATE_SIGN_KEY || '',
      chiavePubblicaApp: await readFile(join(root, 'assets', 'aggiornamenti-pubblica.pem'), 'utf8').catch(() => ''),
    });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries(risultato.nomi).map(([k, nome]) => `${k}=${join(distDir, nome).replaceAll('\\', '/')}\n`).join(''));
    const righe = risultato.artefatti.map(a => `| ${a.nome} | ${a.bytes} | ${(a.bytes / 1048576).toFixed(2)} | ${a.sha256} |`).join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Artefatti desktop\n\n| File | Byte | MiB | SHA256 |\n|---|---:|---:|---|\n${righe}\n`);
    console.log(righe);
  } catch (errore) { console.error(`Release non preparata: ${errore.message}`); process.exitCode = 1; }
}
