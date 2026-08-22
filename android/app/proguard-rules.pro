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
