# TALOS Mobile — Review critica severa F1→F6 (mandato owner 2026-07-24)

**Metodo:** audit read-only dell'intera lane (≈40 file sorgente, 10 file di test campionati, 4 ledger,
manifest, build, dist, git history) + diff contro il desktop di riferimento + la memoria di programma
delle 6 fasi. Condotta da un subagente principal-reviewer indipendente, integrata dall'owner di fase
(Fable) con l'autocritica di processo. Nessun file modificato.

## Pagelle per dimensione

| Dimensione | Voto | Sintesi brutale |
|---|---|---|
| Architettura | **B-** | Layering store→repo→runtime tiene, ma `chatController.ts` è un god-facade da 1080 righe/45 membri; due percorsi delete/rename divergenti; App.vue pilota ChatScreen con cast duck-typed; composer con 24 prop/20 emit. |
| Affidabilità | **C+** | `talosWithTimeout` applicato dove il dolore È GIÀ successo, non dove la stessa classe di guasto vive ancora: stream provider senza stall-fence, TUTTE le letture repository non recintate, Preferences/SecureStorage/biometria nude al boot, export non recintato (il Doctor recinta la probe, non la feature). |
| Sicurezza | **B-** | Fondamenta vere (Keystore bool-only, PBKDF2-210k constant-time, SQLCipher fail-closed, manifest stretto, DOMPurify allowlist). MA: **il PIN non ri-arma al resume** (lock solo cold-boot = decorativo nell'uso reale); il BASE_PROMPT mobile ha PERSO la frase anti-injection sulle immagini che il desktop ha; il meccanismo censor è dormiente ma ancora cablato (viola la direttiva obliterazione al primo sync). |
| Parità desktop | **B-** | Port copy-paste senza gate di conformità (drift silenzioso quando il desktop muove markdown/layout); tono+identity+TONE_SUGGESTION sono invenzioni mobile senza ticket di backport; catalogo modelli REIMPLEMENTATO con euristiche proprie. |
| Onestà test | **B+** | Corpus sopra la media (store veri, transport-only fake, PBKDF2 reale). MA la suite e2e testa la shell SBAGLIATA: seed classic, mentre il default spedito (immersive+drawer) è la config MENO coperta. Zero corsia device (STT, biometria, back, insets, rendering WebView reale). |
| Performance | **C+** | Budget entry disciplinato (469k/512k, ~8% headroom). MA ogni chunk di streaming ri-diffa TUTTA la lista messaggi (il throttle 120ms gates solo il parse markdown); `hasPreviousUser` è O(n²) nel render; due round-trip full-table per ogni append. |
| Coerenza UX | **C+** | SEI idiomi overlay coesistono. Peggio: **il programma contraddice la propria dottrina device** — reka Dialog è "provato morto sul WebView dell'owner" (F5.2) eppure guarda ancora Memory delete, Library delete, sidebar Recents, browser frame. Due grammatiche row-action nella stessa era (hold invisibile vs overflow visibile). |
| Processo | **B+** | Ledger eccezionali (ID SF tracciabili ledger→commento→test). MA mega-commit di fase (F4 = 86 file in UNO) uccidono il bisect; "device-proven" è un claim manuale senza corsia automatizzata. |

## I 3 debiti che morderanno l'owner SUL DEVICE questa settimana

1. **Delete su Memory/Library non mostra NULLA** — usano reka Dialog, lo stesso componente provato
   morto sul WebView dell'owner in F5.2. Indistinguibile dai silent no-op già denunciati in F4.
2. **Uno stream che si blocca congela la chat** — `reader.read()` senza fence: al primo handoff
   Wi-Fi→LTE a metà risposta, `sending` resta true, composer disabilitato, si esce solo uccidendo
   l'app. Sul percorso PIÙ usato del prodotto.
3. **Il PIN non protegge il caso quotidiano** — nessun listener `appStateChange`: il lock scatta solo
   a cold-boot. Primo tablet passato di mano = chat aperte. Incidente di fiducia, non bug.

## TOP 10 miglioramenti per leva (dal report, condivisi)

1. Sweep dei 4 siti reka-Dialog superstiti su `TalosMobileConfirmDialog` + cancellare `ui/dialog/`.
2. Watchdog inattività inter-chunk dentro `talosStreamText` (abort reset-on-chunk, rispetta timeoutMs).
3. Gateway bridge recintato unico (`talosBridge.call(tag, ms, fn)` + ring Doctor) per TUTTI i plugin.
4. Re-lock su `appStateChange` con grace window.
5. Ripristinare la frase anti-injection immagini nel BASE_PROMPT (1 riga, regressione reale).
6. Componente figlio dedicato allo streaming (solo lui sottoscrive `streamingText`) + precompute
   `hasPreviousUser` — via il costo O(n) per token PRIMA di parlare di virtualizzazione.
7. Modulo unico `sessionLifecycle` (flush draft + revoca attachment + scope) per ChatScreen,
   ChatsScreen, sidebar e pannello tablet — oggi delete-da-Chats perde la revoca.
8. e2e default = shell SPEDITA (immersive+drawer), pack override "classic".
9. Gate di conformità hash sui file portati dal desktop (stesso trucco di shadcnConformance).
10. Fasi come branch con N commit reviewabili + merge `--no-ff`; smoke emulatore minimo
    (boot→send mock→dialog renderizza→mic tap raggiunge uno stato) come pavimento automatico
    del claim "device-proven".

## Autocritica di processo (Fable, oltre il report)

- **La saga mic ha violato "reproduce before claiming fix" DUE volte**: F5.1 (manifest queries) e
  F5.2 (fork capgo) sono stati spediti come fix senza possibilità di riprodurre sul device; solo alla
  terza iterazione ho costruito PRIMA il canale di evidenza (diagnostics passo-passo nel Doctor).
  La lezione istituzionale: quando il device è irraggiungibile, il PRIMO deliverable è il canale di
  evidenza, non il fix.
- **Il canale chat ha corrotto un APK** (F4) e il protocollo zip+Desktop è nato in reazione, non in
  prevenzione. Andava standardizzato alla prima consegna binaria.
- **e2e: due lezioni pagate care** — `page.mouse.*` raw non ha actionability wait (il boot logo ha
  mangiato i drag: attendere visible→detached SEMPRE prima di gesture raw); un fail deterministico
  nella suite ma verde in isolamento va isolato con `-g` PRIMA di toccare il prodotto.
- **Il pattern ref+watch per idratazione asincrona è una trappola** (F6: width desync) — derivare
  dallo store con override locale è il pattern giusto e va usato d'ufficio.

## Stato di chiusura

- F6 committata `bb73131`; APK F6 consegnato (SHA `525d2f58…`); gates unit 1276 / e2e 54/54 / tsc 0 /
  budget 469.1k/512k.
- Verifica mic su device ANCORA PENDENTE (Doctor F5.3/F6 dirà il passo esatto che muore).
- Proposta: fase **R1 "remediation review"** = item 1-6 del TOP 10 (i tre debiti device-bite inclusi)
  prima di qualsiasi feature nuova. In attesa del via dell'owner.
