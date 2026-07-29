<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Services\Library\TalosLibrarySessionBinder;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

final class TalosLibraryChatReferenceObserver implements ShouldHandleEventsAfterCommit
{
    public function __construct(private readonly TalosLibrarySessionBinder $binder) {}

    public function saved(Model $reference): void
    {
        try {
            match (true) {
                $reference instanceof TalosMessage => $this->binder->syncMessage($reference),
                $reference instanceof TalosRun => $this->binder->syncRun($reference),
                default => null,
            };
        } catch (Throwable $exception) {
            $this->logFailure('TALOS_LIBRARY_CHAT_BINDING_FAILED', $reference, $exception);
        }
    }

    public function deleted(Model $reference): void
    {
        try {
            match (true) {
                $reference instanceof TalosMessage => $this->binder->removeMessage($reference),
                $reference instanceof TalosRun => $this->binder->removeRun($reference),
                default => null,
            };
        } catch (Throwable $exception) {
            $this->logFailure('TALOS_LIBRARY_CHAT_UNBIND_FAILED', $reference, $exception);
        }
    }

    private function logFailure(string $code, Model $reference, Throwable $exception): void
    {
        Log::error('TALOS Library chat binding failed after commit.', [
            'code' => $code,
            'reference_type' => $reference::class,
            'reference_id' => (string) $reference->getKey(),
            'exception' => $exception::class,
            'message' => $exception->getMessage(),
        ]);
    }
}
