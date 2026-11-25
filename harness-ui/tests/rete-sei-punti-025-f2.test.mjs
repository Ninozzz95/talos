/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — T5, T6, T9, T10: GIÀ USCITI nella 0.2.3. Il gancio dei file di controllo di `scrivi`/`file_edit`
 *   (session-registry.mjs, `costruisciCancelloFileDiControllo` e `cartaPerFileDiControllo` → `ePercorsoDiControllo`), le cartelle bloccate
 *   di un dispositivo (`bloccataDa`, `comandoNominaUnaBloccata`) e le credenziali della casa (`scritturaDiUnaCredenziale`) passano tutti da
 *   `percorsoRealeAncheSeManca` (path-policy.mjs), che chiedeva `existsSync` e `realpath` anche per `\\computer\condivisione`: il contatto
 *   SMB prima della carta. Qui ogni porta del disco è spiata (`aiuto/spia-di-rete-025.mjs`): l'ospite è inventato, non esce niente.
 *   Le stesse funzioni, sui dischi LOCALI scritti per esteso, devono dare la stessa risposta di prima (il rosso del primo tentativo).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { ePercorsoDiControllo, scritturaDiUnaCredenziale, bloccataDa, comandoNominaUnaBloccata } = await import('../src/path-policy.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE, NAS, unc } = S;

const solo = { skip: process.platform !== 'win32' && 'solo Windows: fuori da Windows `\\\\x` non è la rete' };
const suC = { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir()) || !/^C:/iu.test(homedir())) && 'solo Windows, col profilo di prova su C:' };
/* Le radici di rete (senza la coda): ogni forma che porta all'ospite */
const RADICI_DI_RETE = [
  unc(OSPITE, 'cond'), `//${OSPITE}/cond`, `${B}/${OSPITE}/cond`, `${B}${B}?${B}UNC${B}${OSPITE}${B}cond`, `${B}${B}.${B}UNC${B}${OSPITE}${B}cond`,
  unc(`${OSPITE}@SSL`, 'cond'), unc(`${OSPITE}@80`, 'cond'), unc(`${OSPITE}@SSL@443`, 'DavWWWRoot'), unc(OSPITE, 'C$'),
  `${B}${B}?${B}UNC${B}${OSPITE}${B}C$`, `${B}${B}?${B}GLOBAL${B}UNC${B}${OSPITE}${B}cond`, `${B}${B}.${B}GLOBALROOT${B}DosDevices${B}UNC${B}${OSPITE}${B}cond`,
  `${B}${B}?${B}GLOBALROOT${B}Device${B}Mup${B}${OSPITE}${B}cond`, `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}Device${B}LanmanRedirector${B}${OSPITE}${B}cond`,
  `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}??${B}UNC${B}${OSPITE}${B}cond`,
];
/* Le grafie per esteso di un posto LOCALE `C:\…` */
const perEsteso = (p) => [['C:', p], ['\\\\?\\', `${B}${B}?${B}${p}`], ['\\\\.\\', `${B}${B}.${B}${p}`], ['GLOBALROOT ??', `${B}${B}?${B}GLOBALROOT${B}??${B}${p}`]];

function progetto(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-f2-'));
  mkdirSync(join(c, 'segreto'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

test('R199-T5-T6: il controllo dei file di controllo non tocca la rete, e li riconosce lo stesso a parole', solo, (t) => {
  const c = progetto(t);
  S.azzera();
  const persi = [];
  for (const r of RADICI_DI_RETE) {
    for (const coda of [`.talos${B}hooks.json`, `progetto${B}.claude${B}settings.json`, 'CLAUDE.md', `.harness-ui-hooks.json`]) {
      if (ePercorsoDiControllo(c, `${r}${B}${coda}`) !== true) persi.push(`${r}${B}${coda}`);
    }
    ePercorsoDiControllo(c, `${r}${B}a.txt`);
  }
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(persi, [], 'un file di controllo sulla rete resta un file di controllo');
});

test('R199-T9: le cartelle bloccate di un dispositivo non toccano la rete; una bloccata sulla rete si riconosce a parole', solo, (t) => {
  const c = progetto(t);
  S.azzera();
  const bloccati = [join(c, 'segreto'), `${unc(OSPITE, 'cond', 'segreta')}`];
  const sbagli = [];
  for (const r of RADICI_DI_RETE) {
    if (bloccataDa(`${r}${B}a.txt`, { cartella: c, bloccati }) !== null) sbagli.push(`attrezzo :: ${r}`);
    if (comandoNominaUnaBloccata(`type ${r}${B}a.txt`, { cartella: c, bloccati }) !== null) sbagli.push(`shell :: ${r}`);
  }
  if (bloccataDa(unc(OSPITE, 'cond', 'segreta', 'a.txt'), { cartella: c, bloccati })?.radice !== bloccati[1]) sbagli.push('bloccata sulla rete, attrezzo');
  if (comandoNominaUnaBloccata(`type ${unc(OSPITE, 'cond', 'segreta', 'a.txt')}`, { cartella: c, bloccati })?.radice !== bloccati[1]) sbagli.push('bloccata sulla rete, shell');
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(sbagli, []);
});

test('R199-T10: le credenziali della casa non toccano la rete; una casa che sta su una condivisione si misura come oggi', solo, (t) => {
  const c = progetto(t);
  S.azzera();
  const trovate = [];
  for (const r of RADICI_DI_RETE) {
    for (const coda of [`.ssh${B}id_rsa`, `.aws${B}credentials`]) {
      if (scritturaDiUnaCredenziale(`${r}${B}${coda}`, { cartella: c }) !== null) trovate.push(`${r}${B}${coda}`);
    }
  }
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(trovate, [], 'una cartella su un altro computer non è la casa di questa macchina');
  /* controprova: la casa sta sulla condivisione (simulata); quella si misura come oggi, e la credenziale si trova */
  const casa = unc(NAS, 'lavoro', 'casa');
  S.azzera();
  assert.ok(scritturaDiUnaCredenziale(`${casa}${B}.ssh${B}id_rsa`, { cartella: c, home: casa }), 'la credenziale della casa sulla condivisione');
  assert.ok(S.delNas.length > 0, 'la casa sulla condivisione si misura come oggi');
  assert.deepEqual(S.elencoDeiTocchi(), []);
});

test('R199-LOCALI: sui dischi di questa macchina scritti per esteso le tre funzioni rispondono come prima (controllo, bloccata, credenziale)', suC, (t) => {
  const c = progetto(t);
  S.azzera();
  const persi = [];
  for (const [nome, p] of perEsteso(join(c, '.talos', 'hooks.json'))) if (ePercorsoDiControllo(c, p) !== true) persi.push(`controllo :: ${nome}`);
  for (const [nome, p] of perEsteso(join(c, 'segreto', 'a.txt'))) {
    if (!bloccataDa(p, { cartella: c, bloccati: [join(c, 'segreto')] })) persi.push(`bloccata :: ${nome}`);
    if (!comandoNominaUnaBloccata(`type ${p}`, { cartella: c, bloccati: [join(c, 'segreto')] })) persi.push(`bloccata shell :: ${nome}`);
  }
  for (const [nome, p] of perEsteso(join(homedir(), '.ssh', 'id_rsa'))) if (!scritturaDiUnaCredenziale(p, { cartella: c })) persi.push(`credenziale :: ${nome}`);
  if (!scritturaDiUnaCredenziale(`${B}${B}localhost${B}C$${homedir().slice(2)}${B}.ssh${B}id_rsa`, { cartella: c })) persi.push('credenziale :: localhost C$');
  assert.deepEqual(persi, [], 'nessuna carta né rifiuto persi su un disco locale');
  assert.deepEqual(S.elencoDeiTocchi(), []);
});
