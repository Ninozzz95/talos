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
#                           per annotazione. ⭐ NON servono regole nostre:
#                           `@capacitor/android` dichiara `consumerProguardFiles`
#                           e le sue regole tengono `@CapacitorPlugin`, i
#                           `@PluginMethod` e ogni sottoclasse di `Plugin`.
#                           Verificato nel suo build.gradle, non supposto.
#
#   5 classi con `native`   ai.talos.TalosLlamaNative, TalosLlamaEngine,
#                           TalosBiometricKeyPlugin, TalosBackendChoice,
#                           TalosModelDownloadPolicy.
#
#   1 FindClass dal C++     "java/lang/IllegalStateException" — una classe della
#                           piattaforma, che R8 non tocca.
#
# ⇒ Serve una regola sola.

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
