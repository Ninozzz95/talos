<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Policy\TalosCapabilityPolicyException;
use App\Services\Policy\TalosCapabilityPolicyMigrationService;
use Illuminate\Console\Command;
use Throwable;

final class MigrateTalosCapabilityPoliciesV1 extends Command
{
    protected $signature = 'talos:capability-policies:migrate-v1
        {--apply : Apply the exact previously reviewed dry-run plan}
        {--report-hash= : SHA-256 returned by the current dry-run report}';

    protected $description = 'Dry-run or apply the TALOS capability policy contract v1 migration';

    public function handle(TalosCapabilityPolicyMigrationService $migration): int
    {
        try {
            $report = (bool) $this->option('apply')
                ? $migration->apply((string) ($this->option('report-hash') ?? ''))
                : $migration->plan();
            $this->line(json_encode($report, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

            return $report['invalid'] === 0 ? self::SUCCESS : self::FAILURE;
        } catch (Throwable $exception) {
            report($exception);
            $this->line(json_encode([
                'mode' => (bool) $this->option('apply') ? 'apply' : 'dry_run',
                'code' => $exception instanceof TalosCapabilityPolicyException
                    ? $exception->errorCode
                    : 'TALOS_CAPABILITY_MIGRATION_FAILED',
                'message' => $exception->getMessage(),
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

            return self::FAILURE;
        }
    }
}
