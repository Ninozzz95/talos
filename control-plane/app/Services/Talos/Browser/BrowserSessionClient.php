<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

interface BrowserSessionClient
{
    /** @return array<string, mixed> */
    public function create(string $ownerRef, int $width, int $height): array;
    /** @return array<string, mixed> */
    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array;
    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array;
    /** @return array<string, mixed> */
    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array;
    /** @return array<string, mixed> */
    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array;
    public function close(string $ownerRef, string $workerSessionId): void;
}
