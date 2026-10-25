# ⛔⛔⛔ LE REGOLE SONO POCHE PERCHÉ VENGONO DA UN INVENTARIO, non da un modello.
#
# R8 rinomina e rimuove tutto ciò che non riesce a vedere usato. Un `-keep`
# scritto per prudenza spegne l'ottimizzazione su un pezzo di app senza che
# nessuno sappia più perché — e le regole copiate da un altro progetto sono
# esattamente questo.
#
# Quindi: si è guardato che cosa, in QUESTA app, viene raggiunto per un nome
# invece che per un riferimento.
#
#   26 plugin Capacitor     registrati con `registerPlugin(X.class)` e trovati
#                           per annotazione. Le consumer rules tengono i
#                           plugin e i metodi, ma la prova release del
#                           2026-08-18 ha mostrato che R8 full-mode rimuoveva
#                           i membri delle annotazioni che il framework legge
#                           via reflection. Il blocco qui sotto è quindi
#                           app-specifico e risponde a quel fatto misurato.
#
#   5 classi con `native`   ai.talos.TalosLlamaNative, TalosLlamaEngine,
#                           TalosBiometricKeyPlugin, TalosBackendChoice,
#                           TalosModelDownloadPolicy.
#
#   1 FindClass dal C++     "java/lang/IllegalStateException" — una classe della
#                           piattaforma, che R8 non tocca.
#
# ⇒ Servono il ponte JNI e il contratto runtime delle annotazioni.

# ⛔⛔⛔ CAPACITOR PERMISSION METADATA — PERM-RED-01/02.
#
# Capacitor 8 costruisce il registro dei permessi da `@CapacitorPlugin` e dalle
# `@Permission` annidate. In R8 full-mode `-keepattributes` non conserva da
# solo il payload: anche l'interfaccia dell'annotazione e i suoi membri devono
# essere keepati esplicitamente. La prova dell'APK release precedente mostrava
# infatti solo `name`, senza `permissions`, e i metodi del framework finivano in
# un NPE quando cercavano gli alias.
#
# Queste sono le sole annotazioni Capacitor usate nel contratto nativo TALOS.
# Si conserva il loro nome, il corpo e i default; non si disabilita R8 sul resto
# dell'app e non si tocca node_modules.
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault
-keep @interface com.getcapacitor.annotation.CapacitorPlugin { *; }
-keep @interface com.getcapacitor.annotation.Permission { *; }
-keep @interface com.getcapacitor.annotation.PermissionCallback { *; }
-keep @interface com.getcapacitor.annotation.ActivityCallback { *; }
-keep @interface com.getcapacitor.PluginMethod { *; }

# ⛔ Il legame fra Java e C++ è un NOME, e sta scritto nel simbolo nativo:
#
#     Java_ai_talos_TalosLlamaNative_nativeOpen
#
# Se R8 rinomina la classe o il metodo, quel simbolo non corrisponde più a
# niente. Non è un errore di compilazione: è un `UnsatisfiedLinkError` al primo
# uso, cioè un'app che si apre e poi non risponde quando la persona parla col
# modello locale.
#
# `keepclasseswithmembernames` tiene il NOME della classe e dei suoi metodi
# nativi, e lascia R8 libero su tutto il resto — compresi i campi e gli altri
# metodi di quelle stesse classi. È il minimo che fa funzionare il ponte.
-keepclasseswithmembernames class * {
    native <methods>;
}

# ⛔ Le righe di origine restano, e la mappa di R8 le riscrive.
#
# Senza, un rapporto di crash arriva con `a.b.c(SourceFile)` e non si sa da dove
# venga. Con, e con il file di mappatura conservato accanto all'artefatto, si
# risale alla riga vera. Un crash che non si sa leggere è un crash che non si
# corregge.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ONNX Runtime's Android JNI bridge reflects over these Java binding classes
# when converting the first native tensor result. The official Android guide
# requires this keep rule for R8-minimized applications.
-keep class ai.onnxruntime.** { *; }

# ⛔⛔ D-REM-R8 (telefono dell'owner, 0.1.44, 23/10/2026): il controllo remoto
# (iroh-ffi via JNA) chiudeva l'app all'accoppiamento col PC —
# `UnsatisfiedLinkError: Can't obtain peer field ID for class com.sun.jna.Pointer`.
# La parte nativa di JNA cerca i campi delle sue classi PER NOME, e i binding
# UniFFI di iroh sono strutture JNA lette per nome di campo: R8 li rinominava.
# Regole della FAQ di JNA («JNA on Android»), nella forma con `**` usata dalle
# librerie UniFFI (Breez SDK, Mozilla Glean). Le build di prova debug non
# passano da R8: questo si vede SOLO in una build minificata.
-dontwarn java.awt.*
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class computer.iroh.** { *; }

# ⛔ F (24/10/2026): `computer.iroh.IrohAndroid` è nostra (copiata da upstream
# iroh-ffi v1.1.0, `jniLibs/PROVENIENZA-IROH.md`) e la .so la cerca per NOME:
# `Java_computer_iroh_IrohAndroid_installAndroidContext`. La riga sopra già la
# copre; questa la nomina da sola, così chi un giorno stringe `computer.iroh.**`
# non spegne in silenzio l'inizializzazione (si vedrebbe solo in release).
-keep class computer.iroh.IrohAndroid {
    native <methods>;
}

# N12 — sherpa-onnx (riconoscimento vocale locale). Il suo JNI costruisce le
# configurazioni leggendo i campi delle classi Kotlin PER NOME (GetFieldID) e
# crea i risultati chiamandone i costruttori: rinominate o tolte da R8, il
# riconoscitore non parte. E' l'interfaccia ufficiale, copiata invariata
# (`src/main/jniLibs/PROVENIENZA-ASR.md`).
-keep class com.k2fsa.sherpa.onnx.** { *; }

# ⛔⛔⛔ CODICE (harness UI + terminale), 3/9 — appena arrivate in `main`.
#
# Le altre 26 registrazioni di MainActivity chiamano `registerPlugin(X.class)`
# — un riferimento diretto che R8 traccia da solo. Queste due sono diverse:
# `Class.forName("ai.talos.harness.TalosHarnessUiPlugin")` /
# `Class.forName("ai.talos.terminal.TalosTerminalPlugin")` sono ricerche per
# STRINGA (il motivo: la classe poteva non esistere affatto — vedi il
# commento di classe di TalosHarnessUiPlugin). R8 non traccia una stringa fino
# alla classe che nomina come farebbe con `X.class`: senza questa riga
# potrebbe rinominarle, e la ricerca fallirebbe A RUNTIME con
# ClassNotFoundException — non in compilazione, dove nessuno lo vedrebbe fino
# a quando una persona non prova ad aprire Codice sul telefono.
-keep class ai.talos.harness.TalosHarnessUiPlugin { *; }
-keep class ai.talos.terminal.TalosTerminalPlugin { *; }
