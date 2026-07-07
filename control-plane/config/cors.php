<?php

declare(strict_types=1);

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_filter(array_map(
        'trim',
        explode(',', env('KADMOS_ALLOWED_ORIGINS', 'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8001,http://localhost:8001')),
    )),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
