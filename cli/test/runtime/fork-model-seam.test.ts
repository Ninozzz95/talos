/* ⛔ Fase B repair (06/10/2026) — IL TEST che mancava (revisione fase B: «cecità dei test alla
   cucitura», P1/P3 bocciati perché ogni layer era provato solo contro finti). Attraversa
   facade→kernel col registro VERO di harness-ui: fino alla riparazione il facade passava
   `{modello}` mentre il kernel destruttura `{primaDelGiro, modelloRichiesta}`
   (session-registry.mjs:7576) — `--model` su `--fork` moriva in silenzio e il figlio ereditava
   `originale.modello` (:7656). Qui si prova il CONTRATTO VERO: col flag il figlio parte col
   modello richiesto e il padre resta; senza flag il figlio eredita il padre. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSessionFacade } from '../../src/runtime/session-facade.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/* Le dipendenze di terzi di harness-ui possono mancare in un albero di lavoro (lezione B1 slice 12,
   broker-wiring): in quel caso si SALTA nominandole. Un file di harness-ui mancante NON è un
   pacchetto di terzi: quello resta un rosso. */
async function pacchettoMancante(): Promise<string | null> {
  try { await import(pathToFileURL(join(REPO_ROOT, 'harness-ui', 'src', 'session-registry.mjs')).href); }
  catch (error: any) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && /^Cannot find package /u.test(String(error?.message)))
      return `harness-ui dependencies are not installed here (${String(error.message).split(' imported from')[0]})`;
    throw error;
  }
  return null;
}
const GAP = await pacchettoMancante();
const moduloRegistro: any = GAP ? null : await import(pathToFileURL(join(REPO_ROOT, 'harness-ui', 'src', 'session-registry.mjs')).href);

/** Giri finti: `concludi` chiude il giro PENDENTE più recente con una cronologia canonica. */
function giriFinti() {
  const inputs: any[] = [];
  let risolvi: ((esito: unknown) => void) | null = null;
  let onEvento: ((e: unknown) => void) | null = null;
  return {
    avviaSessioneFn: async (input: any) => {
      inputs.push(input); onEvento = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${inputs.length}` });
      return new Promise((r) => { risolvi = r; });
    },
    concludi(messaggiFinali: unknown[]) {
      onEvento?.({ type: 'RunFinished', threadId: 't1', runId: `r${inputs.length}` });
      risolvi?.({ esito: { messaggiFinali, comeFinita: 'concluso' } });
    },
  };
}

async function aspetta(dato: () => boolean, cosa: string): Promise<void> {
  for (let i = 0; i < 200 && !dato(); i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.ok(dato(), `timed out waiting for ${cosa}`);
}

test('la cucitura facade→kernel col registro VERO: --model su fork prende SOLO il figlio, il padre resta', { skip: GAP ?? false }, async (t) => {
  const cartellaStore = await mkdtemp(join(tmpdir(), 'fork-seam-'));
  /* Il registro verifica il percorso di progetto DAL VIVO (PROJECT_NOT_ALLOWED): serve una cartella vera. */
  const progetto = await mkdtemp(join(tmpdir(), 'fork-seam-progetto-'));
  await mkdir(join(progetto, 'sottocartella'), { recursive: true });
  t.after(async () => {
    await rm(cartellaStore, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(progetto, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const finta = giriFinti();
  const registry = moduloRegistro.createSessionRegistry({
    cartellaStore, avviaSessioneFn: finta.avviaSessioneFn,
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    modello: 'm', chiave: 'k',
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto', nome: 'progetto' }],
  });
  const runtime = createSessionFacade(registry, { model: 'm' });
  const padre = await runtime.start({ projectRoot: progetto, prompt: 'compito' } as any);
  finta.concludi([{ role: 'assistant', content: 'fatto' }]);
  await aspetta(() => (registry.elenca() as any[]).some((r) => r?.sessionId === padre && r?.conclusa === true), 'parent turn conclusion');

  /* Col flag: il figlio parte col modello richiesto, il padre non si tocca. */
  const figlioColFlag = await runtime.fork(padre, 'riparti da qui', undefined, { model: 'nuovo:m' });
  /* Senza flag: il figlio eredita il modello del padre (comportamento documentato a :7656). */
  const figlioSenzaFlag = await runtime.fork(padre, 'anche tu', undefined);

  const righe = () => registry.elenca() as any[];
  await aspetta(() => righe().some((r) => r?.sessionId === figlioColFlag) && righe().some((r) => r?.sessionId === figlioSenzaFlag), 'child session rows');
  const rigaPadre = righe().find((r) => r?.sessionId === padre);
  const rigaColFlag = righe().find((r) => r?.sessionId === figlioColFlag);
  const rigaSenzaFlag = righe().find((r) => r?.sessionId === figlioSenzaFlag);
  assert.equal(rigaColFlag?.modello, 'nuovo:m',
    'il figlio parte col modello richiesto: la chiave è `modelloRichiesta` (session-registry.mjs:7576), non `modello`');
  assert.equal(rigaSenzaFlag?.modello, 'm', 'senza flag il figlio eredita il modello del padre');
  assert.equal(rigaPadre?.modello, 'm', 'il padre conserva il proprio modello: mai toccato da nessun fork');
  assert.notEqual(figlioColFlag, padre);
  assert.notEqual(figlioSenzaFlag, padre);

  /* I due giri dei figli sono in volo: si chiudono puliti per non lasciare giri pendenti. */
  finta.concludi([{ role: 'assistant', content: 'fatto col flag' }]);
  finta.concludi([{ role: 'assistant', content: 'fatto senza flag' }]);
});
