#!/usr/bin/env node
/**
 * Il cancello sulla lunghezza delle note di rilascio, PRIMA dell'etichetta (lista 0.2.3, voce 108; blocco 0 della 0.2.4).
 *
 * ⛔ 17/11/2026 — la release della 0.2.3 è caduta all'ULTIMO passo, con l'installer già costruito e provato:
 *   `gh release create --notes-file` ⇒ «HTTP 422 … body is too long (maximum is 125000 characters)»
 *   (`C:/T/cura-perm13-lavoro/release-023-rosso.log:27`). La sezione «## desktop-v0.2.3» del CHANGELOG era di 175.091 caratteri.
 *   Un no che arriva dopo quaranta minuti e con l'etichetta già spesa; qui arriva in un secondo, prima.
 * ⇒ Il cancello compone il corpo VERO che la release manderà a GitHub, per ciascuno dei tre prodotti (tre colonne, un tetto):
 *   - PC: `noteDellaRelease` di `desktop/scripts/release-assets.mjs` (la sezione «## desktop-vX» più il testo fisso), lo stesso testo
 *     che `preparaRelease` scrive in NOTE-RELEASE.md;
 *   - CLI: `releaseNotes` di `cli/scripts/release-plan.mjs` (la sezione «## talos-cli-vX»), quando il ramo della CLI c'è; se no la
 *     stessa regola, scritta qui sotto;
 *   - telefono: il `body:` del passo di pubblicazione dell'APK in `.github/workflows/release.yml` (letto, mai toccato), con la sezione
 *     «## mobile-vX» del CHANGELOG di radice al posto dell'espressione. GitHub ci aggiunge in coda le note generate
 *     (`generate_release_notes: true`): non si possono misurare prima, e il margine è lì anche per loro.
 *   Senza sezione si ferma lo stesso, come già fanno il telefono (`mobile/scripts/aggiornamento/manifesto-android.mjs:83-84`) e la CLI.
 *
 * Hermes fa la stessa cosa prima di prendersi il numero della versione: `scripts/releases/entrypoint.py:175-176`
 *   (`GITHUB_BODY_LIMIT = 125_000`, «GitHub refuses a release body longer than this with HTTP 422») e `:262-270` (il corpo si
 *   costruisce PRIMA, «a body GitHub refuses would otherwise burn the attempt», e il rifiuto dice cosa fare).
 *
 * Uso:   node harness-ui/scripts/cancello/lunghezza-note.mjs <pc|cli|telefono> [versione] [--changelog <file>] [--radice <cartella>]
 * Esce:  0 sotto il tetto · 1 oltre il tetto o senza sezione · 2 uso sbagliato.
 * ⛔ Non è agganciato alla CI (blocco 0): dove andrebbe lo dice il rapporto dell'agente 024-B0.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nomiArtefatti, noteDellaRelease, sezioneDelChangelog } from '../../desktop/scripts/release-assets.mjs';

/** Il tetto di GitHub sul corpo di una release (HTTP 422 oltre), e il margine. Un posto solo: chi cambia il tetto lo cambia qui. */
export const TETTO_GITHUB = 125_000;
export const MARGINE = 5_000;
export const AMMESSO = TETTO_GITHUB - MARGINE;

/**
 * Le due misure di un corpo. `caratteri`: il più grande fra punti di codice e unità UTF-16 di JavaScript (un emoji ne vale due);
 * `byte`: la lunghezza in UTF-8. GitHub scrive «125000 characters» ma non dice se conta caratteri o byte, e i concorrenti non sono
 * d'accordo (Hermes `scripts/releases/entrypoint.py:268` conta caratteri, cua `.github/scripts/release_notes.py:181` conta byte):
 * cura piccola del blocco 0 (giudice, 19/11/2026), si misurano tutte e due.
 */
export function misure(testo) {
  const s = String(testo);
  return { caratteri: Math.max(s.length, [...s].length), byte: Buffer.byteLength(s, 'utf8') };
}

/** Ciò che si confronta col tetto: il più grande fra caratteri e byte. 120.000 «à» sono 120.000 caratteri ma 240.000 byte: non passano. */
export function misura(testo) {
  const m = misure(testo);
  return Math.max(m.caratteri, m.byte);
}

const RADICE_DEL_DEPOSITO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PRODOTTI = {
  pc: { changelog: 'harness-ui/desktop/CHANGELOG.md', pacchetto: 'harness-ui/desktop/package.json', etichetta: (v) => `desktop-v${v}` },
  cli: { changelog: 'cli/CHANGELOG.md', pacchetto: 'cli/package.json', etichetta: (v) => `talos-cli-v${v}` },
  telefono: { changelog: 'CHANGELOG.md', pacchetto: 'mobile/package.json', etichetta: (v) => `mobile-v${v}` },
};

/** La sezione come la legge il passo `changelog` del job dell'APK: `awk '$0 == "## <tag>"'`, cioè la riga ESATTA, fino al `## ` dopo. */
export function sezioneDelTelefono(testo, tag) {
  const righe = String(testo).split(/\r?\n/u);
  const inizio = righe.indexOf(`## ${tag}`);
  if (inizio < 0) return '';
  const resto = righe.slice(inizio + 1);
  const fine = resto.findIndex((r) => r.startsWith('## '));
  const sezione = (fine < 0 ? resto : resto.slice(0, fine)).join('\n');
  return sezione.replace(/\s/gu, '') ? sezione : '';
}

/** La regola di `cli/scripts/release-plan.mjs` (`releaseNotes`) quando quel file non c'è in questo albero. */
function noteDellaCliScritteQui(testo, versione) {
  const righe = String(testo).split(/\r?\n/u);
  const intestazione = `## talos-cli-v${versione}`;
  const inizio = righe.findIndex((r) => r === intestazione || r.startsWith(`${intestazione} `));
  if (inizio < 0) return '';
  const fine = righe.findIndex((r, i) => i > inizio && r.startsWith('## '));
  const corpo = righe.slice(inizio + 1, fine < 0 ? undefined : fine).join('\n').trim();
  return corpo ? `${corpo}\n` : '';
}

/** Il `body: |` del passo che pubblica l'APK, tolta l'indentazione del blocco YAML. `null` se il file o il passo non ci sono. */
export function modelloDelTelefono(workflow) {
  const righe = String(workflow).split(/\r?\n/u);
  const i = righe.findIndex((r) => /^\s+body:\s*\|\s*$/u.test(r));
  if (i < 0) return null;
  const rientroChiave = righe[i].search(/\S/u);
  const blocco = [];
  let rientro = null;
  for (const r of righe.slice(i + 1)) {
    if (r.trim() === '') { blocco.push(''); continue; }
    const qui = r.search(/\S/u);
    if (qui <= rientroChiave) break;
    rientro ??= qui;
    blocco.push(r.slice(Math.min(rientro, qui)));
  }
  while (blocco.length && blocco.at(-1) === '') blocco.pop();
  return `${blocco.join('\n')}\n`;
}

/* il deposito dove esce il PC: quello che l'aggiornatore legge (`build.publish` del pacchetto desktop), di questo albero se l'altro non l'ha */
function repositoryDelPc(radice) {
  for (const r of [radice, RADICE_DEL_DEPOSITO]) {
    try {
      const pkg = JSON.parse(readFileSync(join(r, PRODOTTI.pc.pacchetto), 'utf8'));
      const m = /github\.com\/([^/]+\/[^/]+)/u.exec(pkg.build?.publish?.[0]?.url ?? '');
      if (m) return m[1];
    } catch { /* il prossimo, poi il segnaposto */ }
  }
  return process.env.GITHUB_REPOSITORY || 'proprietario/deposito';
}

/**
 * Il corpo che la release di `prodotto` manderà a GitHub. `{ tag, sezione, corpo, nota }`; `corpo` è '' se la sezione manca.
 * Le parti che si sanno solo alla build (impronte, nome dell'APK) entrano con la loro lunghezza vera o una più lunga.
 */
export async function corpoDellaRelease({ prodotto, versione, testoChangelog, radice = RADICE_DEL_DEPOSITO }) {
  const p = PRODOTTI[prodotto];
  if (!p) throw Error(`prodotto sconosciuto: ${prodotto} (pc, cli o telefono)`);
  const tag = p.etichetta(versione);
  if (prodotto === 'pc') {
    const sezione = sezioneDelChangelog(testoChangelog, tag);
    if (!sezione) return { tag, sezione, corpo: '', nota: '' };
    const n = nomiArtefatti(versione);
    const somme = [n.exe, n.zip, n.manifesto, n.firma, n.mappa].map((nome) => `${'0'.repeat(64)}  ${nome}\n`).join('');
    return { tag, sezione, corpo: noteDellaRelease({ versione, tag, repository: repositoryDelPc(radice), cambiamenti: sezione, somme }), nota: '' };
  }
  if (prodotto === 'cli') {
    const piano = [join(radice, 'cli/scripts/release-plan.mjs'), join(RADICE_DEL_DEPOSITO, 'cli/scripts/release-plan.mjs')].find((f) => existsSync(f));
    let corpo = '';
    if (piano) {
      const { releaseNotes } = await import(pathToFileURL(piano).href);
      try { corpo = releaseNotes(testoChangelog, versione); } catch { corpo = ''; }
    } else corpo = noteDellaCliScritteQui(testoChangelog, versione);
    return { tag, sezione: corpo, corpo, nota: piano ? '' : 'regola della CLI scritta qui: cli/scripts/release-plan.mjs non è in questo albero' };
  }
  const sezione = sezioneDelTelefono(testoChangelog, tag);
  if (!sezione) return { tag, sezione, corpo: '', nota: '' };
  const workflow = [join(radice, '.github/workflows/release.yml'), join(RADICE_DEL_DEPOSITO, '.github/workflows/release.yml')].find((f) => existsSync(f));
  const modello = workflow ? modelloDelTelefono(readFileSync(workflow, 'utf8')) : null;
  if (!modello) return { tag, sezione, corpo: `${sezione}\n`, nota: 'modello del corpo non trovato in release.yml: misurata la sola sezione' };
  /* GitHub sostituisce le espressioni sul testo: la sezione entra com'è; le altre (nome e impronta dell'APK, deposito) con 64 caratteri, più di ciascuna */
  const corpo = modello.replace(/\$\{\{\s*([^}]+?)\s*\}\}/gu, (_, espressione) => (espressione === 'steps.changelog.outputs.testo' ? sezione : 'x'.repeat(64)));
  return { tag, sezione, corpo, nota: 'GitHub aggiunge in coda le note generate (generate_release_notes): il margine serve anche a loro' };
}

/** Il giudizio, puro: `{ ok, righe }`. */
export function giudica({ prodotto, tag, changelog, sezione, corpo, nota = '' }) {
  if (!corpo) {
    return { ok: false, righe: [`⛔ note di ${prodotto} ${tag}: ${changelog} non ha una sezione "## ${tag}" (o è vuota). Scrivila prima dell'etichetta: cosa è nuovo, cosa è corretto.`] };
  }
  const n = misura(corpo);
  const c = misure(corpo);
  const s = misure(sezione);
  const testa = `note di ${prodotto} ${tag}: corpo ${c.caratteri} caratteri e ${c.byte} byte (la sezione ${s.caratteri} e ${s.byte}; conta il più grande, ${n}), tetto di GitHub ${TETTO_GITHUB}, ammesso ${AMMESSO} col margine di ${MARGINE}`;
  const coda = nota ? [`   (${nota})`] : [];
  if (n <= AMMESSO) return { ok: true, righe: [`✓ ${testa}: ${AMMESSO - n} di spazio.`, ...coda] };
  return {
    ok: false,
    righe: [
      `⛔ ${testa}: ${n - AMMESSO} di troppo${n > TETTO_GITHUB ? ` (${n - TETTO_GITHUB} oltre il tetto: GitHub risponderebbe HTTP 422 all'ultimo passo)` : ''}.`,
      `   Cosa fare: nella sezione "## ${tag}" di ${changelog} resta un riassunto (cosa è nuovo, cosa è corretto, i limiti noti);`,
      `   il dettaglio va in un file a parte nel deposito, e la sezione lo cita con un collegamento. Poi rilancia questo cancello, prima dell'etichetta.`,
      ...coda,
    ],
  };
}

function argomenti(argv) {
  const posizionali = [];
  const opzioni = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--changelog' || argv[i] === '--radice') { opzioni[argv[i].slice(2)] = argv[i + 1]; i += 1; } else posizionali.push(argv[i]);
  }
  return { prodotto: posizionali[0], versione: posizionali[1], ...opzioni };
}

async function principale(argv) {
  const a = argomenti(argv);
  const p = PRODOTTI[a.prodotto];
  if (!p || (a.versione !== undefined && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(a.versione))) {
    console.error('uso: node harness-ui/scripts/cancello/lunghezza-note.mjs <pc|cli|telefono> [versione X.Y.Z] [--changelog <file>] [--radice <cartella>]');
    return 2;
  }
  const radice = resolve(a.radice ?? RADICE_DEL_DEPOSITO);
  let versione = a.versione;
  if (!versione) {
    try { versione = JSON.parse(readFileSync(join(radice, p.pacchetto), 'utf8')).version; } catch { versione = undefined; }
    if (!versione) { console.error(`versione non data e ${p.pacchetto} non si legge: passala come secondo argomento`); return 2; }
  }
  const changelog = resolve(radice, a.changelog ?? p.changelog);
  if (!existsSync(changelog)) { console.error(`⛔ note di ${a.prodotto}: ${changelog} non esiste. Una release che non dice cosa è cambiato non esce.`); return 1; }
  const r = await corpoDellaRelease({ prodotto: a.prodotto, versione, testoChangelog: readFileSync(changelog, 'utf8'), radice });
  const g = giudica({ prodotto: a.prodotto, changelog, ...r });
  for (const riga of g.righe) (g.ok ? console.log : console.error)(riga);
  return g.ok ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  principale(process.argv.slice(2)).then((codice) => { process.exitCode = codice; }, (e) => { console.error(`⛔ cancello delle note: ${e?.message ?? e}`); process.exitCode = 2; });
}
