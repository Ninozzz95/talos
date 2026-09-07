<?php

declare(strict_types=1);

namespace App\Observers;

use App\Services\Library\TalosLibraryProjector;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

final class TalosLibrarySourceObserver implements ShouldHandleEventsAfterCommit
{
    public function __construct(private readonly TalosLibraryProjector $projector) {}

    public function created(Model $source): void
    {
        $this->project($source);
    }

    public function updated(Model $source): void
    {
        $this->project($source);
    }

    public function deleted(Model $source): void
    {
        try {
            $this->projector->markUnavailable($source);
        } catch (Throwable $exception) {
            $this->logFailure('TALOS_LIBRARY_SOURCE_UNAVAILABLE_FAILED', $source, $exception);
        }
    }

    private function project(Model $source): void
    {
        try {
            $this->projector->project($source);
        } catch (Throwable $exception) {
            $this->logFailure('TALOS_LIBRARY_SOURCE_PROJECTION_FAILED', $source, $exception);
        }
    }

    private function logFailure(string $code, Model $source, Throwable $exception): void
    {
        Log::error('TALOS Library source projection failed after commit.', [
            'code' => $code,
            'source_type' => $source::class,
            'source_id' => (string) $source->getKey(),
            'exception' => $exception::class,
            'message' => $exception->getMessage(),
        ]);
    }
}
