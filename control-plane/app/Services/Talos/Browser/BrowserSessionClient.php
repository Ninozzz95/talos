<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

interface BrowserSessionClient
{
    /** @return array<string, mixed> */
    public function create(string $ownerRef, int $width, int $height): array;
    /** @return array<string, mixed> */
    public function navigate(string $ownerRef, string $workerSessionId, string $url): array;
    /** @return array<string, mixed> */
    public function screenshot(string $ownerRef, string $workerSessionId): array;
    /** @return array<string, mixed> */
    public function snapshot(string $ownerRef, string $workerSessionId): array;
    public function close(string $ownerRef, string $workerSessionId): void;
}
