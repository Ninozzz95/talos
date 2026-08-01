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

add_subdirectory(${LLAMA_SRC} build-llama)

add_library(talos_llama SHARED talos_llama_jni.cpp)

target_include_directories(talos_llama PRIVATE
        ${LLAMA_SRC}/include
        ${LLAMA_SRC}/ggml/include)

target_link_libraries(talos_llama
        llama
        android
        log)
