<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testCoreHttpClientsDoNotCallDeprecatedCurlClose(): void
{
    $files = [
        __DIR__ . '/../src/CurlHttpClient.php',
        __DIR__ . '/../src/Validator/ValidatorHealthCheck.php',
    ];

    foreach ($files as $file) {
        $contents = (string) file_get_contents($file);
        assertTrue(!str_contains($contents, 'curl_close('), basename($file) . ' should not call deprecated curl_close() on PHP 8.5.');
    }
}

$tests = [
    'testCoreHttpClientsDoNotCallDeprecatedCurlClose',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All cURL deprecation tests passed" . PHP_EOL;

