<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testProductionClientsDefaultToSslVerification(): void
{
    foreach ([
        __DIR__ . '/../../src/OpenAIClient.php',
        __DIR__ . '/../../src/AnthropicClient.php',
        __DIR__ . '/../../kadmos-chat-repl.php',
    ] as $file) {
        $source = (string) file_get_contents($file);
        assertTrue(str_contains($source, 'CURLOPT_SSL_VERIFYPEER') && str_contains($source, '= true'), basename($file) . ' should verify SSL peers by default.');
        assertTrue(str_contains($source, 'CURLOPT_SSL_VERIFYHOST') && str_contains($source, '= 2'), basename($file) . ' should verify SSL hostnames by default.');
    }
}

function testInsecureSslRequiresExplicitEnvironmentFlag(): void
{
    foreach ([
        __DIR__ . '/../../src/OpenAIClient.php',
        __DIR__ . '/../../src/AnthropicClient.php',
        __DIR__ . '/../../kadmos-chat-repl.php',
    ] as $file) {
        $source = (string) file_get_contents($file);
        assertTrue(str_contains($source, 'KADMOS_INSECURE_SSL'), basename($file) . ' should only allow insecure SSL through an explicit environment flag.');
    }
}

$tests = [
    'testProductionClientsDefaultToSslVerification',
    'testInsecureSslRequiresExplicitEnvironmentFlag',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All SSL verification tests passed" . PHP_EOL;
