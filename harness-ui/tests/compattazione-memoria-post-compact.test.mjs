/*
 * ⭐ 06/10/2026 — CURA MEMORIA POST-COMPACT (opzione A + C-a + C-b, ricerca 5×5×5×5 §6.4:
 * `scratchpad/ricerca-5x5x5x5-compattazione-memoria-post-compact-2026-10-06.md`).
 *
 * Cosa prova, con i casi NOMINATI:
 *  (a) RICARICA-A  — dopo il compact il blocco di fatti freschi c'è ed è FUSO nello STESSO messaggio di
 *      compattazione (un solo cache-break): mai un giro separato, mai un messaggio in più (mutanti M1+M3).
 *  (b) RICARICA-A  — il blocco contiene SOLO fatti e puntatori: `contieneDirettiva` è la prova automatica
 *      del vincolo 2 del capitolato (mutante M2).
 *  (c) RICARICA-CA — i prompt di sintesi (kernel, locale, desktop) portano le regole VERBATIM: richieste
 *      pendenti quotate e azioni irreversibili CON HASH COMPLETO (mutante M4).
 *  (d) RICARICA-CB — la sintesi è RECINTATA: il prefisso stile hermes «REFERENCE ONLY, l'ultimo messaggio
 *      utente vince» sta fra il marcatore e il riassunto, nello stesso messaggio.
 *  (e) RICARICA-E  — fail-soft: una fonte illeggibile NON fa fallire il compact, il blocco lo dichiara
 *      onestamente (mutante M5).
 *  (K3) il contratto a DUE argomenti resta byte per byte quello di prima (kernel, locale, proiezione desktop).
 *
 * Le letture di rete NON esistono: i test usano file temporanei, un `git log` LOCALE che su una cartella
 * fuori repo fallisce (ed è proprio il caso fail-soft provato), e modelli finti. Nessuna asserzione dei
 * test esistenti è toccata: questo file è additivo.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    PREFISSO_SINTESI_RECINTATA,
    INTESTAZIONE_BLOCCO_FATTI,
    CARATTERI_BLOCCO_MASSIMI,
    MARCATORE_BLOCCO_TAGLIATO,
    contieneDirettiva,
    costruisciBloccoFatti,
} from '../src/kernel/ricarica-post-compact.mjs';
import { compattaConversazione, GIRI_PRIMA_DI_COMPATTARE } from '../src/kernel/talosHarness.mjs';
import { MARCATORE_RIASSUNTO, costruisciProiezione, testoRichiestaDiRiassunto } from '../src/kernel/compattazione-desktop.mjs';
import { compattaConversazioneLocale, createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { compattaSessione } from '../src/agent-service.mjs';

/* ── il banco di prova: storia minima, riassunto finto senza sorprese ─────────────────────────── */
const SISTEMA = { role: 'system', content: 'istruzioni del sistema' };
const COMPITO = { role: 'user', content: 'il compito vero della persona, parola per parola' };
const STORIA = [SISTEMA, COMPITO, { role: 'assistant', content: 'lavoro fatto finora' }];
const RIASSUNTO_FINTO = 'Decisioni: scelta X. File: src/a.mjs. Risultati: prova Y verde.';
const chiamaModelloFisso = async () => ({
    scelta: { content: RIASSUNTO_FINTO },
    usage: { prompt_tokens: 500, completion_tokens: 50 },
    finishReason: 'stop',
});
const MARCATORE_KERNEL = `[conversation compacted at turn ${GIRI_PRIMA_DI_COMPATTARE}: what follows is a summary, not the original history]`;

/* Il cestino dei provini: LEDGER veri su disco e una cartella FUORI repo (il `git log` locale ci fallisce:
 * è il caso fail-soft provato, senza nessuna rete). */
const provino = await mkdtemp(join(tmpdir(), 'ricarica-post-compact-'));
const ledgerReale = join(provino, 'LEDGER-TEST.md');
await writeFile(ledgerReale, 'LEDGER-TEST · coda append-only: la cura memoria è in consegna', 'utf8');
const fuoriRepo = join(provino, 'fuori-repo');
after(async () => { await rimuoviCartellaDiProvaAttesa(provino); });

describe('RICARICA POST-COMPACT — la cura della memoria (opzione A + C-a + C-b, ricerca 5×5×5×5 §6.4)', () => {

    it('RICARICA-A · (a, M1+M3) il blocco di fatti è FUSO nello STESSO messaggio di compattazione: tre messaggi, non quattro', async () => {
        const r = await compattaConversazione(STORIA, chiamaModelloFisso, {
            ledgers: [ledgerReale],
            cartellaProgetto: fuoriRepo,
        });
        assert.equal(r.compattato, true, 'il compact riesce');
        assert.equal(r.messaggi.length, 3, 'sistema + compito + UN messaggio di compattazione: il blocco non è un messaggio separato (M3)');
        const contenuto = r.messaggi[2].content;
        assert.ok(contenuto.startsWith(MARCATORE_KERNEL), 'il marcatore di sempre apre il messaggio');
        assert.ok(contenuto.includes(INTESTAZIONE_BLOCCO_FATTI), 'il blocco di fatti calcolato dal CODICE è nel messaggio (M1: senza hook non c\'è)');
        assert.ok(contenuto.includes(RIASSUNTO_FINTO), 'il riassunto vero è nello stesso messaggio');
        assert.ok(contenuto.includes('LEDGER-TEST · coda append-only: la cura memoria è in consegna'),
            'il LEDGER dichiarato è stato LETTO FRESCO su disco al momento del compact, non ricordato');
        assert.ok(contenuto.includes('Recent commits (local git log'), 'la sezione dei commit c\'è sempre');
        const iMarcatore = contenuto.indexOf(MARCATORE_KERNEL);
        const iRecinto = contenuto.indexOf(PREFISSO_SINTESI_RECINTATA);
        const iRiassunto = contenuto.indexOf(RIASSUNTO_FINTO);
        const iBlocco = contenuto.indexOf(INTESTAZIONE_BLOCCO_FATTI);
        assert.ok(iMarcatore < iRecinto && iRecinto < iRiassunto && iRiassunto < iBlocco,
            'ordine nel messaggio unico: marcatore → recinto → riassunto → blocco di fatti');
    });

    it('RICARICA-A · (b, M2) il blocco contiene SOLO fatti e puntatori: nessuna direttiva operativa', async () => {
        const blocco = await costruisciBloccoFatti({
            ledgers: [ledgerReale],
            cartellaProgetto: fuoriRepo,
            codaPendente: ['la recensione della cura memoria è al padre'],
            pericoliAperti: ['BUG-16: la cura precedente è stata interrotta'],
            fileToccati: ['src/kernel/talosHarness.mjs', 'src/kernel/talosHarness.mjs'],
            fatti: ['Compaction record talos.compattazione.v1: coveredThrough=42 raw messages'],
        }, {
            eseguiGit: async () => ({ stdout: 'c8641ae66 fix(kernel): il puntatore che il compact aveva perso' }),
        });
        assert.equal(contieneDirettiva(blocco.testo), false,
            'il vincolo 2 del capitolato: nessun «riprendi da qui», nessuna direttiva — fatti e puntatori soltanto');
        assert.ok(blocco.testo.includes('c8641ae66'),
            'l\'hash del commit arriva PER LETTURA DEL CODICE (git log locale), non dalla memoria del riassuntore');
        assert.ok(blocco.testo.includes('src/kernel/talosHarness.mjs'), 'i file toccati sono puntatori, una volta sola');
        assert.ok(blocco.testo.includes('coveredThrough=42'), 'i fatti dichiarati dal chiamante entrano');
        assert.deepEqual(blocco.fontiLette, [ledgerReale, `git log ${fuoriRepo}`],
            'la contabilità delle fonti LETTE è onesta');
    });

    it('RICARICA-A · (b, M2) anche il messaggio fuso resta senza direttive: il blocco non spinge, il modello narra', async () => {
        const r = await compattaConversazione(STORIA, chiamaModelloFisso, {
            ledgers: [ledgerReale], cartellaProgetto: fuoriRepo,
        });
        const contenuto = r.messaggi[2].content;
        assert.equal(contieneDirettiva(contenuto), false,
            'marcatore, recinto, riassunto e blocco: nessuno contiene una direttiva operativa (M2)');
        const soloBlocco = contenuto.slice(contenuto.indexOf(INTESTAZIONE_BLOCCO_FATTI));
        assert.equal(contieneDirettiva(soloBlocco), false, 'il blocco da solo non contiene direttive');
    });

    it('RICARICA-A · il tetto del blocco: il CODICE taglia e LO DICE (iniettabile, il default è CARATTERI_BLOCCO_MASSIMI)', async () => {
        const blocco = await costruisciBloccoFatti({
            ledgers: ['ledger-enorme.md'],
            cartellaProgetto: null,
        }, {
            leggiFile: async () => 'x'.repeat(20_000),
            caratteriMassimi: 600, /* il meccanismo è lo stesso del tetto dichiarato (4000): qui lo stringo per renderlo osservabile. */
        });
        assert.ok(blocco.testo.length <= 600 + MARCATORE_BLOCCO_TAGLIATO.length + 2,
            'il blocco non reintroduce il contesto pieno: sta sotto il tetto');
        assert.ok(blocco.testo.includes(MARCATORE_BLOCCO_TAGLIATO), 'la coda tagliata si DICe, non si nasconde');
    });

    it('RICARICA-CA · (c, M4) il prompt di sintesi del KERNEL porta le regole VERBATIM: punti 5-6, hash completo', async () => {
        let richiestaVista = null;
        await compattaConversazione(STORIA, async (richiesta) => {
            richiestaVista = richiesta;
            return { scelta: { content: RIASSUNTO_FINTO }, usage: null, finishReason: 'stop' };
        });
        const prompt = richiestaVista[richiestaVista.length - 1].content;
        assert.ok(prompt.includes('5. Any question you asked the person that they have not answered yet, quoted VERBATIM.'),
            'le richieste pendenti NON si affidano al caso del riassunto (opencode summary.txt:10-11)');
        assert.ok(prompt.includes('6. Every irreversible action already taken (commit, push, publish, delete), VERBATIM with its'),
            'le azioni irreversibili entrano VERBATIM nel prompt');
        assert.ok(prompt.includes('the full commit hash, never a shorthand.'),
            'l\'hash COMPLETO, mai lo shorthand: è esattamente il c8641ae66 che il compact aveva perso');
    });

    it('RICARICA-CB · (d) la sintesi è RECINTATA: «REFERENCE ONLY, l\'ultimo messaggio utente vince» prima del riassunto', async () => {
        assert.ok(PREFISSO_SINTESI_RECINTATA.startsWith('[CONTEXT COMPACTION — REFERENCE ONLY]'),
            'il prefisso è quello stile hermes (context_compressor.py:265)');
        const r = await compattaConversazione(STORIA, chiamaModelloFisso, { ledgers: [ledgerReale] });
        const contenuto = r.messaggi[2].content;
        const iRecinto = contenuto.indexOf(PREFISSO_SINTESI_RECINTATA);
        const iRiassunto = contenuto.indexOf(RIASSUNTO_FINTO);
        assert.ok(iRecinto > -1 && iRiassunto > iRecinto,
            'il recinto sta PRIMA del riassunto, nello stesso messaggio: la sintesi è passaggio di consegne, non il giro attivo');
    });

    it('RICARICA-E · (e, M5) fonte illeggibile nel compact REALE: il blocco lo dichiara e il compact NON fallisce', async () => {
        const r = await compattaConversazione(STORIA, chiamaModelloFisso, {
            ledgers: [join(provino, 'ledger-inesistente.md')],
            cartellaProgetto: fuoriRepo,
        });
        assert.equal(r.compattato, true, 'una fonte che fallisce NON fa fallire la compattazione (M5)');
        assert.equal(r.messaggi.length, 3, 'il compact prosegue normalmente');
        const contenuto = r.messaggi[2].content;
        assert.ok(contenuto.includes('unreadable at compaction time'), 'il LEDGER mancante si DICE, col motivo');
        assert.ok(contenuto.includes('(unavailable: '), 'il git log su cartella fuori repo si DICE, non si tace e non lancia');
    });

    it('RICARICA-E · (e, M5) costruisciBloccoFatti NON lancia mai: EACCES e git assente diventano righe oneste', async () => {
        const blocco = await costruisciBloccoFatti({
            ledgers: ['ledger-senza-permessi.md'],
            cartellaProgetto: '/percorso/che/non-e-un-repo',
        }, {
            leggiFile: async () => { const e = new Error('permission denied'); e.code = 'EACCES'; throw e; },
            eseguiGit: async () => { throw new Error('git: not found'); },
        });
        assert.ok(blocco.testo.includes('unreadable at compaction time (EACCES'), 'il motivo onesto, in riga');
        assert.ok(blocco.testo.includes('(unavailable: git: not found'), 'il git fallito si dichiara');
        assert.deepEqual(blocco.fontiNonLette, ['ledger-senza-permessi.md', 'git log /percorso/che/non-e-un-repo'],
            'la contabilità delle fonti NON lette è onesta');
    });

    it('RICARICA-K3 · a DUE argomenti il messaggio compattato del KERNEL resta CARATTERE PER CARATTERE quello di prima', async () => {
        const r = await compattaConversazione(STORIA, chiamaModelloFisso);
        assert.equal(r.compattato, true);
        assert.equal(r.messaggi.length, 3);
        assert.equal(r.messaggi[2].content,
            `${MARCATORE_KERNEL}\n\n${RIASSUNTO_FINTO}`,
            'senza fonti dichiarate: niente recinto, niente blocco — il contratto K3 con la CLI è intatto');
        assert.equal(r.messaggi[2].content.includes(PREFISSO_SINTESI_RECINTATA), false);
        assert.equal(r.messaggi[2].content.includes(INTESTAZIONE_BLOCCO_FATTI), false);
    });

    it('RICARICA-K3 · il riassuntore LOCALE a due argomenti resta byte per byte quello di prima', async () => {
        const r = await compattaConversazioneLocale(STORIA, chiamaModelloFisso);
        assert.equal(r.compattato, true);
        const marcatoreLocale = r.messaggi[2].content.slice(0, r.messaggi[2].content.indexOf('\n\n'));
        assert.match(marcatoreLocale,
            /^\[conversation compacted at turn \d+: what follows is a summary, not the original history\]$/);
        assert.equal(r.messaggi[2].content, `${marcatoreLocale}\n\n${RIASSUNTO_FINTO}`,
            'solo marcatore e riassunto: niente recinto, niente blocco — contratto K3 intatto');
        assert.equal(r.messaggi[2].content.includes(PREFISSO_SINTESI_RECINTATA), false);
        assert.equal(r.messaggi[2].content.includes(INTESTAZIONE_BLOCCO_FATTI), false);
    });

    it('RICARICA-A · la maglia ADAPTER inoltra il terzo argomento al ramo locale: il blocco arriva a destinazione', async () => {
        const adapter = createOwnerRuntimeAdapter({ modulePath: '' }); // ramo LOCALE: nessun motore esterno da caricare
        const r = await adapter.compattaConversazione(STORIA, chiamaModelloFisso, {
            ledgers: [ledgerReale], cartellaProgetto: fuoriRepo,
        });
        assert.equal(r.compattato, true);
        assert.equal(r.messaggi.length, 3);
        assert.ok(r.messaggi[2].content.includes(INTESTAZIONE_BLOCCO_FATTI),
            'se l\'adapter scartasse il terzo argomento (com\'era all\'arrivo), il blocco non arriverebbe mai');
        assert.ok(r.messaggi[2].content.includes(PREFISSO_SINTESI_RECINTATA));
    });

    it('RICARICA-A · compattaSessione dichiara le fonti al TERZO parametro del riassuntore (e null senza fonti)', async () => {
        const viste = [];
        const spiadelRiassuntore = async (...argomenti) => { viste.push(argomenti); return { messaggi: argomenti[0], compattato: false, usage: null }; };
        const fonti = { ledgers: ['ledger-dichiarato-dal-registro.md'] };
        await compattaSessione({
            messaggiFinali: STORIA, modello: 'modello-di-prova', chiave: 'chiave-di-prova',
            compattaConversazioneFn: spiadelRiassuntore, fontiRicarica: fonti,
        });
        assert.equal(viste.length, 1);
        assert.equal(viste[0][2], fonti, 'le fonti dichiarate passano INTIERE al terzo parametro');
        await compattaSessione({
            messaggiFinali: STORIA, modello: 'modello-di-prova', chiave: 'chiave-di-prova',
            compattaConversazioneFn: spiadelRiassuntore,
        });
        assert.equal(viste[1][2], null, 'senza fonti il terzo parametro è null, non undefined: la firma resta pulita');
    });

    it('RICARICA-A · proiezione DESKTOP: blocco e recinto fusi nell\'UNICO messaggio user, mai un messaggio separato', () => {
        const testa = [SISTEMA];
        const richieste = [{ role: 'user', content: 'prima richiesta letterale' }];
        const coda = [{ role: 'user', content: 'ultimo messaggio vero: questo vince' }];
        const proiezione = costruisciProiezione({
            testa, richiesteLetterali: richieste, riassunto: RIASSUNTO_FINTO,
            indice: 'INDICE MECCANICO', coda,
            bloccoFatti: 'BLOCCO DI FATTI FRESCI', recintaSintesi: true,
        });
        assert.equal(proiezione.length, 4, 'testa + richieste + UN messaggio user + coda: il blocco non è un messaggio in più (M3)');
        assert.deepEqual(proiezione[2], {
            role: 'user',
            content: [MARCATORE_RIASSUNTO, PREFISSO_SINTESI_RECINTATA, RIASSUNTO_FINTO, 'INDICE MECCANICO', 'BLOCCO DI FATTI FRESCI'].join('\n\n'),
        }, 'marcatore → recinto → riassunto → indice → blocco: tutto in UN solo messaggio, un solo cache-break');
        assert.deepEqual(proiezione[3], coda[0], 'l\'ultimo messaggio vero resta DOPO: è lui che vince');
    });

    it('RICARICA-K3 · la proiezione DESKTOP senza i due parametri nuovi resta byte per byte quella di prima', () => {
        const proiezione = costruisciProiezione({
            testa: [SISTEMA], richiesteLetterali: [], riassunto: RIASSUNTO_FINTO, indice: 'INDICE', coda: [],
        });
        assert.deepEqual(proiezione[1].content, [MARCATORE_RIASSUNTO, RIASSUNTO_FINTO, 'INDICE'].join('\n\n'),
            'senza bloccoFatti/recintaSintesi: nessun recinto, nessun blocco (i test CTX-PURE la fissano già)');
        const ancheSenzaRecinto = costruisciProiezione({
            testa: [], richiesteLetterali: [], riassunto: RIASSUNTO_FINTO, indice: 'INDICE', coda: [],
            bloccoFatti: 'BLOCCO', recintaSintesi: false,
        });
        assert.equal(ancheSenzaRecinto[0].content.includes(PREFISSO_SINTESI_RECINTATA), false,
            'recintaSintesi=false: il recinto non entra anche se c\'è il blocco');
        assert.ok(ancheSenzaRecinto[0].content.endsWith('BLOCCO'));
    });

    it('RICARICA-CA · (c, M4) il prompt di sintesi DESKTOP porta le regole verbatim con l\'hash completo', () => {
        const prompt = testoRichiestaDiRiassunto({});
        assert.ok(prompt.includes('Preserve VERBATIM any question to the person left unanswered, and every irreversible action taken'),
            'le richieste pendenti restano nel riassunto, verbatim');
        assert.ok(prompt.includes('the full commit hash, never a shorthand.'),
            'hash completo mai shorthand: la regola zero-cost dell\'opzione C-a');
    });

    it('RICARICA-CA · (c, M4) anche il prompt di sintesi LOCALE porta le regole verbatim', async () => {
        let richiestaVista = null;
        await compattaConversazioneLocale(STORIA, async (richiesta) => {
            richiestaVista = richiesta;
            return { scelta: { content: RIASSUNTO_FINTO }, usage: null };
        });
        const prompt = richiestaVista[richiestaVista.length - 1].content;
        assert.ok(prompt.includes('Any question left unanswered to the person must be quoted VERBATIM'), 'regole verbatim nel locale');
        assert.ok(prompt.includes('the full commit hash.'), 'hash completo anche qui');
    });

});
