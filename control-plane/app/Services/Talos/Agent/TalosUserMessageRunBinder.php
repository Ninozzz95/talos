<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use Illuminate\Support\Facades\DB;

final class TalosUserMessageRunBinder
{
    public function alreadyBoundRun(
        TalosSession $session,
        string $messageId,
        string $content,
    ): ?TalosRun {
        $message = TalosMessage::query()
            ->whereKey($messageId)
            ->where('session_id', $session->id)
            ->where('role', 'user')
            ->whereNotNull('run_id')
            ->first();
        if (! $message instanceof TalosMessage
            || ! hash_equals((string) $message->content, $content)
            || ! is_string($message->run_id)) {
            return null;
        }

        return TalosRun::query()
            ->whereKey($message->run_id)
            ->where('session_id', $session->id)
            ->where('user_id', $session->user_id)
            ->first();
    }

    public function matchesUnbound(TalosSession $session, string $messageId, string $content): bool
    {
        $message = $this->unboundMessage($session, $messageId);

        return $message instanceof TalosMessage
            && hash_equals((string) $message->content, $content);
    }

    public function bind(TalosSession $session, TalosRun $run, string $messageId, string $content): bool
    {
        if (! hash_equals((string) $session->id, (string) $run->session_id)
            || ! hash_equals((string) $session->user_id, (string) $run->user_id)) {
            return false;
        }

        return DB::transaction(function () use ($session, $run, $messageId, $content): bool {
            $ownedRun = TalosRun::query()
                ->whereKey($run->id)
                ->where('session_id', $session->id)
                ->where('user_id', $session->user_id)
                ->lockForUpdate()
                ->first();
            if (! $ownedRun instanceof TalosRun) {
                return false;
            }

            $message = $this->unboundMessage($session, $messageId, true);
            if (! $message instanceof TalosMessage
                || ! hash_equals((string) $message->content, $content)) {
                return false;
            }

            return TalosMessage::query()
                ->whereKey($message->id)
                ->where('session_id', $session->id)
                ->where('role', 'user')
                ->whereNull('run_id')
                ->update(['run_id' => $ownedRun->id]) === 1;
        }, 3);
    }

    private function unboundMessage(
        TalosSession $session,
        string $messageId,
        bool $forUpdate = false,
    ): ?TalosMessage {
        $query = TalosMessage::query()
            ->whereKey($messageId)
            ->where('session_id', $session->id)
            ->where('role', 'user')
            ->whereNull('run_id');

        if ($forUpdate) {
            $query->lockForUpdate();
        }

        return $query->first();
    }
}
