import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { caricaSkill, SkillRegistryError } from '../src/skill-registry.mjs';

// ⭐ Stesso principio di hook-registry.test.mjs: cartelle VERE su
// disco, nessun mock del filesystem per la logica base.
function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-skills-'));
}

function scriviSkill(cartella, id, contenuto) {
  const dove = join(cartella, '.harness-ui-skills', id);
  mkdirSync(dove, { recursive: true });
  writeFileSync(join(dove, 'SKILL.md'), contenuto);
}

test('⭐⭐⭐ caricaSkill: nessuna cartella .harness-ui-skills — {skills:[]}, mai un errore', async () => {
  const cartella = cartellaVera();
  try {
    const { skills } = await caricaSkill({ cartella });
    assert.deepEqual(skills, []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ caricaSkill: una skill valida, i campi arrivano dal frontmatter VERO', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'code-review', '---\nname: code-review\ndescription: Revisione del codice in due assi.\n---\n\n# Code review\n\nIl processo vero, riga per riga.\n');
    const { skills } = await caricaSkill({ cartella });
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, 'code-review');
    assert.equal(skills[0].name, 'code-review');
    assert.equal(skills[0].description, 'Revisione del codice in due assi.');
    assert.match(skills[0].corpo, /^# Code review/);
    assert.match(skills[0].corpo, /Il processo vero, riga per riga\./);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ caricaSkill: più skill, ordine deterministico (alfabetico per id, non l\'ordine del filesystem)', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'zeta', '---\nname: zeta\ndescription: ultima.\n---\ncorpo\n');
    scriviSkill(cartella, 'alfa', '---\nname: alfa\ndescription: prima.\n---\ncorpo\n');
    scriviSkill(cartella, 'medio', '---\nname: medio\ndescription: in mezzo.\n---\ncorpo\n');
    const { skills } = await caricaSkill({ cartella });
    assert.deepEqual(skills.map((s) => s.id), ['alfa', 'medio', 'zeta']);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — una sottocartella SENZA SKILL.md non è una skill, non è un errore', async () => {
  const cartella = cartellaVera();
  try {
    mkdirSync(join(cartella, '.harness-ui-skills', 'vuota'), { recursive: true });
    scriviSkill(cartella, 'vera', '---\nname: vera\ndescription: questa sì.\n---\ncorpo\n');
    const { skills } = await caricaSkill({ cartella });
    assert.deepEqual(skills.map((s) => s.id), ['vera']);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — un file sciolto dentro .harness-ui-skills/ (non una directory) viene ignorato', async () => {
  const cartella = cartellaVera();
  try {
    mkdirSync(join(cartella, '.harness-ui-skills'), { recursive: true });
    writeFileSync(join(cartella, '.harness-ui-skills', 'README.md'), 'non è una skill, è una nota');
    scriviSkill(cartella, 'vera', '---\nname: vera\ndescription: questa sì.\n---\ncorpo\n');
    const { skills } = await caricaSkill({ cartella });
    assert.deepEqual(skills.map((s) => s.id), ['vera']);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — SKILL.md senza il delimitatore "---" iniziale è un SkillRegistryError dichiarato', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'rotta', 'name: rotta\ndescription: manca il primo delimitatore.\n---\ncorpo\n');
    await assert.rejects(
      caricaSkill({ cartella }),
      (e) => { assert.ok(e instanceof SkillRegistryError); assert.equal(e.code, 'SKILL_MALFORMED'); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — SKILL.md con un frontmatter mai chiuso è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'rotta', '---\nname: rotta\ndescription: manca il secondo delimitatore.\ncorpo senza chiusura\n');
    await assert.rejects(caricaSkill({ cartella }), (e) => e.code === 'SKILL_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — una riga di frontmatter senza ":" è rifiutata', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'rotta', '---\nname: rotta\nquesta riga non ha i due punti\n---\ncorpo\n');
    await assert.rejects(caricaSkill({ cartella }), (e) => e.code === 'SKILL_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — manca "name" nel frontmatter: rifiutata', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'rotta', '---\ndescription: solo la descrizione.\n---\ncorpo\n');
    await assert.rejects(caricaSkill({ cartella }), (e) => e.code === 'SKILL_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — manca "description" nel frontmatter: rifiutata', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'rotta', '---\nname: rotta\n---\ncorpo\n');
    await assert.rejects(caricaSkill({ cartella }), (e) => e.code === 'SKILL_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — un file con terminatori CRLF non lascia un "\\r" isolato in testa al corpo', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'crlf', '---\r\nname: crlf\r\ndescription: file con terminatori Windows.\r\n---\r\ncorpo vero\r\nseconda riga\r\n');
    const { skills } = await caricaSkill({ cartella });
    assert.equal(skills[0].name, 'crlf');
    assert.ok(!skills[0].corpo.startsWith('\r'), `il corpo inizia con un "\\r" isolato: ${JSON.stringify(skills[0].corpo.slice(0, 10))}`);
    assert.match(skills[0].corpo, /^corpo vero/);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — una singola skill malformata FERMA l\'intero caricamento, anche se altre sono valide', async () => {
  const cartella = cartellaVera();
  try {
    scriviSkill(cartella, 'valida', '---\nname: valida\ndescription: questa è a posto.\n---\ncorpo\n');
    scriviSkill(cartella, 'rotta', '---\nname: rotta\n---\ncorpo\n'); // manca description
    await assert.rejects(
      caricaSkill({ cartella }),
      (e) => { assert.ok(e instanceof SkillRegistryError); assert.match(e.message, /rotta/); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
