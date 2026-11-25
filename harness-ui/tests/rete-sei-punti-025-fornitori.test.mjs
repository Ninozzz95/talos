/*
 * Riga 199, giro unico (giudice v2558, punto 2) — I PREFISSI DEL FORNITORE DI POWERSHELL. In PowerShell `FileSystem::C:\Windows` e
 *   `Microsoft.PowerShell.Core\FileSystem::\\computer\cond` sono gli stessi posti senza il prefisso; i lettori del cancello li prendevano
 *   per un nome relativo dentro il progetto: nessuna carta critica, nessuna carta di rete, nessun blocco (reperti A-R5, C-L2; vecchi,
 *   la base fa lo stesso). Qui l'esito col prefisso deve essere QUELLO della stessa riga senza prefisso. Spia chiusa, ospite inventato.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { comandoNominaUnaBloccata, motivoDaChiedere } = await import('../src/path-policy.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE, unc } = S;

const suC = { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir()) || !/^C:/iu.test(homedir())) && 'solo Windows, col profilo di prova su C:' };
const PREFISSI = ['FileSystem::', 'filesystem::', 'FILESYSTEM::', `Microsoft.PowerShell.Core${B}FileSystem::`, 'microsoft.powershell.core/filesystem::'];
const COMANDI = [
  (t) => `Remove-Item -Recurse -Force ${t}`, (t) => `Remove-Item -LiteralPath '${t}' -Recurse`, (t) => `Set-Content ${t} y`,
  (t) => `New-Item -ItemType File -Path ${t}`, (t) => `Copy-Item a.txt ${t}`, (t) => `Move-Item a.txt ${t}`, (t) => `'y' | Out-File -FilePath ${t}`,
];
async function esito(c, comando, livelloAccesso) {
  const chieste = [];
  const r = await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso, cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
  dimenticaPercorsiVeri();
  const critica = Boolean(cancellazioneCritica(comando, { cartella: c }));
  return JSON.stringify({ passa: r?.consentito !== false, via: r?.via, critica, carte: chieste.map((a) => [a.cancellazioneCritica ? 'critica' : '', a.fuoriDalProgetto?.fraseChiave ?? '', a.fuoriDalProgetto?.chiave === undefined ? '' : 'sessione']) });
}

test('R199-FORNITORE: col prefisso del fornitore il cancello risponde come senza (critica, rete, fuori dal progetto), 0 tocchi', suC, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-forn-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  const BERSAGLI = [unc(OSPITE, 'cond', 'x'), `//${OSPITE}/cond/x`, `${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}x`, `${unc(OSPITE, 'C$')}${c.slice(2)}${B}x`,
    `${B}${B}${B}${OSPITE}${B}cond${B}x`, `C:${B}Windows${B}System32${B}x`, `C:${B}Windows`, `${c}${B}src${B}x`];
  S.azzera();
  const diverse = [];
  for (const livello of ['scrittura-progetto', 'accesso-pieno']) {
    for (const bersaglio of BERSAGLI) {
      for (const comando of COMANDI) {
        const senza = await esito(c, comando(bersaglio), livello);
        for (const p of PREFISSI) {
          const con = await esito(c, comando(`${p}${bersaglio}`), livello);
          if (con !== senza) diverse.push(`${livello} :: ${comando(`${p}${bersaglio}`)} :: senza ${senza} :: con ${con}`);
        }
      }
    }
  }
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(diverse.slice(0, 12), [], `${diverse.length} comandi col prefisso rispondono diversamente`);
});

test('R199-FORNITORE-BLOCCATE-CREDENZIALI: col prefisso una cartella bloccata resta bloccata e la chiave della casa chiede', suC, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-forn-'));
  mkdirSync(join(c, 'segreto'));
  t.after(() => rimuoviCartellaDiProva(c));
  const bloccati = [join(c, 'segreto')];
  const perse = [];
  for (const p of ['', ...PREFISSI]) {
    if (!comandoNominaUnaBloccata(`Get-Content ${p}${join(c, 'segreto', 'a.txt')}`, { cartella: c, bloccati })) perse.push(`bloccata :: ${p}`);
    const chiave = `${p}${join(homedir(), '.ssh', 'id_rsa')}`;
    if (!motivoDaChiedere({ tipo: 'shell', comando: `Get-Content ${chiave}`, cartella: c, accessoPieno: true })) perse.push(`credenziale :: ${p}`);
  }
  assert.deepEqual(perse, []);
});
