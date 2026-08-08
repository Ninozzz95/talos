#!/usr/bin/env node
/**
 * Ciò che va rimesso in testa DOPO che il contesto è stato compattato.
 *
 * ## Il difetto che lo fa nascere
 *
 * Questa sessione ha superato la compattazione una volta, e il riassunto ha
 * fatto il suo lavoro. Ma un riassunto conserva la NARRAZIONE e perde due cose
 * che non sono narrazione:
 *
 * 1. **I contratti d'uscita.** Dopo la compattazione non sapevo più che esiste
 *    `⛔ FERMATA:`. Una via d'uscita che si dimentica è una via d'uscita che
 *    non c'è.
 * 2. ⛔ **I numeri misurati sul dispositivo.** Il 2026-08-08 ho ri-dedotto per
 *    plausibilità tre volte cose che avevo già misurato — e ogni deduzione è
 *    costata un giro di build e installazione. Un riassunto scrive «la
 *    grammatica non compilava»; quello che serve è `55.871 byte, 46 tool,
 *    "number of rules ... exceeds sane defaults"`.
 *
 * La ricerca su questo è concorde e recente: Anthropic elenca fra le tecniche
 * per gli agenti a lungo orizzonte la **presa di appunti strutturata** — un
 * file fuori dal contesto che l'agente tiene aggiornato — e la **reiniezione**
 * dopo la compattazione, proprio con l'evento `SessionStart` e matcher
 * `compact`. È l'unico hook la cui uscita standard diventa contesto.
 *
 * ## Cosa rimette, e cosa NON rimette
 *
 * Rimette poco, di proposito: il contesto è una risorsa finita, e un hook che
 * ci riversa dentro mezza memoria fa il danno che dovrebbe evitare. Quindi
 * soltanto:
 *
 * - le tre vie d'uscita dichiarabili, che sono un contratto e non un consiglio;
 * - il **taccuino**, se esiste: i fatti MISURATI in questa sessione, che sono
 *   la cosa più cara da ricomprare e l'unica che nessun riassunto ricostruisce.
 *
 * Non rimette le regole di ingegneria: quelle stanno in `MEMORY.md` e arrivano
 * comunque a ogni sessione. Ripeterle qui sarebbe pagare due volte.
 *
 * ## Il taccuino
 *
 * `.claude/TACCUINO.md`, che tengo io. Non è un diario: è l'elenco dei fatti
 * che ho **misurato** e che costerebbero un altro giro sul dispositivo per
 * riaverli. Se è vuoto, questo hook non stampa niente — un promemoria vuoto è
 * solo rumore.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTRATTI = [
    'PROMEMORIA DOPO LA COMPATTAZIONE — le tre uscite dichiarabili, che il riassunto non conserva:',
    '',
    '  ⛔ FERMATA: <motivo>          per chiudere il turno quando servi davvero all\'owner',
    '  ⛔ NON VERIFICATO: <cosa>     per chiudere un turno in cui hai toccato codice senza provarlo',
    '  git push                      e\' bloccato da un hook: e\' dell\'owner, sempre',
].join('\n')

export function componiPromemoria(taccuino) {
    const appunti = String(taccuino ?? '').trim()
    if (!appunti) return CONTRATTI
    return [
        CONTRATTI,
        '',
        'E i fatti MISURATI in questa sessione — non ri-dedurli, sono gia\' costati:',
        '',
        appunti,
    ].join('\n')
}

function main() {
    const radice = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    let taccuino = ''
    try {
        taccuino = readFileSync(join(radice, '.claude', 'TACCUINO.md'), 'utf8')
    } catch {
        // Nessun taccuino: si stampano i soli contratti.
    }
    process.stdout.write(componiPromemoria(taccuino))
    process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('dopo-la-compattazione.mjs')) main()
