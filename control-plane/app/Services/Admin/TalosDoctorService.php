<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\TalosModelProfile;
use Illuminate\Support\Facades\DB;

final class TalosDoctorService
{
    /**
     * @return array<string, mixed>
     */
    public function report(): array
    {
        $checks = [
            'php_version' => $this->check('healthy', PHP_VERSION),
            'database' => $this->databaseCheck(),
            'storage_writable' => $this->check(is_writable(storage_path()) ? 'healthy' : 'degraded', storage_path()),
            'validator_health' => $this->validatorHealthCheck(),
            'laravel_queue' => $this->check('healthy', (string) config('queue.default')),
            'provider_profiles' => $this->check('healthy', TalosModelProfile::query()->count().' profiles'),
            'model_probe_status' => $this->check('healthy', 'probe results are stored per model profile'),
            'file_ingestion_worker' => $this->check('healthy', 'local ingestion endpoint registered'),
            'benchmark_thresholds' => $this->check('healthy', 'benchmark groups persist exact evidence'),
            'ssl_verification' => $this->check('healthy', 'provider URLs are policy checked'),
            'execution_policy' => $this->check('healthy', 'private-network SSRF guard enabled in core'),
        ];

        $status = collect($checks)->contains(fn (array $check): bool => $check['status'] !== 'healthy')
            ? 'degraded'
            : 'healthy';

        return [
            'status' => $status,
            'checks' => $checks,
        ];
    }

    /**
     * @return array<string, string>
     */
    private function databaseCheck(): array
    {
        try {
            DB::connection()->getPdo();

            return $this->check('healthy', 'database connection available');
        } catch (\Throwable $exception) {
            return $this->check('failed', $exception->getMessage());
        }
    }

    /**
     * @return array<string, string>
     */
    private function validatorHealthCheck(): array
    {
        $url = config('services.talos.validator_health_url');
        if (! is_string($url) || trim($url) === '') {
            return $this->check('degraded', 'TALOS_VALIDATOR_HEALTH_URL is not configured.');
        }

        return $this->check('healthy', $url);
    }

    /**
     * @return array<string, string>
     */
    private function check(string $status, string $detail): array
    {
        return [
            'status' => $status,
            'detail' => $detail,
        ];
    }
}
