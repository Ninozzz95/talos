# Il RIENTRO dell'assistente dopo aver aperto un'altra app

> Ricerca tecnica chiesta dall'owner il 2026-08-15: «se chiedo "invia un
> messaggio a Shadina" lui mette il messaggio nel campo input ma non lo invia,
> **la barra assistente non ricompare**, e se dico "invia" non invia nulla.
> Bisogna fare una ricerca web altamente tecnica in modo che questa
> funzionalità sia più **automatizzata, dinamica e universale** per tutte le app
> possibili.»

## ⛔ Perché la sessione muore: sta nella documentazione, non nel nostro codice

`VoiceInteractionSession` **sorveglia le richieste di chiudere la system UI** —
HOME compreso — e le consegna a `onCloseSystemDialogs()`.

> «Sessions automatically watch for requests that all system UI be closed (such
> as when the user presses HOME), which will appear here.
> **The default implementation always calls `finish()`.**»

E lo stesso vale per il completamento di un'attività vocale:

> `onTaskFinished(Intent, int)` — «The default implementation calls `finish()`».

⇒ **Due porte che chiudono la sessione da sole**, e nessuna delle due l'abbiamo
scritta noi. Per sopravvivere a un'apertura d'app vanno sovrascritte entrambe
senza chiamare `finish()`.

## ⛔⛔ Il vincolo che decide se il RIENTRO è possibile

Riaprire la barra dopo aver ceduto lo schermo è un **background activity
launch** (BAL), e su Android 15+ è ristretto:

> «For apps targeting Android 15 or higher, the app must have the
> **SYSTEM_ALERT_WINDOW** permission **and the app must currently have a visible
> overlay window**.»

⇒ Il diritto di rientrare **dipende dall'avere una finestra ancora visibile**.
È la conferma esatta di ciò che avevamo già misurato sul Pad:

> «`startActivity` consegna l'intent ma non porta il task in cima: su questa ROM
> il permesso di lanciare dal fondo vale finché la finestra della barra è
> visibile (`BAL_ALLOW_VISIBLE_WINDOW`), e **decade proprio nell'istante in cui
> la barra si chiude**.»

⇒ **Una barra che sparisce non può richiamarsi.** Qualunque cura che provi a
rilanciare la barra *dopo* averla chiusa lotta contro una regola di sistema.

⛔ E non basta una finestra qualsiasi: «special UI elements like toasts or
picture-in-picture windows don't allow activity starts even though they are
visible».

## ⭐ Come lo sta risolvendo il concorrente

Da una beta di Android, sulle modifiche in arrivo per Gemini:

> «backing out of the overlay will **no longer end that session** — Gemini gets
> **minimized with a small floating icon** at the bottom, which you can tap to
> open up the overlay again and return to **the same session**. If you minimize
> Gemini, it will **continue working** on whatever task you've given it… and get
> a notification when the response is ready.»

⇒ Il pallino non è decorazione: è **la finestra visibile** che tiene in piedi il
diritto di rientrare, ed è anche il modo in cui la persona torna alla
conversazione. Una sola scelta risolve due problemi.

## Il disegno che ne esce, e vale per OGNI app

1. **Non morire.** Sovrascrivere `onCloseSystemDialogs()` e `onTaskFinished()`
   senza `finish()`: l'apertura di un'app non è la fine della conversazione.
2. **Restare visibili in piccolo.** Quando TALOS cede lo schermo, la barra si
   riduce a un pallino invece di sparire — mantenendo `SYSTEM_ALERT_WINDOW` e
   una finestra visibile, cioè il diritto di rientrare.
3. **Rientrare da soli quando il turno lo chiede.** Se il compito non è finito
   (il messaggio è nel campo e non è partito), TALOS torna sopra l'app con il
   contesto nuovo — che è anche il **rilievo #4**, «il sorpasso della pagina
   nuova».
4. **Il turno dopo sa dov'era.** «invia» deve trovare lo stato: quale app, quale
   campo, cosa manca. Senza quello, la seconda frase parla nel vuoto — ed è il
   terzo difetto dei tre segnalati.

⛔ Niente di tutto questo è specifico di WhatsApp: è il modo generale in cui un
assistente **cede e riprende** lo schermo.

## Fonti

- <https://developer.android.com/reference/android/service/voice/VoiceInteractionSession>
- <https://developer.android.com/guide/components/activities/background-starts>
- <https://developer.android.com/guide/components/activities/secure-bal>
- <https://www.phonearena.com/news/google-working-on-major-multitasking-improvement-for-android_id176858>
