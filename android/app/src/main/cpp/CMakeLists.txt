# Il motore che ESEGUE. La metà che decide — TalosBackendChoice e
# TalosBenchmarkHarness — esiste già in Java ed è provata senza dispositivo;
# questo è ciò che le dà qualcosa da governare.
#
# La versione non è scelta a caso: 3.31.6 è quella con cui llama.cpp costruisce
# il proprio esempio Android (examples/llama.android). Stare sulla loro riga
# significa che i loro guasti sono i nostri e le loro correzioni pure.
cmake_minimum_required(VERSION 3.31.6)

project("talos_llama" VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED true)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED true)

if(DEFINED ANDROID_ABI)
    if(NOT ANDROID_ABI STREQUAL "arm64-v8a")
        # Non è una limitazione tecnica mascherata da scelta: llama.cpp su ARM a
        # 32 bit non è una strada seria, e un ABI in più raddoppia il tempo di
        # compilazione per dispositivi che nel 2026 non esistono più.
        message(FATAL_ERROR "TALOS compila il motore locale solo per arm64-v8a, non per ${ANDROID_ABI}")
    endif()
    set(GGML_SYSTEM_ARCH "ARM")
endif()

set(LLAMA_SRC ${CMAKE_CURRENT_LIST_DIR}/../../../../../third_party/llama.cpp)
if(NOT EXISTS ${LLAMA_SRC}/CMakeLists.txt)
    # Il sottomodulo è la cosa che un clone non porta se non gliela chiedi. Un
    # errore che lo dice per nome costa un minuto; uno che parla di header
    # mancanti costa un pomeriggio.
    message(FATAL_ERROR
        "llama.cpp non è nella cartella ${LLAMA_SRC}. È un sottomodulo git: "
        "esegui `git submodule update --init --depth 1 mobile/third_party/llama.cpp`")
endif()

# `LLAMA_BUILD_COMMON` vale `${LLAMA_STANDALONE}`, che è FALSO quando llama.cpp
# entra come sottocartella di un altro progetto — cioè sempre, da noi. Senza
# questa riga il target `llama-common` non esiste e il linker lo cerca come
# libreria di sistema (`-lllama-common`), con un errore che parla di percorsi e
# non di opzioni.
set(LLAMA_BUILD_COMMON ON CACHE BOOL "" FORCE)

add_subdirectory(${LLAMA_SRC} build-llama)

add_library(talos_llama SHARED talos_llama_jni.cpp)

# `common` non è una comodità: è dove sta il template VERO.
#
# `llama_chat_apply_template`, l'API di basso livello che usavamo, non esegue
# mai il template Jinja del GGUF — lo annusa per sottostringhe
# (`llm_chat_detect_template`) e poi applica una reimplementazione C++ cablata
# della famiglia indovinata. Per ogni Qwen3 il verdetto è «CHATML» e ne esce
# ChatML nudo, mentre il template vero contiene la logica `enable_thinking`, il
# prefill di `<think>` e l'intero blocco `<tools>`. Da lì i due difetti che
# l'owner ha visto: i tag di ragionamento stampati nel corpo, e nessuna
# possibilità di passare un tool.
#
# `llama-common` porta il motore Jinja in casa (`common/jinja/`), l'API
# `common_chat_templates_apply` / `common_chat_parse`, e
# `json-schema-to-grammar`. Non è una dipendenza esotica: è ciò che l'esempio
# Android ufficiale di llama.cpp linka (`examples/llama.android`), quindi la
# compilazione per arm64 è una strada già battuta da loro.
target_include_directories(talos_llama PRIVATE
        ${LLAMA_SRC}
        ${LLAMA_SRC}/common
        ${LLAMA_SRC}/include
        ${LLAMA_SRC}/ggml/include)

target_link_libraries(talos_llama
        llama
        llama-common
        android
        log)
