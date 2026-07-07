<?php

declare(strict_types=1);

namespace Kadmos;

final class CurlHttpClient implements HttpClientInterface
{
    public function __construct(
        private int $timeoutMs = 5000,
    ) {}

    public function postJson(string $url, array $body): array
    {
        $ch = \curl_init($url);
        \curl_setopt_array($ch, [
            \CURLOPT_RETURNTRANSFER => true,
            \CURLOPT_POST => true,
            \CURLOPT_POSTFIELDS => \json_encode($body),
            \CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            \CURLOPT_TIMEOUT_MS => $this->timeoutMs,
        ]);

        $response = \curl_exec($ch);
        $error = \curl_error($ch);

        if ($response === false) {
            throw new \RuntimeException("Validator unreachable: {$error}");
        }

        return \json_decode($response, true, flags: \JSON_THROW_ON_ERROR);
    }
}
