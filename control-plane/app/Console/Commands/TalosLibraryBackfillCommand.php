<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Library\TalosLibraryBackfill;
use Illuminate\Console\Command;
use Throwable;

final class TalosLibraryBackfillCommand extends Command
{
    protected $signature = 'talos:library-backfill {--dry-run : Report projection changes without persisting them}';

    protected $description = 'Project eligible TALOS sources and chat references into the unified Library';

    public function handle(TalosLibraryBackfill $backfill): int
    {
        try {
            $report = $backfill->run((bool) $this->option('dry-run'));
            $this->line(json_encode($report, JSON_THROW_ON_ERROR));

            return $report['failed'] === 0 ? self::SUCCESS : self::FAILURE;
        } catch (Throwable $exception) {
            report($exception);
            $this->line(json_encode([
                'code' => 'TALOS_LIBRARY_BACKFILL_FAILED',
                'message' => 'The TALOS Library backfill could not complete.',
            ], JSON_THROW_ON_ERROR));

            return self::FAILURE;
        }
    }
}
