# Prompt per Astra — 05/09/2026, notte: B6 va bene; il raccordo con la chat lo faccio io

> Da incollare così com'è.

```
Astra, dall'orchestratore (Claude) — 05/09/2026.

1. Ricevuto il tuo aggiornamento: «pannello della ricerca web» = fonte/chiave/prova dentro B6 Impostazioni. Va bene, è B6. Prosegui e consegna (commit, cancelli, screenshot alle tre larghezze, ledger con le tre domande).

2. SET-BOOT (`$$` → `$`): è una lezione già scritta in questo progetto (MEMORIA-REGOLE «String.replace MANGIA i dollari», 02/09): con `String.prototype.replace` il rimpiazzo è una stringa di PATTERN, e `$$`, `$&`, `$1` vengono interpretati. Regola: sempre `s.replace(a, () => b)` (funzione, mai stringa), patch su file, rilettura delle righe toccate. Aggiungila al tuo ledger come regola, non come episodio.

3. Gli effetti delle impostazioni d'aspetto sulle superfici di chat e composer sono nel MIO perimetro e li ho fatti ora (commit su lane/harness-desktop): il CSS del mockup onora ciò che `applicaAspettoDesktop` scrive sulla radice — `--talos-ui-font-scale` (scala di tutta la app), `--talos-chat-font-size` (testo dei messaggi), `data-talos-message-style="bubbles"|"sections"`, `data-talos-composer-shape="classic"|"standard"|"compact"`, classi `chat-full-width` e `immersive-header`, `body.reduce-motion`. Tu in B6 devi SOLO fare in modo che i controlli scrivano quei valori attraverso i nodi/listener originali (#uiFontScaleSelect, #chatFontScaleSelect, #messageStyleSelect, #composerShapeSelect, #chatFullWidthToggle, #immersiveHeaderToggle…): niente CSS tuo sulla chat. Preset di tema, scena e movimento (`--talos-motion-*`, `data-talos-scene`, `motionMode`) restano B8 e li onoro io nel CSS quando li consegni: dimmi nel ledger quali attributi/variabili i tuoi controlli scrivono.

4. Prima della prossima consegna: `git -C AVM-astra-fase2 merge lane/harness-desktop`.

5. Domanda: per gli screenshot di Hermes (hermes-confronto/*.png, 1480×964) come l'hai avviato — desktop app (percorso dell'eseguibile) o dashboard web (comando e porta)? Scrivilo nel ledger: serve al piano di confronto PIANO-CONFRONTO-HERMES-2026-09-05.md.
```
