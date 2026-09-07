<?php

declare(strict_types=1);

namespace App\Services\Library;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosDocument;
use App\Models\TalosFile;
use App\Models\TalosLibraryItem;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Throwable;

final class TalosLibraryBackfill
{
    public function __construct(
        private readonly TalosLibraryProjector $projector,
        private readonly TalosLibrarySessionBinder $binder,
    ) {}

    /**
     * @return array{dry_run: bool, scanned: int, created: int, updated: int, skipped: int, unavailable: int, bindings_scanned: int, bindings_synced: int, failed: int}
     */
    public function run(bool $dryRun): array
    {
        $report = [
            'dry_run' => $dryRun,
            'scanned' => 0,
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'unavailable' => 0,
            'bindings_scanned' => 0,
            'bindings_synced' => 0,
            'failed' => 0,
        ];

        if ($dryRun) {
            DB::beginTransaction();
        }

        try {
            foreach ([TalosFile::class, TalosDocument::class, TalosRunArtifact::class, TalosBrowserArtifact::class] as $sourceClass) {
                $sourceClass::query()
                    ->orderBy('id')
                    ->chunkById(100, function ($sources) use (&$report): void {
                        foreach ($sources as $source) {
                            if ($source instanceof Model) {
                                $this->process($source, $report);
                            }
                        }
                    });
            }

            foreach ([TalosMessage::class, TalosRun::class] as $referenceClass) {
                $referenceClass::query()
                    ->orderBy('id')
                    ->chunkById(100, function ($references) use (&$report): void {
                        foreach ($references as $reference) {
                            if ($reference instanceof Model) {
                                $this->syncReference($reference, $report);
                            }
                        }
                    });
            }

            return $report;
        } finally {
            if ($dryRun && DB::transactionLevel() > 0) {
                DB::rollBack();
            }
        }
    }

    /**
     * @param array{dry_run: bool, scanned: int, created: int, updated: int, skipped: int, unavailable: int, bindings_scanned: int, bindings_synced: int, failed: int} $report
     */
    private function process(Model $source, array &$report): void
    {
        $report['scanned']++;

        try {
            $existing = $this->existingProjection($source);
            $before = $existing instanceof TalosLibraryItem ? $this->signature($existing) : null;
            $wasUnavailable = $existing?->unavailable_at !== null;
            $projected = $this->projector->project($source);

            if (! $projected instanceof TalosLibraryItem) {
                $nowUnavailable = $existing?->fresh()?->unavailable_at !== null;
                $report[$existing instanceof TalosLibraryItem && ! $wasUnavailable && $nowUnavailable
                    ? 'unavailable'
                    : 'skipped']++;

                return;
            }
            if (! $existing instanceof TalosLibraryItem) {
                $report['created']++;

                return;
            }

            $report[$before !== $this->signature($projected) ? 'updated' : 'skipped']++;
        } catch (Throwable) {
            $report['failed']++;
        }
    }

    /**
     * @param array{dry_run: bool, scanned: int, created: int, updated: int, skipped: int, unavailable: int, bindings_scanned: int, bindings_synced: int, failed: int} $report
     */
    private function syncReference(Model $reference, array &$report): void
    {
        $report['bindings_scanned']++;

        try {
            $report['bindings_synced'] += match (true) {
                $reference instanceof TalosMessage => $this->binder->syncMessage($reference),
                $reference instanceof TalosRun => $this->binder->syncRun($reference),
                default => 0,
            };
        } catch (Throwable) {
            $report['failed']++;
        }
    }

    private function existingProjection(Model $source): ?TalosLibraryItem
    {
        $identity = $this->sourceIdentity($source);
        if ($identity === null) {
            return null;
        }

        return TalosLibraryItem::query()
            ->where('user_id', $identity['user_id'])
            ->where('source_type', $identity['source_type'])
            ->where('source_id', $identity['source_id'])
            ->first();
    }

    /** @return array{user_id: int, source_type: string, source_id: string}|null */
    private function sourceIdentity(Model $source): ?array
    {
        $userId = match (true) {
            $source instanceof TalosFile, $source instanceof TalosDocument, $source instanceof TalosBrowserArtifact => (int) $source->user_id,
            $source instanceof TalosRunArtifact => (int) ($source->run()->value('user_id') ?? 0),
            default => 0,
        };
        $sourceType = match (true) {
            $source instanceof TalosFile => 'file',
            $source instanceof TalosDocument => 'document',
            $source instanceof TalosRunArtifact => 'run_artifact',
            $source instanceof TalosBrowserArtifact => 'browser_artifact',
            default => null,
        };

        return $userId > 0 && is_string($sourceType) && (string) $source->getKey() !== ''
            ? ['user_id' => $userId, 'source_type' => $sourceType, 'source_id' => (string) $source->getKey()]
            : null;
    }

    private function signature(TalosLibraryItem $item): string
    {
        $attributes = $item->fresh()?->getAttributes() ?? $item->getAttributes();
        unset($attributes['created_at'], $attributes['updated_at']);
        ksort($attributes);
        $originBindings = $item->sessionLinks()
            ->where('relation', 'origin')
            ->orderBy('id')
            ->get(['session_id', 'binding_type', 'binding_id', 'occurred_at'])
            ->map(static fn ($link): array => [
                'session_id' => (string) $link->session_id,
                'binding_type' => (string) $link->binding_type,
                'binding_id' => (string) $link->binding_id,
                'occurred_at' => $link->occurred_at?->toJSON(),
            ])
            ->all();

        return hash('sha256', json_encode([
            'attributes' => $attributes,
            'origin_bindings' => $originBindings,
        ], JSON_THROW_ON_ERROR));
    }
}
