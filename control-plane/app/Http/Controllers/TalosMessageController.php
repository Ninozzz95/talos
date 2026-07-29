<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosFile;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Services\Talos\Browser\TalosBrowserActivityProjector;
use App\Support\TalosMessageMetadata;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final class TalosMessageController extends Controller
{
    public function index(
        Request $request,
        TalosSession $session,
        TalosBrowserActivityProjector $browserActivityProjector,
    ): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        $messages = $session->messages()
            ->oldest('created_at')
            ->oldest('id')
            ->get();
        $browserActivityProjector->projectMissingForSession($messages, $session);

        return response()->json([
            'data' => $messages
                ->map(fn (TalosMessage $message): array => $this->messagePayload($message))
                ->values(),
        ]);
    }

    public function store(Request $request, TalosSession $session): JsonResponse
    {
        $this->abortUnlessOwnedByCurrentUser($request, $session);

        $sameSessionMessage = static fn () => Rule::exists('talos_messages', 'id')
            ->where(static fn ($query) => $query->where('session_id', $session->id));

        $validated = $request->validate([
            'role' => ['required', 'string', Rule::in(['user', 'assistant', 'system', 'tool'])],
            'content' => ['required', 'string', 'min:1', 'max:20000'],
            'model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'run_id' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
                Rule::exists('talos_runs', 'id')->where('session_id', $session->id),
            ],
            'metadata' => [
                'sometimes',
                'nullable',
                'array',
            ],
            'metadata.command_id' => ['sometimes', 'string', 'max:120'],
            'metadata.copy_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
            'metadata.edit_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
            'metadata.retry_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
            'metadata.resend_of_message_id' => ['sometimes', 'string', 'max:255', $sameSessionMessage()],
        ]);

        if ($request->has('metadata')) {
            try {
                $metadata = TalosMessageMetadata::fromClientInput($request->input('metadata'))->toStorageArray();
                $metadata = $this->withAuthorizedAttachments($request, $metadata);
            } catch (InvalidArgumentException $exception) {
                throw ValidationException::withMessages([
                    'metadata' => $exception->getMessage(),
                ]);
            }
            $validated['metadata'] = $metadata;
        }

        $message = $session->messages()->create($validated);

        return response()->json(['data' => $this->messagePayload($message)], 201);
    }

    /**
     * @param array<string, mixed> $metadata
     * @return array<string, mixed>
     */
    private function withAuthorizedAttachments(Request $request, array $metadata): array
    {
        $attachments = $metadata['attachments'] ?? null;
        if (! is_array($attachments) || $attachments === []) {
            return $metadata;
        }

        $fileIds = array_values(array_map(
            static fn (array $attachment): string => (string) $attachment['file_id'],
            $attachments,
        ));
        $files = TalosFile::query()
            ->where('user_id', $request->user()?->id)
            ->where('status', 'available')
            ->where('scan_status', 'clean')
            ->whereIn('id', $fileIds)
            ->get()
            ->keyBy('id');
        if ($files->count() !== count($fileIds)) {
            throw ValidationException::withMessages([
                'metadata.attachments' => 'Every attachment must be an owned, clean and available TALOS file.',
            ]);
        }

        $metadata['attachments'] = array_map(
            static function (string $fileId) use ($files): array {
                /** @var TalosFile $file */
                $file = $files->get($fileId);
                $mime = is_string($file->detected_mime) && trim($file->detected_mime) !== ''
                    ? trim($file->detected_mime)
                    : (string) $file->mime_type;

                return [
                    'file_id' => (string) $file->id,
                    'name' => (string) $file->original_name,
                    'mime_type' => $mime,
                    'size_bytes' => (int) $file->size_bytes,
                    'content_url' => '/api/talos/files/'.$file->id.'/content',
                ];
            },
            $fileIds,
        );

        return TalosMessageMetadata::fromStorage($metadata)->toStorageArray();
    }

    /**
     * @return array<string, mixed>
     */
    private function messagePayload(TalosMessage $message): array
    {
        return [
            ...$message->toArray(),
            'metadata' => TalosMessageMetadata::fromStorage($message->metadata)->toApiArray(),
        ];
    }

    private function abortUnlessOwnedByCurrentUser(Request $request, TalosSession $session): void
    {
        abort_unless($request->user()?->id === $session->user_id, 404);
    }
}
