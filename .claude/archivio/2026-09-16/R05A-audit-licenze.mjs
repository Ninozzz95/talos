// Audit locale R-05A: nessuna rete, installazione o modifica ai lock.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const radice = fileURLToPath(new URL('../', import.meta.url));
const leggi = percorso => readFileSync(resolve(radice, percorso));
const sha256 = byte => createHash('sha256').update(byte).digest('hex');
const percorsi = [
  'harness-ui/package-lock.json',
  'harness-ui/frontend/package-lock.json',
  'harness-ui/desktop/package-lock.json',
  'context-engine/package-lock.json',
];
// Decisioni documentali esplicite per le sole espressioni osservate in questi lock.
// Una nuova espressione resta da verificare: nessuna compatibilità dedotta dal nome.
const decisioni = {
  MIT: 'Compatibile; conservare copyright e licenza.',
  'Apache-2.0': 'Compatibile con GPLv3/AGPLv3; conservare licenza, attribuzioni e NOTICE applicabili.',
  ISC: 'Compatibile; conservare avvisi.',
  '0BSD': 'Compatibile; licenza permissiva.',
  'BSD-2-Clause': 'Compatibile; conservare avvisi.',
  'BSD-3-Clause': 'Compatibile; conservare avvisi e clausola di non approvazione.',
  'BlueOak-1.0.0': 'Compatibile secondo la lettura del testo permissivo; includere testo o link della licenza.',
  'Python-2.0': 'Compatibile; conservare testo e attribuzioni.',
  WTFPL: 'Compatibile; licenza permissiva.',
  'MPL-2.0': 'Compatibile condizionatamente: obblighi sui file e assenza di opt-out delle licenze secondarie. Componenti osservati: axe-core e resvg-js, di sviluppo.',
  '(AFL-2.1 OR BSD-3-Clause)': 'Scegliere BSD-3-Clause per json-schema; non affidarsi alla compatibilità di AFL-2.1.',
  '(MIT OR GPL-3.0-or-later)': 'Scegliere MIT per jszip; conservare avvisi.',
  '(MIT AND Zlib)': 'Rispettare insieme MIT e Zlib per pako; entrambi compatibili.',
  '(MIT OR CC0-1.0)': 'Scegliere MIT; conservare avvisi.',
  '(WTFPL OR MIT)': 'Scegliere MIT; conservare avvisi.',
  'WTFPL OR ISC': 'Scegliere ISC; conservare avvisi.',
  'MIT OR Apache': 'Metadato non SPDX: scegliere MIT per sqlite-vec 0.1.9 e varianti, verificato LICENSE-MIT upstream.',
  ASSENTE: 'png-js 1.1.0: MIT verificata nel LICENSE incluso nel pacchetto installato.',
};

try {
  const totali = {};
  const dettagli = [];
  const lock = percorsi.map(percorso => {
    const byte = leggi(percorso);
    const documento = JSON.parse(byte);
    if (!documento.packages) throw new Error(`Lock senza inventario packages: ${percorso}`);
    const conteggi = {};
    for (const [posizione, pacchetto] of Object.entries(documento.packages)) {
      if (!posizione || pacchetto.link) continue;
      const licenza = pacchetto.license || 'ASSENTE';
      let valutazione = decisioni[licenza] ?? 'DA VERIFICARE';
      if (licenza === 'ASSENTE') {
        const fileLicenza = 'harness-ui/node_modules/png-js/LICENSE';
        if (percorso !== 'harness-ui/package-lock.json' || posizione !== 'node_modules/png-js' || pacchetto.version !== '1.1.0'
          || !existsSync(resolve(radice, fileLicenza)) || !leggi(fileLicenza).toString().startsWith('MIT License\n')) valutazione = 'DA VERIFICARE';
      }
      if (licenza === 'MIT OR Apache' && (pacchetto.version !== '0.1.9' || !/^node_modules\/sqlite-vec(?:-[a-z0-9-]+)?$/.test(posizione))) valutazione = 'DA VERIFICARE';
      conteggi[licenza] = (conteggi[licenza] || 0) + 1;
      totali[licenza] = (totali[licenza] || 0) + 1;
      dettagli.push({ lock: percorso, posizione, versione: pacchetto.version,
        licenza, sviluppo: Boolean(pacchetto.dev), opzionale: Boolean(pacchetto.optional),
        integrita: pacchetto.integrity ?? null, valutazione });
    }
    return { percorso, sha256: sha256(byte), versioneLock: documento.lockfileVersion,
      totale: Object.values(conteggi).reduce((a, b) => a + b, 0), conteggi };
  });
  const campioni = [
    'harness-ui/node_modules/png-js/LICENSE',
    'harness-ui/node_modules/node-pty/LICENSE',
    'harness-ui/desktop/node_modules/electron/LICENSE',
    'harness-ui/desktop/assets/llama-LICENSE.txt',
    'harness-ui/frontend/node_modules/axe-core/LICENSE',
    'harness-ui/desktop/node_modules/@resvg/resvg-js/LICENSE',
  ].map(percorso => {
    if (!existsSync(resolve(radice, percorso))) return { percorso, esito: 'ASSENTE' };
    const byte = leggi(percorso);
    return { percorso, byte: byte.length, sha256: sha256(byte) };
  });
  const esito = {
    data: new Date().toISOString(), metodo: 'Occorrenze packages per lock; radici/link esclusi; dev e piattaforme opzionali inclusi; espressioni non spezzate.',
    lock, totale: dettagli.length, totali, decisioni,
    restrittive: dettagli.filter(p => /SSPL|BUSL|CC-BY-NC|Elastic/i.test(p.licenza)),
    daVerificare: dettagli.filter(p => p.valutazione === 'DA VERIFICARE'),
    campioni, dettagli,
    limiti: 'Inventario dei quattro lock npm richiesti e campioni legali locali; non SBOM completa di Electron/Chromium, DLL, container, pip, Composer o mobile. Le condizioni MPL e i termini dei componenti separati restano applicabili.',
  };
  writeFileSync(resolve(radice, '.claude/R05A-audit-licenze.json'), `${JSON.stringify(esito, null, 2)}\n`);
  console.log(JSON.stringify({ totale: esito.totale, totali, lock: lock.map(l => ({ percorso: l.percorso, totale: l.totale })), restrittive: esito.restrittive, daVerificare: esito.daVerificare }, null, 2));
  if (esito.restrittive.length || esito.daVerificare.length) process.exitCode = 1;
} catch (errore) {
  console.error(`Audit R-05A non completato: ${errore.message}`);
  process.exitCode = 1;
}
