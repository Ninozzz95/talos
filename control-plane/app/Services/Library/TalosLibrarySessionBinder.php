<?php

declare(strict_types=1);

namespace App\Services\Library;

use App\Models\TalosFile;
use App\Models\TalosLibraryItemSession;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class TalosLibrarySessionBinder
{
    public function __construct(private readonly TalosLibraryProjector $projector) {}

    public function syncMessage(TalosMessage $message): int
    {
        $session = $message->session()->first();
        if (! $session instanceof TalosSession || (int) $session->user_id < 1) {
            return 0;
        }

        return $this->syncFileBindings(
            userId: (int) $session->user_id,
            session: $session,
            messageId: (string) $message->id,
            bindingType: 'message',
            bindingId: (string) $message->id,
            fileIds: $this->fileIds($message->metadata),
            occurredAt: CarbonImmutable::instance($message->created_at ?? now()),
        );
    }

    public function removeMessage(TalosMessage $message): void
    {
        $this->removeBindings('message', (string) $message->id);
    }

    public function syncRun(TalosRun $run): int
    {
        $session = $run->session()->first();
        if (! $session instanceof TalosSession || (int) $run->user_id !== (int) $session->user_id) {
            return 0;
        }

        return $this->syncFileBindings(
            userId: (int) $run->user_id,
            session: $session,
            messageId: null,
            bindingType: 'run',
            bindingId: (string) $run->id,
            fileIds: $this->fileIds($run->metadata),
            occurredAt: CarbonImmutable::instance($run->created_at ?? now()),
        );
    }

    public function removeRun(TalosRun $run): void
    {
        $this->removeBindings('run', (string) $run->id);
    }

    /**
     * @param list<string> $fileIds
     */
    private function syncFileBindings(
        int $userId,
        TalosSession $session,
        ?string $messageId,
        string $bindingType,
        string $bindingId,
        array $fileIds,
        CarbonImmutable $occurredAt,
    ): int {
        return DB::transaction(function () use ($userId, $session, $messageId, $bindingType, $bindingId, $fileIds, $occurredAt): int {
            $this->removeBindings($bindingType, $bindingId);
            if ($fileIds === []) {
                return 0;
            }

            $files = TalosFile::query()
                ->where('user_id', $userId)
                ->where('status', 'available')
                ->where('scan_status', 'clean')
                ->whereIn('id', $fileIds)
                ->get()
                ->keyBy('id');

            $synced = 0;
            foreach ($fileIds as $fileId) {
                $file = $files->get($fileId);
                if (! $file instanceof TalosFile) {
                    continue;
                }
                $item = $this->projector->project($file);
                if ($item === null) {
                    continue;
                }

                TalosLibraryItemSession::query()->create([
                    'user_id' => $userId,
                    'library_item_id' => $item->id,
                    'session_id' => $session->id,
                    'message_id' => $messageId,
                    'relation' => 'attachment',
                    'binding_type' => $bindingType,
                    'binding_id' => $bindingId,
                    'occurred_at' => $occurredAt,
                    'metadata' => [],
                ]);
                $synced++;
            }

            return $synced;
        }, 3);
    }

    private function removeBindings(string $bindingType, string $bindingId): void
    {
        TalosLibraryItemSession::query()
            ->where('binding_type', $bindingType)
            ->where('binding_id', $bindingId)
            ->delete();
    }

    /** @return list<string> */
    private function fileIds(mixed $metadata): array
    {
        if (! is_array($metadata) || array_is_list($metadata)) {
            return [];
        }

        $ids = [];
        foreach (['attachments', 'used_attachments'] as $key) {
            $attachments = $metadata[$key] ?? null;
            if (! is_array($attachments) || ! array_is_list($attachments)) {
                continue;
            }
            foreach (array_slice($attachments, 0, 20) as $attachment) {
                $id = is_array($attachment) ? ($attachment['file_id'] ?? null) : null;
                if (is_string($id) && trim($id) !== '') {
                    $ids[trim($id)] = true;
                }
            }
        }

        return array_keys($ids);
    }
}
