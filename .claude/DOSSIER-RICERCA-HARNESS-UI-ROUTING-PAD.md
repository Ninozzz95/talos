# Dossier ricerca — Harness UI routing e verifica Pad

Data: 2026-08-25  
Owner: TALOS UI mobile  
Stato: gate di ricerca superato prima delle modifiche di comportamento.

## Perimetro ed evidenza

Il lavoro riguarda esclusivamente l'integrazione della Harness UI demo nella
shell Vue mobile. Restano fuori TALOS-BANCO, execution plane, control-plane,
desktop, motore locale, voce nativa e repository `AVM-harness-ui`.

Le funzioni non collegate restano esplicitamente `Demo UI · non collegato`.
Nessuna superficie deve simulare un successo di rete o backend.

- Device: OPD2415, seriale `2ea6573c`.
- Pacchetto verificato: `ai.talos.dev`.
- Browser/WebView osservato: Chrome 151.0.7922.173.
- 140 screenshot reali ispezionati integralmente in
  `C:\Users\Antonino\AppData\Local\Temp\talos-harness-readonly-20260824-2307`.
- Matrice: tablet portrait/landscape e phone portrait/landscape simulato,
  tastiera aperta/chiusa, controlli e scroll completi.
- Ripristino: 2400x3392, density 420, rotazione automatica attiva.

## Cause misurate

1. Il rail Vue delle sessioni Harness non espone compressione.
2. Il drawer globale usa `z-50`, mentre la station sheet usa `z-[70]`.
3. Un `<dialog>` modale Harness entra nel top layer: nessun normale `z-index`
   può superarlo.
4. La station sheet scorre esternamente e il mockup usa ancora `100dvh`: il
   composer è ancorato a un rettangolo più alto dell'host.
5. Il comportamento mobile dipende da `window` e dalla sola larghezza; il
   phone landscape reale è largo ma molto basso.
6. Il parametro Vue Router è solo diagnostico: il mockup resta sulla sessione
   statica `Refactor auth flow`.
7. Il filtro imposta `hidden`, ma `.command-results button { display:flex }`
   ne forza ancora il rendering.
8. Il microfono non ha un listener.
9. I badge demo assoluti collidono con controlli diversi per struttura.
10. I colori locali imitano Calm ma non consumano i token del theme engine.

## Fonti ufficiali e decisioni

### Vue Router 5.2.0 — adottato direttamente

- https://router.vuejs.org/guide/advanced/composition-api.html
- https://router.vuejs.org/guide/essentials/dynamic-matching.html

La stessa istanza viene riusata quando cambia un parametro dinamico. Si osserva
la sola proprietà `route.params.id`, non l'intera route. Il pin esistente resta.

### Capacitor Keyboard 8.0.5 — adottato direttamente

- https://capacitorjs.com/docs/apis/keyboard

Il plugin espone eventi show/hide e listener removibili. Su Android il layout
deve reagire alla WebView/host reale e agli eventi; nessun inset presunto e
nessun plugin nuovo.

### Container Queries e ResizeObserver — adottati direttamente

- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API

Le container query rispondono al rettangolo realmente assegnato allo shadow
host. `ResizeObserver` serve solo ai comportamenti JS non esprimibili in CSS e
viene sempre disconnesso nel distruttore.

### `hidden`, stacking e top layer — adattamento AVM

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context
- https://developer.mozilla.org/en-US/docs/Glossary/Top_layer

Una dichiarazione autore `display` può prevalere su `hidden`. Un elemento nel
top layer sta sopra i normali stacking context. Servono quindi sia livelli
globali coerenti sia un ponte AVM che chiuda le superfici transitorie Harness
prima di aprire la navigazione globale.

### Shadow DOM e theme engine — mantenuto e adattato

- https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM

Le proprietà personalizzate ereditano attraverso lo shadow boundary salvo
ridefinizioni locali. Gli alias Harness verranno mappati su `--talos-*`, con
fallback soltanto per l'apertura statica del mockup.

## Pin upstream

- `vue@3.5.40`
- `vue-router@5.2.0`
- `@capacitor/core@8.4.2`
- `@capacitor/android@8.4.2`
- `@capacitor/keyboard@8.0.5`
- `vaul-vue@0.4.1`
- `reka-ui@2.10.1`

Nessuna nuova dipendenza. Container Queries, ResizeObserver, Shadow DOM e
top-layer sono API native del browser target.

## Alternative respinte

- Iframe: viola `frame-src 'none'` e separa nuovamente la SPA.
- Nuovo framework/microfrontend package: non risolve il contratto dell'host.
- Media query viewport-only: non misura lo spazio reale di Harness.
- Solo aumento di z-index: non supera il browser top layer.
- Nuovo backend/TALOS-BANCO: fuori perimetro owner.
- Tema Calm fissato: superato dalla decisione owner sui token TALOS.

Se una prova invalida il ledger, dossier e ledger vengono aggiornati prima di
proseguire. Nuove dipendenze o confini richiedono una nuova decisione owner.
