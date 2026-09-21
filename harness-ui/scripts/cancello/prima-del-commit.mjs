#!/usr/bin/env node
/**
 * L'hook `pre-commit`: il cancello delle regole vincolanti, montato dove non si può ignorare.
 *
 * ⛔⛔⛔ 07/09/2026 — IL BUCO ERA IO. Per mesi ho committato con `-c core.hooksPath=/dev/null` per
 *   togliere il co-authoring che le istruzioni di sistema impongono: così facendo disattivavo OGNI
 *   hook, cioè ogni cancello che l'owner potesse mettere sul commit. Un controllo che chi controlla
 *   può spegnere non è un controllo.
 * ⇒ Da qui in poi: gli hook restano ACCESI, e il co-authoring lo toglie questo cancello — che lo
 *   rifiuta invece di lasciarlo passare in silenzio.
 *
 * Come si installa (una volta sola, e sta nel repo, quindi vale per chiunque):
 *     git config core.hooksPath .githooks
 *
 * Cosa fa: legge i file nell'indice e il messaggio, chiede a `regole-vincolanti.mjs` un giudizio, e
 * se il giudizio è NO esce con 1 — il commit non parte. Nessuna riga di memoria da ricordare,
 * nessuna buona volontà richiesta: è la stessa idea degli hook dei CLI di coding, che «enforce rules
 * deterministically — they run regardless of what the LLM decides» (ricerca 07/09/2026).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { giudica, fileNellIndice } from './regole-vincolanti.mjs';

const radice = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
/*
 * ⛔ 07/9 — due fasi, due domande diverse. `pre-commit` NON conosce il messaggio: `.git/COMMIT_EDITMSG`
 *   in quel momento contiene quello di PRIMA (o niente), e chiedergli la citazione della ricerca
 *   significa accusare a caso — è successo al primo giro, su un messaggio che la citava eccome.
 *   Perciò: `--solo-prove` guarda le foto, `commit-msg` guarda il testo, ognuno ciò che può sapere.
 */
const soloProve = process.argv.includes('--solo-prove');
const percorsoMessaggio = process.argv.find((a) => a && !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) || '.git/COMMIT_EDITMSG';
let messaggio = '';
if (!soloProve) {
  try { messaggio = readFileSync(percorsoMessaggio.startsWith('/') || /^[A-Za-z]:/.test(percorsoMessaggio) ? percorsoMessaggio : `${radice}/${percorsoMessaggio}`, 'utf8'); } catch { messaggio = ''; }
}

const fileToccati = fileNellIndice(radice);
/* nella fase delle prove il messaggio non c'è: si finge citato, così l'unica domanda è quella giusta */
const esito = giudica({ radice, fileToccati, messaggio: soloProve ? 'misurato' : messaggio });

if (!esito.ok) {
  const riga = '─'.repeat(78);
  process.stderr.write(`\n${riga}\n⛔ COMMIT FERMATO — regole vincolanti dell'owner\n${riga}\n`);
  for (const motivo of esito.motivi) process.stderr.write(`\n  · ${motivo}\n`);
  process.stderr.write(`\n  File della UI in questo commit: ${esito.dettagli.visibili.length}\n`);
  if (esito.dettagli.foto) {
    process.stderr.write(`  Foto più recente: ${new Date(esito.dettagli.foto).toLocaleString('it-IT')}\n`);
    process.stderr.write(`  Ultima modifica:  ${new Date(esito.dettagli.codice).toLocaleString('it-IT')}\n`);
  }
  process.stderr.write(`\n  Non si aggira: si guarda il 4174, si scatta la foto, e si commette.\n${riga}\n\n`);
  process.exit(1);
}
