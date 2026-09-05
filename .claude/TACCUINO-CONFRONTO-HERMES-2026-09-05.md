# TACCUINO — ricognizione tecnica di Hermes Desktop, componente per componente (iniziato il 05/09/2026)

> Parte del `PIANO-CONFRONTO-HERMES-2026-09-05.md`. Fonte: il clone `hermes-agent-v21`
> (`365e283`, 02/09/2026, v0.21.0 «Pantheon») in `%LOCALAPPDATA%\Temp\talos-competitor\`,
> cartella `apps/desktop/src` (667 file `.tsx`; l'app desktop è React + Electron, con e2e
> Playwright propri). Qui si annota ciò che si LEGGE nel codice: file, comportamento, forza,
> debolezza, il nostro +1. Le misure (tempi, gesti, screenshot affiancati) arrivano con gli
> script, dopo il cutover. Niente giudizi senza un file dietro.

## Gruppo 1 · Chat — Composer (nostro: `Composer`, `AttachButton`, `Chip`, `SendButton`, `MessageQueue`, `StatusStrip`)

| Hermes (file in `app/chat/composer/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `hooks/use-composer-queue.ts` (`enqueueQueuedPrompt`, `isSteerableEntry`, `$parkedQueueSessions`) + `queue-panel.tsx` | coda di prompt per sessione, con voci «steerable» (reindirizzo) e code parcheggiate per sessione | coda multipla visibile in un pannello, per-sessione | pannello a parte: la coda esce dal filo della chat | la nostra `MessageQueue` è NEL piede, sotto gli occhi; da pareggiare: più di un messaggio in coda con «+N altri» (già nel monolite: `renderizzaBannerCoda`) e il reindirizzo di una voce in coda |
| `hooks/use-composer-undo.ts` (snapshot del draft) | annulla/ripristina il testo del composer da istantanee | undo esplicito oltre a quello del browser | complessità: `syncDraftFromEditor` su un `contentEditable` (`rich-editor.ts`) | il nostro composer è un `<textarea>` nativo: undo di sistema gratis; +1: bozza per sessione ricordata (vedi riga sotto) |
| `hooks/use-composer-draft.ts` («draft providers» sul «suggestion bus», provider di riparazione event-driven) | bozze e suggerimenti da fornitori registrati; suggerimento di «riparazione» quando arriva un errore dal gateway | il suggerimento nasce dagli eventi (errore → proposta di correzione) | bus generico = più strati | il nostro `mostraSuggerimentoComposer` propone già la domanda dall'ultimo attrezzo; +1: bozza NON inviata conservata per sessione (oggi si perde cambiando sessione — da verificare e pareggiare) |
| `hooks/use-composer-esc-cancel.ts` («focus-bus»: con N composer montati solo quello attivo annulla con Esc) | Esc ferma il giro del composer attivo | gestisce più composer (tile) | serve un bus del fuoco | noi abbiamo un composer solo: Esc ferma il giro (già: «Ferma Esc» nella striscia) — verificare Esc dal `textarea` |
| `hooks/use-composer-popout.ts` (`clampPopoutPosition`, zona di popout) | il composer si stacca in una finestrella trascinabile | scrivere a lato mentre si legge | gesto raro, molta meccanica | noi: composer ridimensionabile con misura ricordata (fatto). Non copiare il popout senza una richiesta dell'owner |
| `hooks/use-composer-voice.ts`, `use-auto-speak-replies.ts` | dettatura e lettura automatica delle risposte | voce in entrata e in uscita | — | noi: microfono e «Ascolta la risposta» (fatti); +1 possibile: lettura automatica opzionale (decide l'owner) |
| `attachments.tsx`, `hooks/use-composer-drop.ts`, `drop-affordance.ts`, `chat-drop-overlay.tsx` | allegati con trascinamento e overlay di drop su tutta la chat | il drop è visibile e guidato | — | nostro `AttachButton` («+» = contesto): da pareggiare il drag&drop di file/immagini con overlay nel linguaggio del mockup (riga di lavoro) |
| `hooks/use-at-completions.ts`, `inline-refs.ts`, `path-refs.ts`, `slash-refs.ts`, `completion-drawer.tsx`, `use-emoji-completions.ts` | `@file`, percorsi, `/comandi` con cassetto dei completamenti | completamento inline unificato | — | il nostro foglio «Riferimenti @» (Astra, dialogo) è un dialogo, non inline: +1 da valutare = completamenti inline nel `textarea` (decide l'owner; costo alto) |
| `directive-actions.tsx`, `micro-actions.tsx`, `suggestion-pills.tsx`, `help-hint.tsx` | azioni rapide e pillole di suggerimento sopra il composer | invito all'azione contestuale | rumore se troppe | i nostri chip sono STATO (modello, permesso, giri, costo), non azioni; i suggerimenti stanno nello stato vuoto: coerente con le decisioni B; niente da copiare |
| `model-pill.tsx` | pillola del modello nel composer | uguale al nostro chip | — | pari |
| `enter-submit-dom-race.test.tsx`, `enter-stale-ime-flag.test.tsx`, `short-session-hang-repro.tsx` | test su gare Invio/IME e su un blocco delle sessioni corte | hanno trovato e coperto gare reali | l'editor `contentEditable` porta gare che un `<textarea>` non ha | evidenza a nostro favore: tenere il `<textarea>`; misurare Invio con IME (tastiera italiana con accenti) nel nostro script |

## Gruppo 2 · Navigazione — Sidebar (nostro: `Sidebar`, `SessionList`, `SessionItem`, `NavGroup`, `WorkspaceFooter`)

| Hermes (file in `app/chat/sidebar/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `sessions-section.tsx`, `session-row.tsx`, `session-row-gesture.ts`, `session-actions-menu.tsx`, `split-submenu.tsx` | righe di sessione con gesti (trascina, tasto destro), menu con Pin/Rinomina/Move to project/Open in split/Export/Archive/Elimina (già visto da Astra il 05/09) | menu completo, «Apri in split» in quattro direzioni | densità del menu | noi: menu della riga (monolite) + Fissate (K-A, Fase 3); +1: la riga dice STATO ONESTO (aspetta te · errore · giri finiti) e giri/modello — Hermes mostra meno fatti per riga (da misurare) |
| `reorderable-list.tsx`, `row-geometry.ts` | riordino manuale delle righe | ordine scelto dall'utente | — | noi: ordine per tempo; +1 possibile = fissate in cima (K-A) |
| `projects/`, `project-dialog.tsx`, `profile-switcher.tsx`, `profile-scope.ts`, `connection-switcher.tsx`, `connection-glyph.tsx`, `use-fleet-roster.ts`, `fleet-rail.ts` | sessioni raggruppate per progetto e per profilo; più connessioni (gateway) e una «flotta» di bot | multi-gateway e multi-profilo | complessità per chi ha un solo progetto | nostro: workspace nel piede + Luoghi; multi-profilo non è nelle decisioni (PROPOSTA, decide l'owner) |
| `cron-jobs-section.tsx` | i cron nella sidebar | automazioni a portata | — | nostre Automazioni sono un Luogo (B5, fatto): pari |
| `filter-menu.tsx`, `section-states.tsx`, `load-more-row.tsx` | filtri e sezioni richiudibili, caricamento a pagine | scala con molte sessioni | — | noi: ricerca «dentro le conversazioni» (A6, da fare nel Board/ricerca) e 74 righe già virtuali? NO: da misurare con 500 sessioni (riga di lavoro) |

## Gruppo 3 · Colonna destra (nostro: `Inspector`, `InspectorCard`, `TurnIndex`, `ProcessRow`, `FileTree`) e Browser (`BrowserScreen`)

| Hermes (file in `app/chat/right-rail/`) | Cosa fa | Forza | Debolezza / rischio | Il nostro +1 |
|---|---|---|---|---|
| `preview-pane.tsx`, `preview-browser-bar.tsx`, `preview-nav.ts`, `preview-reader.ts`, `preview-drive.ts`, `preview-act.ts`, `preview-script-runner.ts` | il «preview rail»: browser in-app con barra, lettura della pagina (`read_preview`), guida dell'agente (drive/act), esecuzione di script | il browser è NELLA colonna destra e l'agente lo legge davvero | una colonna sola per file, artefatti, browser e console | il nostro Browser è una VISTA a schede (owner 05/09) + colonna con Contesto/File/Agenti/Processi; K-I per l'agente |
| `preview-annotate-card.tsx`, `preview-annotate-host.ts` | annotazione di un elemento della pagina che l'agente poi trova e modifica | «indica e correggi» | — | +1 da pareggiare in Browser (Annota → composer), K-I |
| `preview-console.tsx`, `preview-console-store.ts` | console della pagina nel rail | debug in app | — | manca: riga di lavoro per il Browser a schede (console della scheda) |
| `preview-file.tsx`, `preview-artifact.tsx` | anteprima file e artefatti nella colonna | tutto a destra | — | nostri: ArtifactCard in chat (fatta) + anteprima file in dialogo (Astra): pari, forma diversa per decisione |
| `preview-tour.ts`, `tour-marker.ts` | tour guidato dell'interfaccia | onboarding | — | nostra Intro a quattro passi (H16-H20): pari nell'intento; +1 = «Ripeti il primo avvio» (già nelle Impostazioni) |

## Da misurare con gli script (non dal codice)

- Tempo al primo token e gesti per «nuova sessione → primo messaggio» (Hermes vs TALOS).
- Tastiera: Tab/frecce/Esc su sidebar, composer, coda, dialoghi; anello di fuoco.
- Righe della sidebar con 500 sessioni: fluidità (fps) e memoria.
- Drag&drop di un file: dove finisce e cosa vede l'agente.
- Onestà: task-trappola (premessa falsa): chi inventa (dal banco del 28/8 Hermes barava 3/3).
