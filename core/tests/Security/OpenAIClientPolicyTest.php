<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use Kadmos\OpenAIClient;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testOpenAIClientRejectsPrivateBaseUrl(): void
{
    $threw = false;

    try {
        new OpenAIClient('secret', 'gpt-test', 'http://127.0.0.1:8080/v1');
    } catch (RuntimeException $exception) {
        $threw = true;
        assertTrue(str_contains($exception->getMessage(), 'blocked by execution policy'), 'Exception should name execution policy block.');
    }

    assertTrue($threw, 'OpenAIClient should reject private provider base URLs.');
}

testOpenAIClientRejectsPrivateBaseUrl();
echo "testOpenAIClientRejectsPrivateBaseUrl passed" . PHP_EOL;
echo "All OpenAIClient policy tests passed" . PHP_EOL;
