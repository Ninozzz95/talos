# Ledger esecutivo — streaming fluido e azioni Prompt Enhance

Data: 2026-09-15
Owner: TALOS UI (`harness-ui/frontend`) con prova del confine HTTP già esistente.
Richiesta owner: togliere il leggero ritardo da entrambi gli stili di rendering; aggiungere `Copia`; garantire che `Sostituisci` rimuova interamente il vecchio testo del composer.

## Diagnosi misurabile

- `harness-ui/frontend/src/legacy/app.js::avanzaRitmoStreaming` limita intenzionalmente il testo a 140–160 caratteri/s e consente 300–350 ms di arretrato. Il trasporto ha già consegnato quei caratteri: è ritardo introdotto dal client.
- `requestAnimationFrame` è già l'unico scheduler di paint in `programmaRenderMessaggioStreaming`; basta renderizzare in ogni frame tutto il prefisso ricevuto. `typewriter` conserva il cursore e `fade` conserva la dissolvenza delle parole nuove, senza governare il throughput.
- `harness-ui/frontend/src/main.js` forza `none` solo come hotfix della 0.1.8. La cura nel renderer permette alle due preferenze vere di funzionare senza arretrato e rende superflua quella deroga.
- `harness-ui/frontend/src/legacy/app.js::pannelloMiglioraPrompt/applica` assegna già `input.value = testo` nel ramo `sostituisci` e invia l'evento `input`; il cancello browser va reso esplicito con un vecchio prompt multilinea. Il componente non offre ancora `Copia`.

## Dossier fonti e decisione upstream

- WHATWG HTML Living Standard, sezione rendering: `https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames`, consultata 2026-09-15. Decisione: adottare direttamente `requestAnimationFrame`, già disponibile e già usato; nessuna dipendenza.
- W3C Long Animation Frames API, First Public Working Draft 2026-04-28: `https://www.w3.org/TR/2026/WD-long-animation-frames-20260428/`, soglia di frame lungo 50 ms. Decisione: adattare il limite in una prova browser senza rendere la nuova API un requisito runtime.
- Clipboard API, W3C Editor's Draft: `https://w3c.github.io/clipboard-apis/`, consultata 2026-09-15. Decisione: adottare `navigator.clipboard.writeText` dietro dipendenza iniettabile del componente, così il fallimento resta visibile e le prove non richiedono permessi reali.
- Rifiutato un pacchetto di streaming o clipboard: il browser offre già i due contratti richiesti; aggiungere una dipendenza aumenterebbe distribuzione e superficie di sicurezza senza una capacità mancante.

## File e simboli

- Creare `.claude/LEDGER-FLUIDITA-PROMPT-2026-09-15.md`: questo ledger.
- Modificare `harness-ui/frontend/tests/parity/nessun-errore-a-runtime.spec.mjs`: scenario `STREAMING-LIVE-SMOOTH-03` per `typewriter` e `fade`; scenario `RELEASE-018-PROMPT-ENHANCE` esteso a copia e sostituzione esatta.
- Modificare `harness-ui/frontend/tests/unit/migliora-prompt.test.mjs`: scenario `MIGLIORA-COPIA`.
- Modificare `harness-ui/frontend/src/components/migliora-prompt.js`: API pubblica `montaMiglioraPrompt({ chiedi, leggiPrompt, applica, copiaTesto, modello, onChiudi, document })`; nuovo bottone `data-migliora-copia`; nuovo stato annunciato `data-migliora-copia-stato`. Restano compatibili `apri`, `chiudi`, `distruggi`, `stato` e i modi `sostituisci|aggiungi`.
- Modificare `harness-ui/frontend/src/legacy/app.js`: `avanzaRitmoStreaming`, `renderizzaMessaggioStreamingOra`, `pannelloMiglioraPrompt`; restano stabili eventi, ordine delta, renderer Markdown, cursore, dissolvenza, riduzione movimento e firma di `applica`.
- Modificare `harness-ui/frontend/src/main.js`: rimuovere la forzatura standalone `talosStreamingAnimation=none` della hotfix 0.1.8.
- Rigenerare `harness-ui/public/app.js` e `harness-ui/public/build-manifest.json` con la build ufficiale; nessuna modifica manuale al bundle.
- Nessun file eliminato; nessuna classe, interfaccia, schema o migrazione nuova.

## RED, GREEN e regressioni

- RED unitario `MIGLIORA-COPIA`: dopo un esito, `Copia` deve consegnare esattamente il prompt migliorato, non chiudere il pannello e annunciare `Copiato`; fallimento atteso iniziale: bottone assente.
- RED browser `STREAMING-LIVE-SMOOTH-03`: con ciascuna preferenza `typewriter` e `fade`, 240 delta devono risultare interamente visibili entro il frame successivo e non produrre frame applicativi oltre 50 ms; fallimento atteso iniziale: arretrato del ritmo 300–350 ms.
- RED browser `RELEASE-018-PROMPT-ENHANCE`: `Copia` restituisce il testo migliorato lasciando invariato il composer; `Sostituisci` porta il composer dal vecchio testo multilinea al solo testo migliorato; fallimento iniziale: `Copia` assente.
- GREEN focalizzati: `node --test frontend/tests/unit/migliora-prompt.test.mjs`; Playwright sul solo `nessun-errore-a-runtime.spec.mjs` con server dedicato previsto dalla configurazione del repo.
- Regressioni: suite unit frontend, build frontend, suite parity interessata, `git diff --check`.
- Prova umana: desktop e mobile, entrambi gli stili; output che segue i delta, pannello Prompt Enhance con `Copia`, composer immutato dopo copia e sostituito esattamente dopo `Sostituisci`.
- Fallimento/cancellazione/reload: errore clipboard annunciato e pannello ancora aperto; `Escape` e risposte fuori ordine restano coperti; preferenza streaming persiste tramite impostazioni esistenti.
- Rollback: ripristinare soltanto i sei file prodotto/test elencati sopra e rigenerare i due artefatti pubblici dalla sorgente; il trasporto e la rotta Prompt Enhance non cambiano.
