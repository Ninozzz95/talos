# Dossier ricerca — Frontend desktop Fase 2

Data: 2026-09-01  
Perimetro: `AVM-harness-desktop`, frontend modulare non ancora servito in
produzione. Mobile e runtime esterni sono solo riferimenti in lettura.

## Esito

La Fase 2 deve introdurre un nucleo framework-neutral con stato deterministico,
sottoscrizioni selettive, ownership esplicita di ogni effetto e primitive DOM
con lifecycle verificabile. Non viene eseguito alcun cutover della UI owner su
`4174`.

Vue non viene adottato in questa fase. Il P0 prestazionale ha misurato e rimosso
le due cause reali del lag — watcher ricorsivo per-directory e scritture di
custom property sulla radice ad ogni frame — senza che un framework fosse
coinvolto. La base ESM mantiene un confine compatibile con un eventuale adapter
Vue futuro; una migrazione richiederà una verticale reale comparabile e una
decisione esplicita dell'owner.

## Evidenza locale

- `harness-ui/frontend/src/contracts/routes.js` espone oggi soltanto `chat`,
  `diff`, `terminal`, `browser`, `dashboard`, `automations`, `settings`.
- La UI owner espone Libreria, Memoria, Note, Attività e Ricerca solo dentro il
  Capability Hub; non sono destinazioni di prima classe.
- Il backend desktop offre davvero i tool Libreria, Note, Attività, Memoria e
  Ricerca in `harness-ui/src/session-registry.mjs` e li collega alle callback
  reali in `harness-ui/src/agent-service.mjs`.
- Il mobile di riferimento espone righe di sidebar e route dedicate per
  Memoria, Attività, Note, Ricerca e Libreria (`context`).
- La Ricerca desktop è dichiarata nel codice come thin slice: non possiede
  ancora pianificazione event-sourced, verifica indipendente, citazioni e
  approvazione del piano equivalenti al mobile.
- La Libreria desktop è per-workspace su `.harness-ui-library`; non possiede il
  modello SQLCipher cross-chat e la provenance/taint `contentOrigin` del mobile.

Questi sono due debiti diversi e non vanno fusi:

1. `NAV-CAPABILITY-FIRSTCLASS-01`: cinque righe sidebar e cinque pagine reali
   dedicate mancanti (`library`, `memory`, `notes`, `tasks`, `research`).
2. `RESEARCH-MOBILE-PARITY-01`: motore Ricerca approfondita desktop non ancora
   equivalente al percorso mobile completo.

È inoltre registrata la futura `MESSAGE-ACTIONS-6.3B`: parità delle azioni
messaggio mediante il contratto canonico della lane mobile chat-parity. Il pin
stabile verificato è `e69402bcf940a4a347434ab93e551c39ff7f86c6`; contiene
schema, fixture, resolver e test Harness. Il desktop non modifica il mirror
mobile e colloca l'integrazione nella fase Conversazioni/sessioni dopo questa
fondazione.

La Fase 2 prepara store, route controller e lifecycle senza mostrare pagine
vuote o decorative. La shell e le pagine verranno aperte solo quando puntano ai
contratti reali già esistenti, nelle fasi visuali previste dal piano.

## Standard e documentazione primaria

### Vue 3.5.42

- [Vue Performance](https://vuejs.org/guide/best-practices/performance):
  scegliere l'architettura dal carico reale; profilare; virtualizzare liste
  grandi; usare strutture shallow/immutabili quando l'albero dati è grande;
  evitare astrazioni di componente inutili nelle liste.
- [Vue Advanced Reactivity](https://vuejs.org/api/reactivity-advanced.html):
  `shallowRef()` serve per strutture grandi immutabili o integrazione con store
  esterni; `effectScope()` raggruppa effetti per disporli insieme.
- [Vue State Management](https://vuejs.org/guide/scaling-up/state-management.html):
  le mutazioni devono essere centralizzate e nominate secondo l'intento.
- Pin stabile valutato: `vue@3.5.42`, MIT. La linea 3.6 è ancora prerelease.

Decisione: **REJECT per questa fase** come dipendenza runtime. Le primitive
richieste sono piccole, framework-neutral e già isolate dal contratto Fase 1;
introdurre Vue ora aumenterebbe grafo, migrazione e rollback senza risolvere una
causa prestazionale osservata. **DEFER** una verticale Vue comparabile fino a
quando esiste una superficie prodotto candidata al cutover; l'owner decide
l'eventuale adozione.

### DOM Living Standard

- [WHATWG DOM — Aborting ongoing activities](https://dom.spec.whatwg.org/#aborting-ongoing-activities):
  le API asincrone abortibili accettano `AbortSignal`, rifiutano subito se già
  abortite e propagano il motivo di abort.

Decisione: **ADOPT** `AbortController`/`AbortSignal` come ownership primaria;
**ADAPT** in `EffectScope` per listener, timer, observer, stream e risorse con
chiusura idempotente e LIFO.

### TanStack Virtual Core 3.17.8

- [Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer):
  core framework-neutral, chiavi stabili, misurazione dinamica, overscan,
  snapshot e osservatori con cleanup.
- [Chat guide](https://tanstack.com/virtual/latest/docs/chat): `anchorTo: 'end'`
  mantiene stabile la cronologia durante prepend e crescita streaming; la
  checklist richiede ID messaggio stabili e `measureElement`.
- Pin: `@tanstack/virtual-core@3.17.8`, MIT, zero dipendenze runtime.

Decisione: **ADOPT direttamente** dietro l'adapter TALOS
`createVirtualList`. Evita di riscrivere misurazione dinamica, correzione dello
scroll e ancoraggio chat; l'adapter conserva lifecycle, DOM e API applicativa
TALOS. La licenza MIT viene copiata nel manifest asset distributivo. Rollback:
rimuovere adapter/dipendenza e lasciare invariata la UI owner.

### WAI-ARIA Authoring Practices

- [Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
  background inerte, focus contenuto, Escape sul dialogo attivo e ritorno del
  focus all'invocatore.
- [WCAG Technique H102](https://www.w3.org/WAI/WCAG22/Techniques/html/H102):
  il `dialog` nativo può fornire focus, inert e chiusura Escape, ma il contratto
  deve essere provato nel browser reale.

Decisione: **ADAPT** i requisiti APG in un overlay manager posseduto da TALOS.
La Fase 2 supporta stack modale/non modale, focus restoration e annunci, senza
imporre ancora un aspetto visivo.

## Confronto competitor

### Hermes Agent

Pin: `82e6c46b9428a5eb7739978590913a32c814298b`.

- `renderer-loop-pause.ts` possiede cleanup e pausa per visibilità/focus.
- `use-message-stream` accorpa aggiornamenti e limita il lavoro al cambiamento
  osservabile.
- Gli scenari `render-churn` attribuiscono i render al componente/store.

Adattamento TALOS: ogni risorsa entra in uno scope distruggibile; le
sottoscrizioni selettive impediscono che una variazione conversazione ridisegni
sidebar e pannelli indipendenti. TALOS aggiunge invarianti di stato validate
prima della pubblicazione.

### Pi Coding Agent

Pin: `b8b873b9872db04a938fb4357b5e8e824ddc051c`.

- `requestRender()` accorpa richieste duplicate e lascia priorità all'input.
- Gli overlay hanno stack, focus e ripristino del target precedente.
- I componenti espongono `render`, `handleInput` e `invalidate`; la README
  raccomanda cache e invalidazione solo su cambiamento.

Adattamento TALOS: store selector-aware, liste keyed/virtuali, overlay stack e
coalescenza `requestAnimationFrame`. Il DOM browser resta il target nativo e le
semantiche APG sono obbligatorie.

### OpenAI Codex

Pin: `1f4c47343a1bff2d8cddc429c5d39503fb5a6c30`.

- `FrameRequester` separa la richiesta di frame dal disegno e usa un canale
  esplicito per il redraw.
- Il TUI distingue eventi input, resize e draw; il resize ricostruisce da una
  sorgente transcript, non da stato DOM implicito.

Adattamento TALOS: azioni sincrone separate dagli effetti, generation token per
ignorare risultati obsoleti e render virtuale accorpato. Il protocollo Codex
non diventa il dominio interno TALOS.

### Claude Code

Pin pubblico: `a1e64dc407dd57dfb4ea283b0f8049adf3eabee5`.

Il sorgente del renderer non è pubblico; il changelog ufficiale dichiara la
riduzione di subtree walk no-op, aggiornamenti live senza rerender dell'intera
schermata, limiti per tabelle grandi e correzione dei costi quadratici nelle
sessioni lunghe.

Adattamento TALOS: selettori granulari, identità keyed, virtualizzazione e test
che contano i nodi montati. Non vengono inventati dettagli interni non
pubblicati.

## Decisione upstream finale

- **ADOPT**: AbortController/AbortSignal WHATWG, contratti focus APG e
  `@tanstack/virtual-core@3.17.8` dietro adapter TALOS.
- **ADAPT**: effect scope e selector store posseduti da TALOS; coalescenza Pi,
  cleanup Hermes, frame separation Codex e limiti Claude.
- **REJECT ora**: Vue come dipendenza runtime o cutover automatico.
- **DEFER**: prototipo Vue su una verticale reale e decisione owner separata.
- **PRESERVE**: API, SSE, WebSocket, storage e globali Fase 1; UI owner `4174`.

## Addendum re-audit — selector concorrenti e freeze completo

Fonti correnti verificate prima del fix:

- Redux, “Deriving Data with Selectors”:
  https://redux.js.org/usage/deriving-data-selectors
- MDN, `WeakMap`:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap
- MDN, `Reflect.ownKeys()`:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/ownKeys

Redux conferma che una cache singola viene espulsa da input alternati e che
istanze concorrenti devono conservare memoizzazione indipendente. Per i
selector condivisi TALOS la soluzione scelta e una cache per identita della
slice mediante `WeakMap`: evita interferenza fra store e non trattiene slice
diventate irraggiungibili. Non viene introdotto Redux/Reselect perche il
contratto store proprietario e intenzionalmente minimo e l'integrazione di un
framework per due helper privati allargherebbe inutilmente la superficie.

`Object.values()` non visita proprieta non enumerabili ne chiavi `Symbol`.
`Reflect.ownKeys()` e invece il primitivo standard che enumera tutte le
proprieta proprie. `freezeState` usera quindi `Reflect.ownKeys()` e i property
descriptor, ricorrendo su ogni data property prima di `Object.freeze()`.

Decisione aggiornata: **ADAPT** memoizzazione WeakMap nel modulo TALOS;
**ADOPT** primitive ECMAScript standard per il freeze; **REJECT** una nuova
dipendenza di state management per questo fix circoscritto.
