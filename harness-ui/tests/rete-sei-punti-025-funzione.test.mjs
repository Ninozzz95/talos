/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — RETE CONTRO LOCALE SCRITTO PER ESTESO, SOLO DAL TESTO.
 *   Il primo tentativo sui T5-T10 (ramo `cura/pc-024-rete-prima-della-carta`, commit annullati) filtrava con `classificaPercorsoDiRete`,
 *   che dice «nt» a ogni `\\.\…` e a ogni `\\?\GLOBALROOT…`, anche ai dischi LOCALI (`\\.\C:\`, `\\.\GLOBALROOT\Device\HarddiskVolumeN\`):
 *   così spegneva la carta critica, la protezione del lavoro e le cartelle bloccate. `portaInRete` dice «rete» solo per le forme che
 *   portano a un altro computer; tutto il resto è `null` e si misura come oggi. Nessun disco: è una funzione pura.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostname } from 'node:os';

const modulo = await import('../src/kernel/file-namespace-contract.mjs');
const { portaInRete, reteEstranea, classificaPercorsoDiRete } = modulo;
const B = '\\';
const W = { platform: 'win32' };
const NOME = hostname();

const RETE = [
  [`${B}${B}ospite${B}cond${B}x`, 'ospite'],
  ['//ospite/cond/x', 'ospite'],
  [`${B}/ospite/cond${B}x`, 'ospite'],
  [`${B}${B}${B}ospite${B}cond${B}x`, 'ospite'],
  ['///ospite/cond/x', 'ospite'],
  [`${B}${B}?${B}UNC${B}ospite${B}cond${B}x`, 'ospite'],
  [`${B}${B}.${B}UNC${B}ospite${B}cond${B}x`, 'ospite'],
  [`${B}${B}?${B}GLOBAL${B}UNC${B}ospite${B}cond`, 'ospite'],
  [`${B}${B}.${B}GLOBALROOT${B}DosDevices${B}UNC${B}ospite${B}cond`, 'ospite'],
  [`${B}${B}?${B}GLOBALROOT${B}??${B}UNC${B}ospite${B}cond`, 'ospite'],
  [`${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}GLOBAL??${B}UNC${B}ospite${B}cond`, 'ospite'],
  [`${B}??${B}UNC${B}ospite${B}cond`, 'ospite'],
  [`${B}${B}?${B}GLOBALROOT${B}Device${B}Mup${B}ospite${B}cond`, 'ospite'],
  [`${B}${B}.${B}GLOBAL${B}GLOBALROOT${B}Device${B}LanmanRedirector${B}ospite${B}cond`, 'ospite'],
  [`${B}${B}?${B}GLOBALROOT${B}Device${B}WebDavRedirector${B}ospite${B}x`, 'ospite'],
  [`${B}${B}?${B}GLOBALROOT${B}Device${B}RdpDr${B}ospite${B}x`, 'ospite'],
  [`${B}${B}ospite@SSL${B}cond${B}x`, 'ospite'],
  [`${B}${B}ospite@80${B}x`, 'ospite'],
  [`${B}${B}ospite@SSL@443${B}DavWWWRoot${B}x`, 'ospite'],
  [`${B}${B}altro${B}C$${B}x`, 'altro'],
  [`${B}${B}?${B}UNC${B}altro${B}C$${B}x`, 'altro'],
  /* 4.1: il nome di questa macchina con un dominio dopo è un altro computer per il DNS */
  [`${B}${B}${NOME}.dominio-esterno.example${B}C$${B}x`, `${NOME}.dominio-esterno.example`.toLowerCase()],
  [`${B}${B}LOCALHOST.example${B}C$${B}x`, 'localhost.example'],
];
const LOCALE = [
  `C:${B}x`, 'x', `.${B}x`, `${B}x`, 'Z:\\mappato', `${B}${B}?${B}C:${B}x`, `${B}${B}.${B}C:${B}x`, `${B}${B}?${B}${B}C:${B}${B}x`, `${B}??${B}C:${B}x`,
  `${B}${B}?${B}GLOBALROOT${B}??${B}C:${B}x`, `${B}${B}?${B}GLOBALROOT${B}GLOBAL??${B}C:${B}x`, `${B}${B}?${B}GLOBAL${B}C:${B}x`,
  `${B}${B}?${B}GLOBALROOT${B}Device${B}HarddiskVolume3${B}x`, `${B}${B}.${B}GLOBALROOT${B}Device${B}HarddiskVolume3${B}x`,
  `${B}${B}?${B}GLOBALROOT${B}Device${B}Harddisk0${B}Partition1${B}x`, `${B}${B}?${B}GLOBALROOT${B}Device${B}HarddiskVolumeShadowCopy2${B}x`,
  `${B}${B}?${B}Volume{0b1c2d3e-0000-0000-0000-000000000000}${B}x`, `${B}${B}?${B}GLOBALROOT${B}SystemRoot${B}System32`,
  `${B}${B}.${B}pipe${B}x`, `${B}${B}.${B}PhysicalDrive0`, `${B}${B}.${B}CON`,
  `${B}${B}localhost${B}C$${B}x`, `${B}${B}127.0.0.1${B}C$${B}x`, `${B}${B}127.1${B}C$`, `${B}${B}[::1]${B}C$${B}x`, `${B}${B}${NOME}${B}C$${B}x`,
  `${B}${B}${NOME.toUpperCase()}${B}c$`, `${B}${B}?${B}UNC${B}localhost${B}C$${B}x`, `${B}${B}wsl$${B}Ubuntu${B}x`, `${B}${B}wsl.localhost${B}Ubuntu`,
  'file://ospite/cond/x', '', `${B}${B}`,
];

test('R199-F1: le forme che portano a un altro computer sono «rete», con l ospite', () => {
  assert.equal(typeof portaInRete, 'function', 'manca portaInRete in file-namespace-contract.mjs');
  for (const [p, ospite] of RETE) {
    const r = portaInRete(p, W);
    assert.ok(r, `rete: ${p}`);
    assert.equal(r.ospite, ospite, p);
    assert.match(r.breve, /^\\\\[^\\]/u, `forma corta: ${p}`);
  }
});

test('R199-F2: i dischi di QUESTA macchina, anche scritti per esteso, non sono «rete» (il rosso del primo tentativo)', () => {
  assert.equal(typeof portaInRete, 'function', 'manca portaInRete');
  for (const p of LOCALE) assert.equal(portaInRete(p, W), null, `locale: ${p}`);
  /* la differenza con la regola larga: queste `classificaPercorsoDiRete` le dice «nt», e così deve restare (rifiuta gli attrezzi dei file) */
  assert.equal(classificaPercorsoDiRete(`${B}${B}.${B}C:${B}x`), 'nt');
  assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}GLOBALROOT${B}Device${B}HarddiskVolume3${B}x`), 'nt');
});

test('R199-F3: fuori da Windows niente è «rete» (nessun SMB: il telefono non cambia)', () => {
  assert.equal(typeof portaInRete, 'function', 'manca portaInRete');
  for (const [p] of RETE) assert.equal(portaInRete(p, { platform: 'linux' }), null, p);
  for (const [p] of RETE) assert.equal(portaInRete(p, { platform: 'android' }), null, p);
});

test('R199-F4: reteEstranea — dentro una radice che è a sua volta sulla rete non è estranea; il confronto vuole il separatore', () => {
  assert.equal(typeof reteEstranea, 'function', 'manca reteEstranea');
  const radice = `${B}${B}nas${B}lavoro`;
  assert.equal(reteEstranea(`${B}${B}nas${B}lavoro${B}a.txt`, [radice], W), false);
  assert.equal(reteEstranea(`${B}${B}NAS${B}Lavoro${B}a.txt`, [radice], W), false, 'maiuscole ignorate');
  assert.equal(reteEstranea(`${B}${B}?${B}UNC${B}nas${B}lavoro${B}a.txt`, [radice], W), false, 'la forma lunga è la stessa condivisione');
  assert.equal(reteEstranea(`${B}${B}nas${B}lavoro`, [`${radice}${B}`], W), false);
  assert.equal(reteEstranea(`${B}${B}nas${B}lavoro2${B}a.txt`, [radice], W), true, 'senza separatore è un altro posto');
  assert.equal(reteEstranea(`${B}${B}nas${B}altra${B}a.txt`, [radice], W), true);
  assert.equal(reteEstranea(`${B}${B}nas${B}lavoro${B}..${B}..${B}altra${B}a.txt`, [radice], W), false, 'sopra la condivisione non si sale');
  assert.equal(reteEstranea(`${B}${B}ospite${B}cond${B}a.txt`, ['C:\\progetto', null, ''], W), true);
  assert.equal(reteEstranea(`C:${B}progetto${B}a.txt`, [radice], W), false);
  assert.equal(reteEstranea(`${B}${B}.${B}C:${B}progetto`, [], W), false);
});
