<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Services\Talos\Browser\TalosBrowserWorkerProtocol;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

final class TalosReadinessService
{
    /**
     * @return array{ready: bool, status: string, checks: array<string, array{status: string, detail: string}>, timestamp: string}
     */
    public function report(): array
    {
        $checks = [
            'app_key' => $this->appKeyCheck(),
            'database' => $this->databaseCheck(),
            'migrations' => $this->migrationsCheck(),
            'storage' => $this->storageCheck(),
            'queue' => $this->queueCheck(),
            'validator' => $this->validatorCheck(),
            'browser_worker' => $this->browserWorkerCheck(),
        ];

        $ready = ! collect($checks)->contains(
            fn (array $check): bool => $check['status'] !== 'healthy',
        );

        return [
            'ready' => $ready,
            'status' => $ready ? 'healthy' : 'degraded',
            'checks' => $checks,
            'timestamp' => now()->toIso8601String(),
        ];
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function appKeyCheck(): array
    {
        $key = config('app.key');

        if (! is_string($key) || trim($key) === '') {
            return $this->check('failed', 'APP_KEY is not configured.');
        }

        return $this->check('healthy', 'APP_KEY is configured.');
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function databaseCheck(): array
    {
        try {
            DB::select('select 1');

            return $this->check('healthy', 'database query succeeded.');
        } catch (\Throwable $exception) {
            return $this->check('failed', $exception->getMessage());
        }
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function migrationsCheck(): array
    {
        try {
            if (! Schema::hasTable('migrations')) {
                return $this->check('failed', 'migrations table is missing.');
            }

            return $this->check('healthy', 'migrations table is available.');
        } catch (\Throwable $exception) {
            return $this->check('failed', $exception->getMessage());
        }
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function storageCheck(): array
    {
        $path = storage_path();

        if (! is_dir($path)) {
            return $this->check('failed', 'storage directory is missing.');
        }

        if (! is_writable($path)) {
            return $this->check('failed', 'storage directory is not writable.');
        }

        return $this->check('healthy', 'storage directory is writable.');
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function queueCheck(): array
    {
        $connection = config('queue.default');

        if (! is_string($connection) || trim($connection) === '') {
            return $this->check('failed', 'QUEUE_CONNECTION is not configured.');
        }

        if ($connection === 'database' && ! Schema::hasTable('jobs')) {
            return $this->check('failed', 'database queue selected but jobs table is missing.');
        }

        return $this->check('healthy', "queue connection '{$connection}' is configured.");
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function validatorCheck(): array
    {
        $url = config('services.talos.validator_health_url');

        if (! is_string($url) || trim($url) === '') {
            return $this->check('failed', 'TALOS_VALIDATOR_HEALTH_URL is not configured.');
        }

        try {
            $response = Http::timeout(1)->acceptJson()->get($url);
        } catch (\Throwable $exception) {
            return $this->check('failed', 'validator health request failed: '.$exception->getMessage());
        }

        if (! $response->successful()) {
            return $this->check('failed', 'validator health returned HTTP '.$response->status().'.');
        }

        return $this->check('healthy', $url);
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function browserWorkerCheck(): array
    {
        $url = config('services.talos.browser.worker_url');
        $token = config('services.talos.browser.worker_token');

        if (! is_string($url) || trim($url) === '') {
            return $this->check('failed', 'TALOS_BROWSER_WORKER_URL is not configured.');
        }

        if (! is_string($token) || trim($token) === '') {
            return $this->check('failed', 'TALOS_BROWSER_WORKER_TOKEN is not configured.');
        }

        $readinessUrl = rtrim($url, '/').'/ready';

        try {
            $response = Http::timeout(3)
                ->acceptJson()
                ->withHeader('X-Talos-Worker-Token', $token)
                ->get($readinessUrl);
        } catch (\Throwable $exception) {
            return $this->check('failed', 'browser worker readiness request failed: '.$exception->getMessage());
        }

        if (! $response->successful()) {
            return $this->check('failed', 'browser worker readiness returned HTTP '.$response->status().'.');
        }

        if ($response->json('data.status') !== 'ready' || $response->json('data.runtime') !== 'chromium') {
            return $this->check('failed', 'browser worker readiness returned an invalid payload.');
        }

        if ($response->json('data.protocols.hmi') !== TalosBrowserWorkerProtocol::HMI_RUNTIME) {
            return $this->check('failed', 'browser worker HMI protocol is incompatible.');
        }

        return $this->check('healthy', $readinessUrl);
    }

    /**
     * @return array{status: string, detail: string}
     */
    private function check(string $status, string $detail): array
    {
        return [
            'status' => $status,
            'detail' => $detail,
        ];
    }
}
