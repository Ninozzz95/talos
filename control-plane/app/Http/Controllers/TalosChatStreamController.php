<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Agent\TalosUserMessageRunBinder;
use App\Services\Talos\Chat\TalosStreamReconciler;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class TalosChatStreamController extends Controller
{
    public function __construct(
        private readonly TalosChatController $chat,
        private readonly TalosUserMessageRunBinder $messageRunBinder,
        private readonly TalosStreamReconciler $reconciler,
    ) {}

    public function __invoke(Request $request): Response
    {
        $input = $request->validate([
            'message' => ['required', 'string', 'max:20000'],
            'session_id' => ['required', 'string', 'max:255'],
            'user_message_id' => ['required', 'string', 'max:255'],
            'after_sequence' => ['sometimes', 'integer', 'min:0', 'max:2147483647'],
        ]);
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $session = TalosSession::query()
            ->where('user_id', $user->id)
            ->whereKey((string) $input['session_id'])
            ->first();
        if (! $session instanceof TalosSession) {
            return response()->json(['error' => 'Session was not found.'], 404);
        }

        $run = $this->messageRunBinder->alreadyBoundRun(
            $session,
            (string) $input['user_message_id'],
            (string) $input['message'],
        );
        if ($run !== null) {
            $snapshot = $this->reconciler->snapshot(
                (int) $user->id,
                $run,
                (int) ($input['after_sequence'] ?? 0),
            );

            return response()->stream(
                static function () use ($snapshot): void {
                    ignore_user_abort(true);
                    foreach ($snapshot['events'] as $event) {
                        if (! is_array($event) || connection_aborted()) {
                            continue;
                        }
                        self::writeEvent($event);
                    }
                },
                200,
                self::headers((string) $run->id, reconciled: true),
            );
        }
        if (! $this->messageRunBinder->matchesUnbound(
            $session,
            (string) $input['user_message_id'],
            (string) $input['message'],
        )) {
            throw ValidationException::withMessages([
                'user_message_id' => [
                    'Streaming requires the exact unbound user message owned by this chat session.',
                ],
            ]);
        }

        $request->attributes->set(TalosChatController::STREAM_ATTRIBUTE, true);

        /** @var Response $response */
        $response = app()->call([$this->chat, '__invoke'], ['request' => $request]);

        return $response;
    }

    /** @param array<string, mixed> $event */
    public static function writeEvent(array $event): void
    {
        $sequence = (int) ($event['sequence'] ?? 0);
        $kind = is_string($event['kind'] ?? null) ? $event['kind'] : 'unknown';
        $json = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        echo "id: {$sequence}\n";
        echo "event: {$kind}\n";
        echo "data: {$json}\n\n";

        if (PHP_SAPI !== 'cli') {
            if (ob_get_level() > 0) {
                @ob_flush();
            }
            flush();
        }
    }

    /** @return array<string, string> */
    public static function headers(string $runId, bool $reconciled = false): array
    {
        return [
            'Content-Type' => 'text/event-stream; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
            'X-Talos-Run-ID' => $runId,
            'X-Talos-Reconciled' => $reconciled ? '1' : '0',
        ];
    }
}
