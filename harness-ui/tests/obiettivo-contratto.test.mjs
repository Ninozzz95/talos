/*
 * ⭐⭐⭐ /goal, fase G2 (piano approvato dall'owner il 14/10/2026) — IL CONTRATTO dell'obiettivo, da solo: `src/obiettivo/contratto.mjs`.
 *
 * Che cosa tiene fermo, nei due versi: i criteri sono tipizzati (comando · file · giudizio) e un criterio storto rifiuta TUTTO
 * il contratto (dsh-goalloop `lib/core.js:186-191`); un comando il cui esito non dice com'è andata non può essere un criterio
 * (Hermes `agent/verification_evidence.py:213-231`: pipe, `||`, `&`, `;`); l'impronta cambia se e solo se cambia ciò che il
 * contratto chiede; aggiungere è libero, togliere o cambiare vuole la persona (opencode-goal-plugin `src/goal-plan.ts:54-136`).
 * Letti nel codice il 12-14/10/2026.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMANDO_MASSIMO, CRITERI_MASSIMI, PERCORSO_MASSIMO, SCHEMA_CONTRATTO, TESTO_CERCATO_MASSIMO, TESTO_CRITERIO_MASSIMO,
  aggiungiCriteri, confrontaContratti, contrattoValido, esitoAttribuibile, nuovoContratto,
} from '../src/obiettivo/contratto.mjs';

const comando = (testo, cmd, extra = {}) => ({ testo, verifica: { tipo: 'comando', comando: cmd, ...extra } });
const file = (testo, percorso, fatto, extra = {}) => ({ testo, verifica: { tipo: 'file', percorso, fatto, ...extra } });
const giudizio = (testo) => ({ testo, verifica: { tipo: 'giudizio' } });
const TRE = [
  comando('The auth tests pass', 'node --test tests/auth'),
  file('The changelog names the fix', 'docs\\CHANGELOG.md', 'contiene', { testo: 'login loop' }),
  giudizio('The error message is clear to a person who is not a developer'),
];
const buono = (criteri = TRE) => { const esito = nuovoContratto({ criteri }); assert.equal(esito.ok, true, JSON.stringify(esito)); return esito.contratto; };

test('GOAL-CONTRACT-01 — a proposal becomes a contract in form: ids in order, texts trimmed, exit code 0 by default, the path with forward slashes, a fingerprint', () => {
  const esito = nuovoContratto({ criteri: [
    comando('  The auth tests pass  ', '  node --test tests/auth  '),
    TRE[1], TRE[2],
  ] });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.deepEqual(esito.contratto.criteri, [
    { id: 'c1', testo: 'The auth tests pass', verifica: { tipo: 'comando', comando: 'node --test tests/auth', uscita: 0 } },
    { id: 'c2', testo: 'The changelog names the fix', verifica: { tipo: 'file', percorso: 'docs/CHANGELOG.md', fatto: 'contiene', testo: 'login loop' } },
    { id: 'c3', testo: 'The error message is clear to a person who is not a developer', verifica: { tipo: 'giudizio' } },
  ]);
  assert.equal(esito.contratto.schema, SCHEMA_CONTRATTO);
  assert.match(esito.contratto.impronta, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(esito.contratto), ['schema', 'criteri', 'impronta', 'prossimoId']); // REV-GOAL-04: il contatore degli id
  assert.equal(esito.contratto.prossimoId, esito.contratto.criteri.length + 1);
  assert.equal(contrattoValido(esito.contratto), true);
});

test('GOAL-CONTRACT-02 — AL CONTRARIO: one malformed criterion refuses the WHOLE contract, and the refusal says which one and why', () => {
  const storti = [
    [null, 'criterion-invalid'], ['x', 'criterion-invalid'], [[], 'criterion-invalid'],
    [{ verifica: { tipo: 'giudizio' } }, 'criterion-text-invalid'],
    [{ testo: '   ', verifica: { tipo: 'giudizio' } }, 'criterion-text-invalid'],
    [{ testo: 7, verifica: { tipo: 'giudizio' } }, 'criterion-text-invalid'],
    [{ testo: 'x' }, 'criterion-check-missing'],
    [{ testo: 'x', verifica: 'comando' }, 'criterion-check-missing'],
    [{ testo: 'x', verifica: {} }, 'criterion-check-unknown'],
    [{ testo: 'x', verifica: { tipo: 'metrica' } }, 'criterion-check-unknown'],
    [comando('x', ''), 'criterion-command-invalid'],
    [comando('x', 42), 'criterion-command-invalid'],
    [comando('x', 'npm test', { uscita: -1 }), 'criterion-exit-code-invalid'],
    [comando('x', 'npm test', { uscita: 256 }), 'criterion-exit-code-invalid'],
    [comando('x', 'npm test', { uscita: 1.5 }), 'criterion-exit-code-invalid'],
    [comando('x', 'npm test', { uscita: '0' }), 'criterion-exit-code-invalid'],
    [comando('x', 'npm test || true'), 'criterion-command-not-attributable'],
    [file('x', 'a.txt', 'forse'), 'criterion-file-fact-unknown'],
    [file('x', 'a.txt', 'contiene'), 'criterion-file-text-invalid'],
    [file('x', 'a.txt', 'esiste', { testo: 'y' }), 'criterion-file-text-not-allowed'],
    [file('x', '', 'esiste'), 'criterion-path-invalid'],
    [file('x', '../a.txt', 'esiste'), 'criterion-path-outside'],
  ];
  for (const [storto, motivo] of storti) {
    for (const posizione of [1, 2, 3]) {
      const criteri = [TRE[0], TRE[2]];
      criteri.splice(posizione - 1, 0, storto);
      const esito = nuovoContratto({ criteri });
      assert.equal(esito.ok, false, `${motivo}: a contract with a malformed criterion must not be accepted`);
      assert.equal(esito.motivo, motivo, JSON.stringify(storto));
      assert.equal(esito.posizione, posizione, `${motivo}: the refusal points at the criterion`);
      assert.equal('contratto' in esito, false, 'nothing of the good criteria is kept');
    }
  }
  for (const vuoto of [undefined, null, {}, { criteri: [] }, { criteri: 'x' }, { criteri: {} }, [], 'x']) {
    assert.deepEqual(nuovoContratto(vuoto), { ok: false, motivo: 'contract-empty' }, JSON.stringify(vuoto));
  }
});

test('GOAL-CONTRACT-03 — a command is a criterion only if its exit code tells how it went: pipes, ||, ;, a trailing & hide it — quotes, redirections, && and the PowerShell call operator do not', () => {
  const si = [
    'npm test', 'node --test tests/a.test.mjs', 'npm run lint && npm test', 'npx tsc --noEmit 2>&1', 'node check.js > out.txt 2>&1',
    '& "C:\\Program Files\\tool.exe" --check', '  & tool --check', 'npm run lint && & "C:\\x\\y.exe"',
    'grep -q "a|b" file.txt', "echo 'x; y || z & w'", 'findstr /c:"a & b" file.txt', 'npm test;', 'npm test ;  ', 'npm test\n',
    'dir "C:\\Program Files\\"', 'node -e "process.exit(0)" <&0',
  ];
  for (const cmd of si) assert.deepEqual(esitoAttribuibile(cmd), { ok: true }, cmd);
  const no = [
    ['npm test | tee log.txt', '|'], ['npm test || true', '||'], ['npm test |& tee log.txt', '|&'], ['npm test; exit 0', ';'],
    ['npm test ; echo done', ';'], ['npm run server & npm test', '&'], ['npm test &', '&'],
    ['a && b | c', '|'], ['a && b; c', ';'], ['"quoted" | x', '|'],
    // REV-GOAL-01b (14/10/2026): `&>` è una ridirezione in bash ma in cmd separa i comandi ⇒ ambiguo, negato
    ['git diff --quiet &> /dev/null', '&>'],
  ];
  for (const [cmd, operatore] of no) assert.deepEqual(esitoAttribuibile(cmd), { ok: false, operatore }, cmd);
  // gli altri due modi di non poter dire com'è andata: più righe (riporta solo l'ultima) e una virgoletta mai chiusa (non si legge)
  for (const cmd of ['npm test\necho done', 'npm test\r\necho done', 'a\n\nb']) assert.deepEqual(esitoAttribuibile(cmd), { ok: false, perche: 'piu-righe' }, JSON.stringify(cmd));
  for (const cmd of ['echo "unclosed', "echo 'unclosed", 'echo "a" \'b']) assert.deepEqual(esitoAttribuibile(cmd), { ok: false, perche: 'virgolette' }, cmd);
  assert.deepEqual(nuovoContratto({ criteri: [comando('x', 'npm test\necho done')] }), { ok: false, motivo: 'criterion-command-multiline', posizione: 1 });
  assert.deepEqual(nuovoContratto({ criteri: [comando('x', 'echo "unclosed')] }), { ok: false, motivo: 'criterion-command-unreadable', posizione: 1 });
  // chi si aspetta un ERRORE non può usare una catena: non saprebbe quale membro è fallito
  assert.deepEqual(esitoAttribuibile('npm run build && npm test', { uscita: 1 }), { ok: false, operatore: '&&' });
  assert.deepEqual(esitoAttribuibile('npm test', { uscita: 1 }), { ok: true });
  // e dentro il contratto: il rifiuto porta l'operatore, perché la persona sappia che cosa togliere
  assert.deepEqual(nuovoContratto({ criteri: [comando('x', 'npm test | tee log')] }), { ok: false, motivo: 'criterion-command-not-attributable', operatore: '|', posizione: 1 });
  assert.equal(nuovoContratto({ criteri: [comando('the old test still fails', 'node --test tests/old', { uscita: 1 })] }).contratto.criteri[0].verifica.uscita, 1);
  assert.equal(nuovoContratto({ criteri: [comando('x', 'a && b', { uscita: 1 })] }).operatore, '&&');
});

test('GOAL-CONTRACT-04 — a fact about a file stays INSIDE the project: no root, no drive, no climbing; the text searched for is kept as written', () => {
  for (const [dato, atteso] of [['src/a.js', 'src/a.js'], ['docs\\guide\\intro.md', 'docs/guide/intro.md'], ['README.md', 'README.md'], ['  a b/c d.txt ', 'a b/c d.txt'], ['.github/workflows/ci.yml', '.github/workflows/ci.yml']]) {
    assert.equal(buono([file('x', dato, 'esiste')]).criteri[0].verifica.percorso, atteso);
  }
  for (const fuori of ['/etc/passwd', '\\\\server\\share\\x', 'C:\\Windows\\x', 'c:/x', '../x', 'a/../b', 'a\\..\\b', '..', 'a//b', 'a/', '/']) {
    assert.deepEqual(nuovoContratto({ criteri: [file('x', fuori, 'esiste')] }), { ok: false, motivo: 'criterion-path-outside', posizione: 1 }, fuori);
  }
  for (const rotto of ['', '   ', 5, null, 'a\u0000b', 'x'.repeat(PERCORSO_MASSIMO + 1)]) {
    assert.equal(nuovoContratto({ criteri: [file('x', rotto, 'esiste')] }).motivo, 'criterion-path-invalid', JSON.stringify(rotto));
  }
  for (const fatto of ['esiste', 'non-esiste']) assert.deepEqual(buono([file('x', 'a.txt', fatto)]).criteri[0].verifica, { tipo: 'file', percorso: 'a.txt', fatto });
  for (const fatto of ['contiene', 'non-contiene']) {
    assert.deepEqual(buono([file('x', 'a.txt', fatto, { testo: '  two  spaces ' })]).criteri[0].verifica, { tipo: 'file', percorso: 'a.txt', fatto, testo: '  two  spaces ' }, 'spaces are part of what is searched');
    for (const testo of ['', 7, null, 'a\u0000', 'x'.repeat(TESTO_CERCATO_MASSIMO + 1)]) {
      assert.equal(nuovoContratto({ criteri: [file('x', 'a.txt', fatto, { testo })] }).motivo, 'criterion-file-text-invalid', JSON.stringify(testo));
    }
  }
});

test('GOAL-CONTRACT-05 — ids: a given one is kept, a missing one gets the first free; AL CONTRARIO: a duplicate or a malformed id refuses the contract', () => {
  const misti = buono([{ ...TRE[0] }, { ...TRE[1], id: 'c1' }, { ...TRE[2] }, { ...giudizio('fourth'), id: 'c3' }]);
  assert.deepEqual(misti.criteri.map((c) => c.id), ['c2', 'c1', 'c4', 'c3']);
  assert.deepEqual(buono([{ ...TRE[0], id: 'c7' }, TRE[1]]).criteri.map((c) => c.id), ['c7', 'c1']);
  assert.deepEqual(nuovoContratto({ criteri: [{ ...TRE[0], id: 'c1' }, { ...TRE[1], id: 'c1' }] }), { ok: false, motivo: 'criterion-id-duplicate', posizione: 2 });
  for (const id of ['C1', 'c0', 'x', 'c1000', 'c01', '', 1, null, 'c1 ']) {
    assert.deepEqual(nuovoContratto({ criteri: [TRE[0], { ...TRE[1], id }] }), { ok: false, motivo: 'criterion-id-invalid', posizione: 2 }, JSON.stringify(id));
  }
});

test('GOAL-CONTRACT-06 — the fingerprint changes if and only if what the contract asks changes; a contract edited without passing through here is not valid', () => {
  const base = buono();
  assert.equal(buono().impronta, base.impronta, 'same criteria, same fingerprint');
  assert.equal(buono([comando('  The auth tests pass ', ' node --test tests/auth '), TRE[1], TRE[2]]).impronta, base.impronta, 'spaces at the ends are not part of the request');
  const varianti = [
    [comando('The auth tests pass!', 'node --test tests/auth'), TRE[1], TRE[2]],
    [comando('The auth tests pass', 'node --test tests/auth2'), TRE[1], TRE[2]],
    [comando('The auth tests pass', 'node --test tests/auth', { uscita: 1 }), TRE[1], TRE[2]],
    [TRE[0], file('The changelog names the fix', 'docs/CHANGELOG.md', 'non-contiene', { testo: 'login loop' }), TRE[2]],
    [TRE[0], file('The changelog names the fix', 'docs/CHANGELOG.md', 'contiene', { testo: 'login loop ' }), TRE[2]],
    [TRE[1], TRE[0], TRE[2]], [TRE[0], TRE[1]], [...TRE, giudizio('one more')],
  ];
  const impronte = new Set([base.impronta, ...varianti.map((criteri) => buono(criteri).impronta)]);
  assert.equal(impronte.size, varianti.length + 1, 'every variant has its own fingerprint');

  assert.equal(contrattoValido(structuredClone(base)), true);
  const ritoccato = structuredClone(base); ritoccato.criteri[0].verifica.comando = 'true';
  assert.equal(contrattoValido(ritoccato), false, 'a criterion changed under the same fingerprint');
  const tolto = structuredClone(base); tolto.criteri.pop();
  assert.equal(contrattoValido(tolto), false, 'a criterion removed under the same fingerprint');
  assert.equal(contrattoValido({ ...base, impronta: `sha256:${'0'.repeat(64)}` }), false);
  assert.equal(contrattoValido({ ...base, schema: 'talos.obiettivo.contratto.v2' }), false);
  const nonInForma = structuredClone(base); nonInForma.criteri[0].testo = ' The auth tests pass ';
  assert.equal(contrattoValido(nonInForma), false, 'a stored contract is in form, or it is not this contract');
  for (const rotto of [null, undefined, 'x', [], {}, { schema: SCHEMA_CONTRATTO }, { ...base, criteri: [] }]) assert.equal(contrattoValido(rotto), false, JSON.stringify(rotto));
});

test('GOAL-CONTRACT-07 — comparing two contracts: adding is free; AL CONTRARIO: removing or changing a criterion needs the person', () => {
  const prima = buono();
  const conUnoInPiu = aggiungiCriteri(prima, [giudizio('one more')]).contratto;
  assert.deepEqual(confrontaContratti(prima, conUnoInPiu), { aggiunti: ['c4'], tolti: [], cambiati: [], serveConferma: false, uguale: false });
  const senzaIlSecondo = buono([prima.criteri[0], prima.criteri[2]]);
  assert.deepEqual(confrontaContratti(prima, senzaIlSecondo), { aggiunti: [], tolti: ['c2'], cambiati: [], serveConferma: true, uguale: false });
  const piuLargo = buono([{ ...prima.criteri[0], verifica: { tipo: 'comando', comando: 'node --version' } }, prima.criteri[1], prima.criteri[2]]);
  assert.deepEqual(confrontaContratti(prima, piuLargo), { aggiunti: [], tolti: [], cambiati: ['c1'], serveConferma: true, uguale: false });
  const riscritto = buono([{ ...prima.criteri[0], testo: 'Other words' }, prima.criteri[1], prima.criteri[2]]);
  assert.deepEqual(confrontaContratti(prima, riscritto).cambiati, ['c1'], 'the words of a criterion are part of what was agreed');
  // un criterio nuovo senza id prende il primo libero: qui è `c3`, cioè il posto di quello tolto ⇒ è un CAMBIO di c3, non un'aggiunta
  const sostituito = buono([prima.criteri[0], prima.criteri[1], giudizio('a different third')]);
  assert.deepEqual(confrontaContratti(prima, sostituito), { aggiunti: [], tolti: [], cambiati: ['c3'], serveConferma: true, uguale: false },
    'a criterion swapped for another under the same id cannot pass as an addition');
  const riordinato = buono([prima.criteri[2], prima.criteri[0], prima.criteri[1]]);
  assert.deepEqual(confrontaContratti(prima, riordinato), { aggiunti: [], tolti: [], cambiati: [], serveConferma: false, uguale: false },
    'only the order: nothing asked is gone, but it is not the same contract');
  assert.deepEqual(confrontaContratti(prima, buono()), { aggiunti: [], tolti: [], cambiati: [], serveConferma: false, uguale: true });
  assert.deepEqual(confrontaContratti(null, prima), { aggiunti: ['c1', 'c2', 'c3'], tolti: [], cambiati: [], serveConferma: false, uguale: false }, 'a first contract only adds');
  assert.deepEqual(confrontaContratti(prima, null), { aggiunti: [], tolti: ['c1', 'c2', 'c3'], cambiati: [], serveConferma: true, uguale: false }, 'dropping the contract removes everything');
});

test('GOAL-CONTRACT-08 — adding criteria: appended with the next ids, the old ones untouched; AL CONTRARIO: a malformed new one refuses, saying which of the new', () => {
  const prima = buono();
  const esito = aggiungiCriteri(prima, [giudizio('fourth'), comando('fifth', 'npm run lint')]);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  assert.deepEqual(esito.contratto.criteri.slice(0, 3), prima.criteri);
  assert.deepEqual(esito.contratto.criteri.slice(3).map((c) => [c.id, c.testo]), [['c4', 'fourth'], ['c5', 'fifth']]);
  assert.notEqual(esito.contratto.impronta, prima.impronta);
  assert.equal(contrattoValido(esito.contratto), true);
  assert.deepEqual(prima, buono(), 'the contract passed in is not touched');

  assert.deepEqual(aggiungiCriteri(prima, [giudizio('ok'), comando('bad', 'npm test || true')]), { ok: false, motivo: 'criterion-command-not-attributable', operatore: '||', posizione: 2 });
  assert.deepEqual(aggiungiCriteri(prima, []), { ok: false, motivo: 'contract-empty' });
  assert.deepEqual(aggiungiCriteri(prima, 'x'), { ok: false, motivo: 'contract-empty' });
  assert.deepEqual(aggiungiCriteri(prima, [{ ...giudizio('with an id'), id: 'c1' }]), { ok: false, motivo: 'criterion-id-not-allowed' });
  const pieno = buono(Array.from({ length: CRITERI_MASSIMI }, (_, i) => giudizio(`criterion ${i + 1}`)));
  assert.deepEqual(aggiungiCriteri(pieno, [giudizio('one too many')]), { ok: false, motivo: 'contract-too-many-criteria' });
});

test('GOAL-CONTRACT-10 — only what a contract knows enters it: a proposal cannot smuggle a verdict, a fingerprint or anything else next to a criterion', () => {
  const conExtra = nuovoContratto({ schema: 'altro', impronta: 'sha256:falsa', criteri: [
    { ...comando('The auth tests pass', 'node --test tests/auth', { sempreVerde: true, esito: 'provato' }), stato: 'provato', verdetto: { ok: true } },
    { ...file('The changelog names the fix', 'docs/CHANGELOG.md', 'contiene', { testo: 'login loop', ignora: true }), provato: true },
    { testo: 'The error message is clear to a person who is not a developer', verifica: { tipo: 'giudizio', comando: 'true', verdetto: 'si' }, giudice: 'nessuno' },
  ] });
  assert.equal(conExtra.ok, true, JSON.stringify(conExtra));
  assert.deepEqual(conExtra.contratto, buono(), 'the same contract as the proposal without the extras, fingerprint included');
  for (const criterio of conExtra.contratto.criteri) assert.deepEqual(Object.keys(criterio), ['id', 'testo', 'verifica']);
  assert.deepEqual(conExtra.contratto.criteri.map((c) => Object.keys(c.verifica)), [['tipo', 'comando', 'uscita'], ['tipo', 'percorso', 'fatto', 'testo'], ['tipo']]);
});

test('GOAL-CONTRACT-09 — the limits: exactly at the limit is in, one more is out; a text that cannot be saved is a refusal, never an exception', () => {
  assert.equal(buono(Array.from({ length: CRITERI_MASSIMI }, (_, i) => giudizio(`criterion ${i + 1}`))).criteri.length, CRITERI_MASSIMI);
  assert.deepEqual(nuovoContratto({ criteri: Array.from({ length: CRITERI_MASSIMI + 1 }, (_, i) => giudizio(`criterion ${i + 1}`)) }), { ok: false, motivo: 'contract-too-many-criteria' });
  assert.equal(nuovoContratto({ criteri: [giudizio('😀'.repeat(TESTO_CRITERIO_MASSIMO))] }).ok, true, 'characters, not UTF-16 units');
  assert.equal(nuovoContratto({ criteri: [giudizio('a'.repeat(TESTO_CRITERIO_MASSIMO + 1))] }).motivo, 'criterion-text-invalid');
  assert.equal(nuovoContratto({ criteri: [comando('x', 'a'.repeat(COMANDO_MASSIMO))] }).ok, true);
  assert.equal(nuovoContratto({ criteri: [comando('x', 'a'.repeat(COMANDO_MASSIMO + 1))] }).motivo, 'criterion-command-invalid');
  // un surrogato isolato non si può né salvare né impronta: è un rifiuto col suo motivo, non un errore che sale
  const isolato = 'bad \ud800 text';
  assert.equal(isolato.isWellFormed(), false);
  assert.equal(nuovoContratto({ criteri: [giudizio(isolato)] }).motivo, 'criterion-text-invalid');
  assert.equal(nuovoContratto({ criteri: [comando('x', `echo ${isolato}`)] }).motivo, 'criterion-command-invalid');
  assert.equal(nuovoContratto({ criteri: [file('x', 'a.txt', 'contiene', { testo: isolato })] }).motivo, 'criterion-file-text-invalid');
  assert.equal(nuovoContratto({ criteri: [giudizio('a\u0000b')] }).motivo, 'criterion-text-invalid');
});
