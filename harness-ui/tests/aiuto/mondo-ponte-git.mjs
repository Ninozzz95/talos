import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { creaServizioGit } from '../../src/git-service.mjs';
import { createHttpApp } from '../../src/http-app.mjs';
import { iscriviConRigiocata } from '../../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './rimuovi-cartella-di-prova.mjs';

/*
 * Il banco del ponte con un repository VERO e le rotte VERE del PC (contratto a lista bianca, 31/10/2026). Il dispositivo vede solo ciò che le voci lasciano uscire; `consentite` e
 *   `bloccate` sono le cartelle per il dispositivo. `sotto`: la sessione lavora in una sottocartella del repository. `consentite` assente: tutto consentito.
 */
const chiave = (p) => String(p).replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase();
const dentroOUguale = (p, b) => chiave(p) === chiave(b) || chiave(p).startsWith(`${chiave(b)}/`);

export const contestoDelDispositivo = () => ({ dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} });

export function mondoPonteGit(t, { sotto = null, consentite = null, bloccate = [], registro = {}, eseguiGitFn = null } = {}) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-ponte-lista-')));
  t.after(() => rimuoviCartellaDiProva(base));
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const remoto = join(base, 'remoto.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto]);
  const seme = join(base, 'seme');
  execFileSync('git', ['clone', '-q', remoto, seme], { stdio: 'ignore' });
  g(seme, 'config', 'user.email', 'a@example.invalid'); g(seme, 'config', 'user.name', 'A');
  writeFileSync(join(seme, 'a.txt'), 'uno\ndue\ntre\n'); mkdirSync(join(seme, 'sub'), { recursive: true }); mkdirSync(join(seme, 'altra'), { recursive: true });
  writeFileSync(join(seme, 'sub', 's.txt'), 'dentro\n'); writeFileSync(join(seme, 'altra', 'fuori.txt'), 'fuori\n');
  g(seme, 'add', '.'); g(seme, 'commit', '-q', '-m', 'primo'); g(seme, 'push', '-q', '-u', 'origin', 'main');
  const dir = join(base, 'A');
  execFileSync('git', ['clone', '-q', remoto, dir], { stdio: 'ignore' });
  g(dir, 'config', 'user.email', 'a@example.invalid'); g(dir, 'config', 'user.name', 'A');
  const cartella = sotto ? join(dir, sotto) : dir;
  const sessionRegistry = { elenca: () => [], esiste: () => true, async cartellaPerChatFile() { return { ok: true, cartella }; }, cartellaDi: () => cartella, ...registro };
  const gitService = creaServizioGit({ cartellaDiSessione: () => sessionRegistry.cartellaDi(), eseguiGitFn });
  const stato = { consentite, bloccate };
  const cartelle = {
    /* come il vero (`cartelle-dispositivi.mjs`, `consentitaReale`): la cartella esatta, una cartella sopra non basta, e dentro un blocco non c'è consenso: il nega vince */
    consentita: async (_d, c) => !stato.bloccate.some((b) => dentroOUguale(c, b)) && (stato.consentite === null || stato.consentite.some((x) => chiave(x) === chiave(c))),
    descrivi: async (p) => ({ cartellaId: `id-${basename(p)}`, nome: basename(p) }),
    elenco: async () => [],
  };
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, gitService, cartelleDispositiviFn: () => cartelle });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle, bloccateDi: async () => stato.bloccate });
  const contesto = contestoDelDispositivo();
  const op = (nome, args = {}) => operazioni.esegui(`session.git.${nome}`, { sessionId: 's1', ...args }, contesto);
  return { base, cartella, chiama, contesto, dir, g, op, operazioni, remoto, seme, sessionRegistry, stato };
}
