/*
 * ⛔ K4b (07/10/2026) — IL RISULTATO DI UNA FIGLIA ATTRAVERSA DUE STRATI, E I SUOI VALORI NON SI TRADUCONO.
 *   Il registro (`session-registry.mjs`, `testoDelRisultatoDelega`) scrive `stato` nel protocollo
 *   `talos.subagent-result.v1`; il frontend (`coda-messaggi.js`, `descriviRisultatoDelega`) lo rilegge e accetta solo
 *   «concluso» | «non concluso». Il 04/10 la traduzione del server aveva riscritto il secondo valore in «non-concluso»:
 *   nessun test lo vedeva, perché ognuno guardava UN lato solo, e il risultato di una figlia fallita perdeva la carta.
 *   Qui i due lati si incontrano: il valore si legge DAL SORGENTE del registro e passa dal lettore vero del frontend.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { testoDelRisultatoFiglio } from '../src/kernel/confine-dati.mjs';
import { descriviRisultatoDelega } from '../frontend/src/components/coda-messaggi.js';

const sorgenteRegistro = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');

function statiScrittiDalRegistro() {
  const m = /const stato = risultato\?\.esito === 'concluso' \? '([^']+)' : '([^']+)';/u.exec(sorgenteRegistro);
  assert.ok(m, 'la riga che sceglie lo stato del risultato della figlia esiste ancora nel registro (se è cambiata, aggiorna questa prova)');
  return [m[1], m[2]];
}

test('K4B-FIGLIO-01 — ogni stato che il registro scrive, il frontend lo riconosce (concluso e fallito)', () => {
  const [concluso, fallito] = statiScrittiDalRegistro();
  for (const [stato, errore] of [[concluso, false], [fallito, true]]) {
    const testo = testoDelRisultatoFiglio({ childId: 'figlia-1', stato, compito: 'Leggi il file', riassunto: 'fatto' });
    const carta = descriviRisultatoDelega(testo, 'figlia-1');
    assert.ok(carta, `il lettore del frontend accetta lo stato «${stato}»: senza, la carta del risultato sparisce`);
    assert.equal(carta.errore, errore, `«${stato}» ${errore ? 'è' : 'non è'} un esito mancato`);
  }
});

test('K4B-FIGLIO-02 — al contrario: uno stato fuori protocollo NON passa (il lettore non è permissivo)', () => {
  const testo = testoDelRisultatoFiglio({ childId: 'figlia-1', stato: 'non-concluso', compito: 'x', riassunto: 'y' });
  assert.equal(descriviRisultatoDelega(testo, 'figlia-1'), null);
});
