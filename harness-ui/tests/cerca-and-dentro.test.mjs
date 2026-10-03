/*
 * ⛔⛔⛔ T-13 (audit ZIP revisione, 28/09/2026; owner: «Sì, nella 19», D6: «AND fra testo e nome»
 * + parametro `dentro`) — l'attrezzo `cerca` aveva due buchi misurati nel piano §1.3:
 *
 * 1. `testo` e `nome` insieme tornavano l'UNIONE (i file col testo + i file col nome), non
 *    l'AND: chiedere «namespace» fra i «.mjs» restituiva anche i .md col testo. La consegna
 *    citava ENTRAMBI i vincoli e il risultato rispettava solo il primo.
 * 2. Nessun modo di restringere a una sottocartella, mentre l'avviso stesso del tetto diceva
 *    «Search inside a subfolder» — una via che NON ESISTEVA.
 *
 * Cura (piano 0.1.19 §1.3): AND vero (solo i file che matchano ENTRAMBI), nuovo campo `dentro`
 * (sottocartella del workspace, e.g. "src"), e l'avviso che ora dice la via vera:
 * «Search inside a subfolder with `dentro`».
 *
 * Ricerca prima della cura (fonti con data, 28/09/2026):
 *  · opencode `packages/opencode/src/tool/grep.ts:12-16` (clone 2026-09-24): `path` (la
 *    sottocartella) + `include` (il filtro nome) — chi cerca DENTRO e PER NOME filtra entrambi.
 *  · Hermes `tools/file_tools.py:1269-1277` SEARCH_FILES_SCHEMA (clone 2026-09-24): `path`
 *    («Directory or file to search in») + `file_glob` («Filter files by pattern in grep mode»).
 *  · claude-code `package/sdk-tools.d.ts` GrepInput: `path` («File or directory to search in
 *    (rg PATH)») + `glob` («maps to rg --glob») — stesso disegno, e nomina il mapping.
 *  · ripgrep GUIDE.md (letto 28/09/2026): «ripgrep limited its search to the `src` directory» —
 *    il PATH argomento restringe la ricerca; i glob filtrano i file cercati.
 *
 * ⛔ Queste prove girano nei DUE VERSI e sulle DUE STRADE: l'AND deve mordere sia con ripgrep
 * (l'ambiente desktop lo risolve da `@vscode/ripgrep`) sia senza (camminata JS, forzata con
 * `TALOS_RG_PATH` a un percorso inesistente — la stessa leva che usa la CLI per il suo rg).
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cercaNelProgetto } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function discoVero(radice) {
    return {
        async elenca(dentro = '') {
            const { readdir, stat } = await import('node:fs/promises');
            const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true });
            return Promise.all(voci.map(async (v) => ({
                nome: v.name,
                cartella: v.isDirectory(),
                byte: v.isDirectory() ? 0 : (await stat(join(radice, dentro, v.name)).catch(() => ({ size: 0 }))).size,
            })));
        },
        async leggi(percorso) {
            const { readFile } = await import('node:fs/promises');
            return readFile(join(radice, ...percorso.split('/')), 'utf8');
        },
    };
}

function cartellaDiProva(t, prefisso) {
    const cartella = mkdtempSync(join(tmpdir(), prefisso));
    t.after(() => rimuoviCartellaDiProva(cartella));
    return cartella;
}

/* L'albero dei test AND: un .mjs col testo, un .md con LO STESSO testo, un .md senza. */
function alberoAnd(cartella) {
    mkdirSync(join(cartella, 'src'), { recursive: true });
    writeFileSync(join(cartella, 'src', 'modulo.mjs'), 'export const x = 1; // namespace AND-V4\n');
    writeFileSync(join(cartella, 'src', 'leggimi.md'), '# note\nqui c\'è pure namespace AND-V4\n');
    writeFileSync(join(cartella, 'altro.txt'), 'niente di rilevante\n');
}

/* L'albero dei test DENTRO: la stessa parola in due sottocartelle sorelle. */
function alberoDentro(cartella) {
    mkdirSync(join(cartella, 'src'), { recursive: true });
    mkdirSync(join(cartella, 'test'), { recursive: true });
    writeFileSync(join(cartella, 'src', 'dentro.mjs'), 'const dentro = "TESTO_DENTRO_V4";\n');
    writeFileSync(join(cartella, 'test', 'fuori.mjs'), 'const fuori = "TESTO_DENTRO_V4";\n');
}

/* ─────────────────────────── l'AND, con ripgrep (la via del desktop) ─────────────────────── */

test('⭐⭐⭐ T-13-01 — testo E nome insieme: solo i file che matchano ENTRAMBI', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-and-');
    alberoAnd(cartella);
    const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'namespace AND-V4', nome: '.mjs' }, { radice: cartella });
    assert.match(esito, /modulo\.mjs/u, 'il file .mjs col testo è un risultato');
    assert.doesNotMatch(esito, /leggimi\.md/u,
        '⛔ prima della cura il .md con lo stesso testo tornava anche lui: era UNIONE, non AND');
});

test('⭐⭐⭐ T-13-02 — `dentro:"src"` non trova ciò che sta in `test/`', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-dentro-');
    alberoDentro(cartella);
    const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'TESTO_DENTRO_V4', dentro: 'src' }, { radice: cartella });
    assert.match(esito, /src\/dentro\.mjs/u, 'la ricerca entra nella sottocartella chiesta');
    assert.doesNotMatch(esito, /fuori\.mjs/u,
        '⛔ prima della cura `dentro` era ignorato del tutto: la ricerca girava su tutto il workspace');
});

test('⭐⭐⭐ T-13-03 — `dentro:".."` esce dal workspace: REFUSED col motivo, niente ricerca', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-risalita-');
    mkdirSync(join(cartella, 'src'), { recursive: true });
    writeFileSync(join(cartella, 'src', 'a.mjs'), 'TOKEN_RISALITA_V4\n');
    const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'TOKEN_RISALITA_V4', dentro: '..' }, { radice: cartella });
    assert.match(esito, /^INVALID\./u, 'una sottocartella che risale fuori non è un luogo di ricerca (H-05: argomento sbagliato)');
    assert.match(esito, /workspace/u, 'il motivo lo dice a parole');
    assert.doesNotMatch(esito, /a\.mjs/u, 'e la ricerca non è mai partita');
});

test('⭐⭐⭐ T-13-04 — `dentro` a una cartella che NON ESISTE: REFUSED onesto, non «non c\'è»', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-sconosciuta-');
    writeFileSync(join(cartella, 'a.mjs'), 'TOKEN_SCONOSCIUTA_V4\n');
    const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'TOKEN_SCONOSCIUTA_V4', dentro: 'cartella-che-non-esiste' }, { radice: cartella });
    assert.match(esito, /REFUSED|is not a folder/u,
        '⛔ prima della cura rispondeva «no file matches»: il modello leggeva «la parola non c\'è» dove la cartella non c\'era');
});

test('⭐⭐⭐ T-13-05 — tutti e tre insieme: testo AND nome DENTRO la sottocartella', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-tutti-');
    alberoAnd(cartella);
    writeFileSync(join(cartella, 'modulo.mjs'), 'fuori posto: namespace AND-V4\n');
    const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'namespace AND-V4', nome: '.mjs', dentro: 'src' }, { radice: cartella });
    assert.match(esito, /src\/modulo\.mjs/u);
    assert.doesNotMatch(esito, /leggimi\.md/u, 'il nome esclude il .md');
    assert.doesNotMatch(esito, /^modulo\.mjs$/mu, 'e `dentro` esclude la copia fuori dalla sottocartella');
});

/* ──────────────────── i contrari: ciò che NON deve cambiare di un byte ──────────────────── */

test('⛔ T-13-06 — solo `nome` (senza testo): l\'elenco per nome resta quello di sempre', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-solo-nome-');
    alberoAnd(cartella);
    const esito = await cercaNelProgetto(discoVero(cartella), { nome: 'modulo' }, { radice: cartella });
    assert.match(esito, /modulo\.mjs/u, 'la ricerca per puro nome continua a funzionare');
    assert.doesNotMatch(esito, /leggimi\.md/u, 'e non allarga: il nome è ancora il solo vincolo');
});

test('⛔ T-13-07 — solo `testo` (senza nome): trova anche nei .md, come sempre', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-solo-testo-');
    alberoAnd(cartella);
    const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'namespace AND-V4' }, { radice: cartella });
    assert.match(esito, /modulo\.mjs/u);
    assert.match(esito, /leggimi\.md/u,
        'senza `nome` il filtro nome NON esiste: togliere il .md qui sarebbe l\'AND arrivato dove non era chiamato');
});

/* ──────────── (d) senza ripgrep: la camminata JS, la stessa semantica dell'AND ───────────── */

const senzaRipgrep = async (corpo) => {
    const prima = process.env.TALOS_RG_PATH
    process.env.TALOS_RG_PATH = join(tmpdir(), 'rg-inesistente-per-t13.exe')
    try { return await corpo() } finally { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima }
}

test('⭐⭐⭐ T-13-08 — senza ripgrep l\'AND vale uguale: la camminata JS non è la via larga', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-js-and-');
    alberoAnd(cartella);
    await senzaRipgrep(async () => {
        const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'namespace AND-V4', nome: '.mjs' }, { radice: cartella });
        assert.match(esito, /modulo\.mjs/u);
        assert.doesNotMatch(esito, /leggimi\.md/u, '⛔ il ripiego JS aveva lo stesso difetto di unione');
    });
});

test('⭐⭐⭐ T-13-09 — senza ripgrep `dentro` vale uguale: solo la sottocartella', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-js-dentro-');
    alberoDentro(cartella);
    await senzaRipgrep(async () => {
        const esito = await cercaNelProgetto(discoVero(cartella), { testo: 'TESTO_DENTRO_V4', dentro: 'src' }, { radice: cartella });
        assert.match(esito, /src\/dentro\.mjs/u);
        assert.doesNotMatch(esito, /fuori\.mjs/u, '⛔ il ripiego JS ignorava `dentro` come la via rg');
    });
});

test('⛔ T-13-10 — senza ripgrep, solo `nome`: la camminata resta quella di sempre', async (t) => {
    const cartella = cartellaDiProva(t, 'talos-t13-js-nome-');
    alberoAnd(cartella);
    await senzaRipgrep(async () => {
        const esito = await cercaNelProgetto(discoVero(cartella), { nome: 'modulo' }, { radice: cartella });
        assert.match(esito, /modulo\.mjs/u);
    });
});
