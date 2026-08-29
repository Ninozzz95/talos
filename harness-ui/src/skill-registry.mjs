/**
 * skill-registry.mjs — FASE F del piano `elegant-spinning-dongarra.md`
 * (29/8): cartelle di istruzioni caricate on-demand, dichiarate per
 * workspace. Stesso posto (`hook-registry.mjs`/`mcp-registry.mjs`
 * letti come precedenti diretti) — `.harness-ui-skills/<nome>/SKILL.md`
 * DENTRO il workspace, mai fuori: una skill è una proprietà del
 * progetto, come `AGENTS.md` o `.harness-ui-hooks.json`.
 *
 * ⛔⛔ Nessun trust/hash gate, a differenza di hook (eseguono un
 * comando) e server MCP (connettono un processo) — decisione
 * deliberata: una skill è TESTO INERTE, la stessa categoria di rischio
 * di `task.consegna` o di qualunque altro contenuto già nel system
 * prompt, mai gated in questo progetto. Un cancello qui sarebbe un
 * bluff di sicurezza, non una protezione vera — vedi la doc nel piano
 * madre, FASE F, per il ragionamento completo.
 *
 * Formato verificato EMPIRICAMENTE il 29/8 leggendo quattro `SKILL.md`
 * reali (`~/.claude/plugins/cache/.../SKILL.md`), non da una spec
 * assunta: frontmatter YAML fra due righe `---`, tutte le istanze
 * osservate a chiave singola per riga (`name: ...`, `description: ...`
 * mai spezzato su più righe) — questo modulo parsa quella forma, non
 * lo YAML generale (blocchi multi-riga, liste, nesting). Un file che
 * usa una di quelle forme più ricche è un errore dichiarato
 * (`SkillRegistryError`), mai un parsing silenziosamente sbagliato.
 */
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export class SkillRegistryError extends Error {
  constructor(message, code = 'SKILL_INVALID') {
    super(message);
    this.name = 'SkillRegistryError';
    this.code = code;
  }
}

const NOME_CARTELLA_SKILLS = '.harness-ui-skills';
const NOME_FILE_SKILL = 'SKILL.md';

/**
 * Parsa il frontmatter minimo (`chiave: valore`, una riga per coppia,
 * fra due delimitatori `---`) di un SKILL.md. Torna
 * `{campi, corpo}` — `campi` è un oggetto piatto stringa→stringa,
 * `corpo` è tutto ciò che segue il secondo `---` (il markdown vero).
 */
function analizzaSkillMd(testo, skillId) {
  const righe = testo.split('\n');
  if (righe[0]?.trim() !== '---') {
    throw new SkillRegistryError(`${skillId}/SKILL.md deve iniziare con un frontmatter "---"`, 'SKILL_MALFORMED');
  }
  const fineFrontmatter = righe.findIndex((r, i) => i > 0 && r.trim() === '---');
  if (fineFrontmatter === -1) {
    throw new SkillRegistryError(`${skillId}/SKILL.md ha un frontmatter mai chiuso (manca il secondo "---")`, 'SKILL_MALFORMED');
  }
  const campi = {};
  for (const riga of righe.slice(1, fineFrontmatter)) {
    if (riga.trim() === '') continue;
    const indice = riga.indexOf(':');
    if (indice === -1) {
      throw new SkillRegistryError(`${skillId}/SKILL.md ha una riga di frontmatter non valida (attesa "chiave: valore"): "${riga}"`, 'SKILL_MALFORMED');
    }
    const chiave = riga.slice(0, indice).trim();
    const valore = riga.slice(indice + 1).trim();
    campi[chiave] = valore;
  }
  /*
   * ⛔ `/^[\r\n]+/`, non `/^\n+/`: un file con terminatori CRLF (comune
   * su Windows — stesso difetto già visto altrove in questo progetto,
   * `scrivere-un-file-da-python-lo-converte-in-crlf.md` in memoria)
   * lascerebbe un `\r` isolato davanti al corpo altrimenti — verificato
   * dal vivo il 29/8 leggendo un vero SKILL.md con CRLF, non presunto.
   */
  const corpo = righe.slice(fineFrontmatter + 1).join('\n').replace(/^[\r\n]+/, '');
  return { campi, corpo };
}

/**
 * Legge `<cartella>/.harness-ui-skills/*\/SKILL.md`. Un progetto senza
 * skill dichiarate è uno stato valido — mai un errore, torna
 * `{skills: []}`. Una singola skill malformata FERMA l'intero
 * caricamento con un errore dichiarato (mai una skill fantasma
 * ignorata in silenzio, stesso principio di caricaHooks/caricaServerMcp)
 * — l'owner che ha sbagliato a scrivere un file deve saperlo.
 */
export async function caricaSkill({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaSkills = join(cartella, NOME_CARTELLA_SKILLS);
  let voci;
  try {
    voci = await readdirFn(cartellaSkills, { withFileTypes: true });
  } catch (errore) {
    if (errore?.code === 'ENOENT') return { skills: [] };
    throw new SkillRegistryError(`Impossibile leggere ${NOME_CARTELLA_SKILLS}: ${errore.message}`, 'SKILL_READ_FAILED');
  }
  const skills = [];
  for (const voce of voci) {
    if (!voce.isDirectory()) continue; // un file sciolto dentro .harness-ui-skills/ non è una skill
    const skillId = voce.name;
    const percorso = join(cartellaSkills, skillId, NOME_FILE_SKILL);
    let testo;
    try {
      testo = await readFileFn(percorso, 'utf8');
    } catch (errore) {
      if (errore?.code === 'ENOENT') continue; // una sottocartella senza SKILL.md non è una skill, non è un errore
      throw new SkillRegistryError(`Impossibile leggere ${skillId}/${NOME_FILE_SKILL}: ${errore.message}`, 'SKILL_READ_FAILED');
    }
    const { campi, corpo } = analizzaSkillMd(testo, skillId);
    if (typeof campi.name !== 'string' || campi.name.length === 0) {
      throw new SkillRegistryError(`${skillId}/SKILL.md manca di "name" nel frontmatter`, 'SKILL_MALFORMED');
    }
    if (typeof campi.description !== 'string' || campi.description.length === 0) {
      throw new SkillRegistryError(`${skillId}/SKILL.md manca di "description" nel frontmatter`, 'SKILL_MALFORMED');
    }
    skills.push({ id: skillId, name: campi.name, description: campi.description, corpo });
  }
  // ⭐ ordine deterministico — mai dipendere dall'ordine che il filesystem restituisce (varia per OS).
  skills.sort((a, b) => a.id.localeCompare(b.id));
  return { skills };
}
