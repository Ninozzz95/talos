/*
 * K4b (04/10/2026, owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — i tre posti dove la persona legge
 * un testo dei plugin che il SERVER manda come frase inglese + `<campo>Chiave`: la frase della fiducia nella scheda (`datiEstensione`),
 * i pacchetti guasti nell'elenco (`estensioni.js`) e i chip degli avvisi dello scanner (`legacy/app.js`).
 * Il contratto lato server (voce inglese = frase del server, voce italiana = la frase di prima) è in `harness-ui/tests/k4b-plugin.test.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { datiEstensione } from '../../src/components/estensioni.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { ESTENSIONI } from '../../lab/fixtures/estensioni.js';

const sorgente = (percorso) => readFileSync(fileURLToPath(new URL(`../../src/${percorso}`, import.meta.url)), 'utf8');
const FRASE_EN = 'The content of this plugin has changed since you approved it.';
const FRASE_IT = "Il contenuto di questo plugin è cambiato da quando l'hai approvato.";
const scheda = (extra) => datiEstensione('plugins', { ...ESTENSIONI.plugins[0], fidato: false, motivo: 'contenuto-cambiato', frase: FRASE_EN, ...extra });

test('K4B-LETTORI-01 — la frase della fiducia si dice nella lingua dell\'interfaccia, dalla chiave', () => {
  try {
    impostaLingua('it');
    assert.equal(scheda({ fraseChiave: 'server.plugin.trust.contentChanged' }).frase, FRASE_IT);
    impostaLingua('en');
    assert.equal(scheda({ fraseChiave: 'server.plugin.trust.contentChanged' }).frase, FRASE_EN);
  } finally { impostaLingua('it'); }
});

test('K4B-LETTORI-02 — AL CONTRARIO: senza chiave, o con una chiave che il dizionario non ha, si mostra la frase del server, mai la chiave', () => {
  try {
    for (const lingua of ['it', 'en']) {
      impostaLingua(lingua);
      assert.equal(scheda({}).frase, FRASE_EN, 'un server più vecchio: la frase inglese');
      const ignota = scheda({ fraseChiave: 'server.plugin.trust.chiaveCheNonEsiste' }).frase;
      assert.equal(ignota, FRASE_EN, 'un server più nuovo del dizionario: la frase inglese');
      assert.equal(String(ignota).includes('server.plugin'), false, 'mai la chiave grezza');
    }
  } finally { impostaLingua('it'); }
});

test('K4B-LETTORI-03 — cancello sul sorgente: i guasti dei pacchetti e i chip degli avvisi leggono dalla chiave', () => {
  const estensioni = sorgente('components/estensioni.js');
  assert.match(estensioni, /testoDelCampo\(f,'frase'\)/u, 'l\'elenco dei pacchetti guasti dice la frase nella lingua corrente');
  assert.doesNotMatch(estensioni, /f\.frase\|\|t\('modelli\.extensions\.noFailureReason'\)/u, 'niente lettura diretta della frase inglese');
  const app = sorgente('legacy/app.js');
  assert.match(app, /fraseChiave: typeof f\.fraseChiave === 'string' \? f\.fraseChiave : null/u, 'la mappatura dei guasti porta la chiave');
  assert.match(app, /\$\{testoDelCampo\(a, 'avviso'\)\}/u, 'il chip dell\'avviso dice la frase nella lingua corrente');
  assert.doesNotMatch(app, /\$\{a\.avviso\}/u, 'niente lettura diretta della frase inglese nel chip');
});

test('K4B-LETTORI-04 — cancello sul sorgente: il motivo del blocco di una pagina nel browser pilotato si dice dalla chiave', () => {
  const app = sorgente('legacy/app.js');
  assert.match(app, /voce\.motivo = testoDelCampo\(esito, 'errore'\) \|\| tr\('app\.browser\.pageNotLoaded'\)/u);
  assert.doesNotMatch(app, /voce\.motivo = esito\?\.errore \|\|/u, 'niente lettura diretta della frase inglese');
});

test('K4B-LETTORI-05 — cancello sul sorgente: il motivo della ricerca di file incompleta si dice dalla chiave', () => {
  const app = sorgente('legacy/app.js');
  assert.match(app, /motivo: testoDelCampo\(dati, 'motivo'\) \|\| tr\('app\.files\.search\.stoppedEarly'\)/u);
  assert.doesNotMatch(app, /motivo: dati\.motivo \|\| tr\('app\.files\.search\.stoppedEarly'\)/u, 'niente lettura diretta della frase inglese');
});
