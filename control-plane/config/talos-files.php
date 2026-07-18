<?php

declare(strict_types=1);

return [
    'max_upload_bytes' => (int) env('TALOS_FILE_MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
    'max_original_name_bytes' => (int) env('TALOS_FILE_MAX_ORIGINAL_NAME_BYTES', 255),
    'allowed_extensions' => ['txt', 'md', 'csv', 'json', 'pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp'],

    'archive' => [
        'max_entries' => (int) env('TALOS_FILE_ARCHIVE_MAX_ENTRIES', 2048),
        'max_expanded_bytes' => (int) env('TALOS_FILE_ARCHIVE_MAX_EXPANDED_BYTES', 50 * 1024 * 1024),
        'max_entry_bytes' => (int) env('TALOS_FILE_ARCHIVE_MAX_ENTRY_BYTES', 25 * 1024 * 1024),
        'max_compression_ratio' => (int) env('TALOS_FILE_ARCHIVE_MAX_COMPRESSION_RATIO', 100),
    ],

    'clamav' => [
        'host' => env('TALOS_CLAMAV_HOST', 'clamav'),
        'port' => (int) env('TALOS_CLAMAV_PORT', 3310),
        'connect_timeout_seconds' => (int) env('TALOS_CLAMAV_CONNECT_TIMEOUT_SECONDS', 3),
        'read_timeout_seconds' => (int) env('TALOS_CLAMAV_READ_TIMEOUT_SECONDS', 20),
        'chunk_bytes' => (int) env('TALOS_CLAMAV_CHUNK_BYTES', 65_536),
        'expected_version' => env('TALOS_CLAMAV_EXPECTED_VERSION', '1.5.3'),
    ],

    'tika' => [
        'url' => env('TALOS_TIKA_URL', 'http://tika:9998'),
        'timeout_seconds' => (int) env('TALOS_TIKA_TIMEOUT_SECONDS', 30),
        'max_response_bytes' => (int) env('TALOS_TIKA_MAX_RESPONSE_BYTES', 10 * 1024 * 1024),
        'max_extracted_bytes' => (int) env('TALOS_TIKA_MAX_EXTRACTED_BYTES', 5 * 1024 * 1024),
        'expected_version' => env('TALOS_TIKA_EXPECTED_VERSION', '3.3.1'),
    ],

    'ocr' => [
        'enabled' => (bool) filter_var(env('TALOS_OCR_ENABLED', false), FILTER_VALIDATE_BOOL),
        'url' => env('TALOS_OCR_URL', 'http://ocr-worker:3200'),
        'token' => env('TALOS_OCR_WORKER_TOKEN', ''),
        'protocol' => env('TALOS_OCR_PROTOCOL', 'talos.ocr.worker.v1'),
        'timeout_seconds' => (int) env('TALOS_OCR_TIMEOUT_SECONDS', 180),
        'max_response_bytes' => (int) env('TALOS_OCR_MAX_RESPONSE_BYTES', 10 * 1024 * 1024),
        'expected_model' => env('TALOS_OCR_EXPECTED_MODEL', 'deepseek-ai/DeepSeek-OCR-2'),
        'expected_model_revision' => env('TALOS_OCR_EXPECTED_MODEL_REVISION', 'aaa02f3811945a91062062994c5c4a3f4c0af2b0'),
        'expected_served_model' => env('TALOS_OCR_EXPECTED_SERVED_MODEL', 'deepseek-ai/DeepSeek-OCR-2@aaa02f3811945a91062062994c5c4a3f4c0af2b0'),
        'expected_runtime_version' => env('TALOS_OCR_EXPECTED_RUNTIME_VERSION', '0.25.1'),
        'expected_pdf_renderer_version' => env('TALOS_OCR_EXPECTED_PDF_RENDERER_VERSION', '5.12.1'),
        'expected_image_renderer_version' => env('TALOS_OCR_EXPECTED_IMAGE_RENDERER_VERSION', '12.3.0'),
        'pdf_min_native_chars' => (int) env('TALOS_OCR_PDF_MIN_NATIVE_CHARS', 32),
        'pdf_min_native_chars_per_page' => (int) env('TALOS_OCR_PDF_MIN_NATIVE_CHARS_PER_PAGE', 12),
    ],
];
