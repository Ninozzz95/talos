<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

interface BrowserSessionClient
{
    public function handshake(string $ownerRef, int $timeoutMilliseconds = 5000): TalosBrowserWorkerHandshake;

    /** @return list<array<string, mixed>> */
    public function toolDefinitions(string $ownerRef): array;

    /** @param array<string, mixed> $arguments */
    public function callTool(
        string $ownerRef,
        string $workerSessionId,
        string $toolUseId,
        string $name,
        array $arguments,
        int $timeoutMs = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): BrowserToolResult;

    /** @param array<string, mixed> $file @return array<string, mixed> */
    public function stageFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        array $file,
        int $timeoutMilliseconds = 15000,
    ): array;

    public function discardStagedFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        int $timeoutMilliseconds = 15000,
    ): void;

    /** @return array<string, mixed> */
    public function create(string $ownerRef, int $width, int $height, int $timeoutMilliseconds = 15000, int $ttlSeconds = 3600): array;

    /** @return array<string, mixed> */
    public function createIdempotent(
        string $ownerRef,
        int $width,
        int $height,
        string $idempotencyKey,
        int $timeoutMilliseconds = 15000,
        int $ttlSeconds = 3600,
    ): array;

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
    public function executePointer(
        string $ownerRef,
        string $workerSessionId,
        array $payload,
        int $timeoutMilliseconds = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): array;

    public function cancel(
        string $ownerRef,
        string $workerSessionId,
        string $reason,
        int $timeoutMilliseconds = 15000,
    ): void;

    public function close(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): void;
}
