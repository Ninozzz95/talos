# Dossier ricerca — Frontend desktop Fase 3

Data: 2026-09-01  
Perimetro: TALOS UI desktop, Design system Calm e primitive.  
Owner runtime: `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend`.  
Vincolo: nessun cutover e nessuna modifica a `harness-ui/public/` o `mobile/`.

## Problema misurato localmente

La fondazione modulare della Fase 2 ha focus manager, overlay manager, lifecycle,
DOM sicuro e virtualizzazione, ma `src/styles/index.css` contiene ancora colori,
raggi, ombre e misure ad hoc. Non esistono primitive desktop possedute per
Button, IconButton, Badge, Tabs, Switch, MenuButton, Tooltip e Sheet.

Il prodotto owner in `harness-ui/public/styles.css` possiede già il vocabolario
`--talos-*` e il mobile, ispezionato in sola lettura, aggiunge densità, spacing,
tipografia, touch target, motion e componenti controllati. Copiare i componenti
Vue/Reka nel desktop ESM creerebbe due runtime e violerebbe la decisione
framework-neutral della Fase 2; ignorarne il contratto creerebbe invece drift.

## Fonti primarie aggiornate

- W3C WAI-ARIA APG: Button, Tabs, Switch, Menu Button, Tooltip e Dialog Modal.
  Contratti adottati: elementi nativi quando disponibili; nomi accessibili;
  `aria-selected`/`aria-controls`; roving tabindex; switch con nome stabile;
  Escape e ritorno focus; sfondo modale inerte.
- Design Tokens Community Group, Format Module stabile `2025.10`.
  Definisce token tipizzati, gruppi, alias e un formato interoperabile.
- MDN, `prefers-reduced-motion` e `forced-colors` aggiornati nel 2026.
  Motion non essenziale deve essere ridotto; in forced colors ombre e colori
  autore possono sparire, quindi focus, thumb e superfici richiedono bordi con
  system colors.
- Floating UI, `computePosition()` e `autoUpdate()`: posizionamento e
  aggiornamento di superfici flottanti rispetto a scroll, resize e layout.
  Pin npm misurato: `@floating-ui/dom@1.8.0`, MIT.
- Microsoft Fluent 2 Button: una sola azione primaria per layout, semantica
  button distinta dai link, testo e stato oltre al solo colore, motivo visibile
  per i controlli disabilitati.
- Claude Code Desktop: menu dedicati a modello, permessi ed effort, shortcut
  scopribili, selezione rapida 1–9 e pannelli apribili/chiudibili senza perdere
  la sessione.
- OpenAI Docs, use case shell desktop: sidebar, detail e inspector sono regioni
  distinte; non emerge un contratto pubblico più preciso per le primitive.
- Hermes Agent upstream: dashboard React/shadcn-style, token testuali
  semantici, corpo minimo 12 px, opacità testo non inferiore a 0,7 e tipografia
  tecnica separata; le pagine amministrative restano collegate a backend vero.

## Confronto e decisione one-up

### Mobile TALOS

Punto forte: `TalosThemedSwitch` è controllato e conserva il nome accessibile;
`TalosThemedTabs` centralizza la grammatica e distingue attivazione manuale da
automatica; theme e motion espongono token espliciti.

Debito da non importare: swipe e touch target da 48 px sono mobile-specifici.
Il desktop conserva hit area minima 36 px e primari 40 px, tastiera completa e
densità più compatta, usando lo stesso vocabolario semantico.

### Claude Code Desktop

Punto forte: comandi e menu critici sono raggiungibili con shortcut e non
dipendono dal puntatore. TALOS pareggia la semantica tastiera nelle primitive e
prepara shortcut scopribili; la mappa globale resta nella Fase 4.

### Codex

La documentazione ufficiale disponibile conferma la shell a regioni e il
workflow di modifica/verifica, non pubblica specifiche di primitive da copiare.
TALOS non inventa dettagli visivi; usa standard W3C e conserva la propria
grammatica Calm.

### Hermes

Punto forte: semantica dei token e floor tipografico espliciti. TALOS adotta lo
stesso principio e lo supera con contratto forced-colors, motion ridotto,
controlli controllati, teardown deterministico e posizionamento flottante
dietro adapter.

## Decisione upstream

- **ADOPT** `@floating-ui/dom@1.8.0` dietro adapter TALOS per menu e tooltip;
  pin esatto, licenze di `dom`, `core` e `utils` nel manifest.
- **ADAPT** i pattern WAI-ARIA in primitive ESM possedute da TALOS, riusando
  focus e overlay manager della Fase 2.
- **ADAPT** il vocabolario mobile/public `--talos-*` con alias desktop e
  fallback Calm in un solo foglio token.
- **DEFER** un file DTCG canonico: il mobile possiede già un contratto identità;
  crearne ora un secondo sarebbe una nuova fonte di verità. La conversione
  DTCG va affrontata con il theme engine condiviso, non dentro una libreria UI.
- **REJECT** un secondo framework UI o una copia di shadcn/Reka: la Fase 2 ha
  confermato ESM framework-neutral e nessun cutover è autorizzato.

## Requisiti bloccanti

1. Nessun colore, durata, raggio o metrica di componente fuori dai token.
2. Button e link non sono intercambiabili; un controllo disabilitato espone il
   motivo senza fingere un'azione.
3. Tabs: frecce/Home/End, attivazione manuale di default e relazione completa
   fra tab e panel.
4. Switch controllato, nome invariato e `aria-checked` coerente.
5. Menu: focus nel primo/ultimo elemento, frecce, Home/End, Escape, Tab e
   ritorno focus; nessun doppio handler dopo destroy.
6. Tooltip non riceve focus, apre da hover/focus, chiude con Escape e resta
   associato da `aria-describedby`.
7. Sheet usa overlay/focus manager esistenti, background inerte e close button
   visibile.
8. Reduced motion e forced colors sono prove obbligatorie, non eccezioni.
9. Ogni primitive ha screenshot e test alle viewport 1440×900, 1280×800 e
   1024×800; nessun overflow pagina o errore console/rete.

## Fonti

- https://www.w3.org/WAI/ARIA/apg/patterns/button/
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- https://www.w3.org/WAI/ARIA/apg/patterns/switch/
- https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
- https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/forced-colors
- https://floating-ui.com/docs/computeposition
- https://floating-ui.com/docs/autoupdate
- https://fluent2.microsoft.design/components/web/react/core/button/usage
- https://code.claude.com/docs/en/desktop
- https://developers.openai.com/codex/use-cases
- https://github.com/NousResearch/hermes-agent/blob/main/web/README.md
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/web-dashboard.md

