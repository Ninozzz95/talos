cmake_minimum_required(VERSION 3.22.1)
project(talos_pocket_sentencepiece LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

include(FetchContent)
set(FETCHCONTENT_QUIET OFF)
find_package(Git REQUIRED)

# Direct upstream integration. Never replace this commit with a tag or branch:
# the tokenizer IDs are part of the model's tensor contract.
set(SPM_ENABLE_SHARED OFF CACHE BOOL "" FORCE)
set(SPM_BUILD_TEST OFF CACHE BOOL "" FORCE)
set(SPM_ENABLE_TCMALLOC OFF CACHE BOOL "" FORCE)
set(SPM_ENABLE_NFKC_COMPILE OFF CACHE BOOL "" FORCE)
set(SPM_ENABLE_BENCHMARK OFF CACHE BOOL "" FORCE)
set(SPM_PROTOBUF_PROVIDER internal CACHE STRING "" FORCE)
set(SPM_ABSL_PROVIDER module CACHE STRING "" FORCE)
FetchContent_Declare(
    sentencepiece
    GIT_REPOSITORY https://github.com/google/sentencepiece.git
    GIT_TAG e0cce7d37b065b5140349dbe12c6bcf6192fdd78
    GIT_SHALLOW FALSE
    GIT_PROGRESS TRUE
    PATCH_COMMAND
        ${CMAKE_COMMAND}
        -DGIT_EXECUTABLE=${GIT_EXECUTABLE}
        -DSOURCE_DIR=<SOURCE_DIR>
        -DPATCH_FILE=${CMAKE_CURRENT_LIST_DIR}/patches/sentencepiece-android-no-symlink.patch
        -P ${CMAKE_CURRENT_LIST_DIR}/patches/apply-git-patch-idempotently.cmake
)
FetchContent_MakeAvailable(sentencepiece)

# SentencePiece's upstream CMake also declares trainers and host CLIs. TALOS
# links only the supported inference processor; excluding the other targets
# prevents unrelated executables from entering an Android build.
foreach(unused_target
        sentencepiece_train-static
        spm_encode
        spm_decode
        spm_normalize
        spm_train
        spm_export_vocab)
    if(TARGET ${unused_target})
        set_target_properties(${unused_target} PROPERTIES EXCLUDE_FROM_ALL TRUE)
    endif()
endforeach()

add_library(talos_pocket_sentencepiece SHARED talos_pocket_jni.cpp)
target_include_directories(
    talos_pocket_sentencepiece
    SYSTEM
    PRIVATE
    ${sentencepiece_SOURCE_DIR}
    ${sentencepiece_SOURCE_DIR}/src
    ${sentencepiece_BINARY_DIR}
)
target_link_libraries(talos_pocket_sentencepiece PRIVATE sentencepiece-static log)
target_compile_options(talos_pocket_sentencepiece PRIVATE -Wall -Wextra -Werror)
