# JNI resolves these symbols by their Java binary name. Keep the narrow bridge
# stable while allowing every non-native runtime class to be optimized normally.
-keepclasseswithmembernames,includedescriptorclasses class ai.talos.voice.pocket.TalosPocketTokenizerJni {
    native <methods>;
}
-keepclasseswithmembernames,includedescriptorclasses class ai.talos.voice.pocket.TalosPocketResamplerJni {
    native <methods>;
}
