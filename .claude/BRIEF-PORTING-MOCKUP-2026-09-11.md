# Brief — porting del mockup interattivo dell'owner nel prodotto (11/09/2026)

Agente Opus 5, effort high. Fonte: `.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`
(938 KB, 4 script, 5 style; funzione `navigate` a riga ~6091, `initSidebar` ~6098, `renderSessions` ~6103).
File in esclusiva: `frontend/src/legacy/app.js`, `frontend/index.template.html`, un foglio NUOVO
`frontend/src/styles/mockup-td.css` importato in coda a `main.css` (mai toccare `desktop-final.css`
né `aspetto.css`), e i test in `frontend/tests/unit/`.
⛔ È un MOCKUP: si porta SOLO ciò che l'owner ha scelto (elenco sotto, da compilare dopo la sua
risposta). Niente dati demo, niente «Studio UI · demo», niente terminale finto: nel prodotto ogni
sezione legge i dati veri dalle rotte che già esistono.

## Regole
italiano; commenti col PERCHÉ e i numeri; RICERCA WEB PRIMA su ogni punto (fonte+data); skill
`frontend-design` prima di ogni superficie; ogni cura al verso contrario; niente git; mai la 4174
(banco su porta tua; sul 4174 solo GET, `page.route('**/api/v1/sessions**')` col doppio asterisco);
foto chiaro E scuro a 1440 e 1024, guardate una per una; non copiare `dist/` in `public/`; test
mirati durante, `npm run test:unit` una volta alla fine.

## Lotti — TUTTI APPROVATI dall'owner l'11/09 sera, uno per uno, con la spiegazione semplice di ciascuno
- [x] A. **Sidebar a gruppi** «Spazi di lavoro» / «Strumenti» richiudibili (`initSidebar`), con
      i conteggi veri; pulsante flottante e drawer sotto 860 px (`openDrawer`/`closeDrawer`).
- [x] B. **Transizione al cambio pagina** (`navigate` → `motion(...,'tab-change')`, opacity .4→1 +
      5 px): rispettare `prefers-reduced-motion` e l'interruttore «Animazioni interfaccia».
- [x] C. **Master/detail nelle sezioni** (`td-master`/`td-detail`, `renderSection`/`renderDetail`)
      per Note, Libreria, Memoria, Attività, Ricerca, Progetti — coi dati veri.
- [x] D. **Menu della sessione** nella barra (`sessionMenu`: tre puntini + tasto destro) e
      selezione multipla (`td-session-selection`, toolbar «N selezionate»).
- [x] E. **Toast** (`toast`, `td-toast-host`) al posto delle note di stato dove il mockup li usa.
- [x] F. **Theme studio** nelle Impostazioni (`themeChooser`, `initAtelier`, `td-theme-*`).
- [x] G. **Modali** `modalShow`/`modalClose` (`td-modal`) al posto dei dialoghi attuali dove il
      mockup li usa.

Rapporto in `.claude/RAPPORTO-PORTING-MOCKUP-2026-09-11.md`: per ogni lotto — cosa fa il mockup
(righe) → cosa esisteva già nel prodotto (riusato, non duplicato) → cura → foto → non verificato.
