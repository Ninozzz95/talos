# Prompt per Astra — 05/09/2026, sera tardi (review R-02: Board, Memoria, Attività, Libreria, Ricerca, Officina)

> Da incollare così com'è.

```
Astra, review R-02 dall'orchestratore (Claude) — 05/09/2026.

Ho letto commit per commit i tuoi sei innesti (6ea01e80 Board, 86f108e1 Memoria, 9bc1fadb Attività, d6b2b99d Libreria, 316484d0 Ricerca, 0ec35981 Officina) e gli undici commit di mockup (Intro con chooser compatto, dialoghi Ambiente/Rinomina/Riferimenti/Anteprima file/Rinomina file/Elimina/Nuovo file/Esporta, menu file). Metodo giusto: componente + fixture + laboratorio + riga nel cancello + unit + prova dal vivo sul 4177 con l'originale sul 4179, screenshot a tre larghezze, ricerca citata. Tocchi solo le tue funzioni del monolite (caricaPannello*, riga*, renderSessionsBoard). Board dal vivo con 73 sessioni vere, filtri, colonne oneste («—» dove il dato non c'è); Officina con stato vuoto onesto. ACCETTATI e UNITI in lane/harness-desktop.

Quattro cose da correggere/ricordare:

1. I tuoi test nel cancello statico (parita.spec.mjs, test ASTRA*) SCRIVONO gli screenshot dentro .claude/immagini/astra-mockup/, che sono file committati: ogni volta che qualcuno lancia `npm run test:lab` in un'altra worktree, 60 PNG risultano modificati. Gli screenshot dei test vanno in `artifacts/` (ignorata da git); in `.claude/immagini/` si copiano SOLO quelli che alleghi a una consegna, a mano.

2. Prima di ogni nuovo innesto: `git -C AVM-astra-fase2 merge lane/harness-desktop`. Il mio albero ha ora: via il frontend parallelo di Opus (src/app, src/design-system, src/state, src/ui, src/services, i suoi test; resta `src/components/nomi-attrezzi.js` — usa QUESTO percorso per i nomi umani degli attrezzi, H22), lo script del cutover `scripts/cutover.mjs` (a secco per default), `npm run test:componenti` come cancello dei componenti (test:browser non esiste più). Se hai import da `src/app/nomi-attrezzi.js`, aggiornali.

3. «OAuth e proposta computer-use (proposta mia)»: NON sono autorizzate e non si implementano. Le scrivi come righe PROPOSTA nel tuo ledger (cosa, parità con Hermes/Codex, +1 misurabile, costo stimato solo se misurato) e le promuove l'owner, una alla volta. Fino ad allora la coda è quella del brief: Capability (B4), Impostazioni/Doctor/Model Lab (B6), colonna destra (B2), dialoghi innestati su setupModalResize (B7), Terminale (B1), densità/tema chiaro/lingua (B8), Browser a schede come da PROMPT-ASTRA-2026-09-05-BROWSER-E-TESTATA.md (K-I).

4. Automazioni: a fine prove, stessa consegna delle altre (cancelli + screenshot + ledger con «Cosa deve fare l'owner · Cosa fai tu dopo · Cosa rimane»). Poi Capability.

Decisione dell'owner (05/09, sera): «cutover dopo Astra, Opus si cancella, contratto sbloccato in un colpo». Quindi: il cutover di public/ arriva quando le tue consegne sono tutte verdi; i pulsanti che aspettano una rotta restano `data-richiede="fase3"`; lo sblocco del contratto (K-A…K-I) lo faccio io in un commit solo alla fine.
```
