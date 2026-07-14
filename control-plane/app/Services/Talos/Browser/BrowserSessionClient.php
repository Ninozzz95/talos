<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

interface BrowserSessionClient
{
    /** @return list<array<string, mixed>> */
    public function toolDefinitions(string $ownerRef): array;

    /** @param array<string, mixed> $arguments */
    public function callTool(string $ownerRef, string $workerSessionId, string $toolUseId, string $name, array $arguments, int $timeoutMs = 15000): BrowserToolResult;

    /** @return array<string, mixed> */
    public function create(string $ownerRef, int $width, int $height, int $timeoutMilliseconds = 15000, int $ttlSeconds = 3600): array;

    /** @return array<string, mixed> */
    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array;

    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array;

    /** @return array<string, mixed> */
    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array;

    /** @return array<string, mixed> */
    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array;

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    public function preflightPointer(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array;

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    public function executePointer(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array;

    public function close(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): void;
}
