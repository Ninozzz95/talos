if(NOT DEFINED GIT_EXECUTABLE OR NOT DEFINED SOURCE_DIR OR NOT DEFINED PATCH_FILE)
    message(FATAL_ERROR "GIT_EXECUTABLE, SOURCE_DIR and PATCH_FILE are required")
endif()

execute_process(
    COMMAND "${GIT_EXECUTABLE}" apply --check --ignore-space-change --ignore-whitespace "${PATCH_FILE}"
    WORKING_DIRECTORY "${SOURCE_DIR}"
    RESULT_VARIABLE forward_check
    OUTPUT_QUIET
    ERROR_QUIET
)

if(forward_check EQUAL 0)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply --ignore-space-change --ignore-whitespace "${PATCH_FILE}"
        WORKING_DIRECTORY "${SOURCE_DIR}"
        RESULT_VARIABLE apply_result
    )
    if(NOT apply_result EQUAL 0)
        message(FATAL_ERROR "SentencePiece Android patch failed after a successful preflight")
    endif()
    return()
endif()

execute_process(
    COMMAND "${GIT_EXECUTABLE}" apply --reverse --check --ignore-space-change --ignore-whitespace "${PATCH_FILE}"
    WORKING_DIRECTORY "${SOURCE_DIR}"
    RESULT_VARIABLE reverse_check
    OUTPUT_QUIET
    ERROR_QUIET
)

if(NOT reverse_check EQUAL 0)
    message(FATAL_ERROR "SentencePiece source is neither pristine nor patched as expected")
endif()

message(STATUS "SentencePiece Android patch is already applied")
