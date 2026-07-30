<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use App\Models\TalosArtifactGeneration;
use App\Models\TalosRun;
use App\Models\User;
use App\Services\Policy\TalosCapabilityPolicyService;
use App\Services\Runs\TalosRunEventRecorder;
use Illuminate\Support\Facades\DB;
use Throwable;

final class TalosDocumentGenerationService
{
    /** @var array<string, string> */
    private const EXTENSION_BY_FORMAT = [
        'docx' => 'docx',
        'pdf' => 'pdf',
        'pptx' => 'pptx',
        'xlsx' => 'xlsx',
        'thumbnail' => 'png',
    ];

    public function __construct(
        private readonly TalosCapabilityPolicyService $policy,
        private readonly ArtifactWorkerClient $worker,
        private readonly TalosArtifactPromotionService $promotion,
        private readonly TalosRunEventRecorder $eventRecorder,
    ) {}

    /**
     * @return array{generation: TalosArtifactGeneration, artifact: mixed, document: mixed, replayed: bool}
     */
    public function generate(
        User $user,
        TalosRun $run,
        ?string $rawIdempotencyKey,
        string $format,
        string $filename,
        TalosSemanticDocumentV1 $document,
    ): array {
        $this->authorize($user, $run);
        $requestId = $this->normalizeIdempotencyKey($rawIdempotencyKey);
        $this->assertFormatAndFilename($format, $filename);
        $requestHash = $this->requestHash($format, $filename, $document);

        $existing = DB::transaction(function () use (
            $document,
            $filename,
            $format,
            $requestHash,
            $requestId,
            $run,
            $user,
        ): array|TalosArtifactGenerationException|null {
            $generation = TalosArtifactGeneration::query()
                ->whereKey($requestId)
                ->lockForUpdate()
                ->first();
            if ($generation instanceof TalosArtifactGeneration) {
                return $this->reconcileExisting($generation, $user, $run, $requestHash);
            }

            $generation = TalosArtifactGeneration::query()->create([
                'id' => $requestId,
                'user_id' => $user->id,
                'run_id' => $run->id,
                'request_hash' => $requestHash,
                'format' => $format,
                'filename' => $filename,
                'status' => TalosArtifactGeneration::STATUS_RUNNING,
                'started_at' => now(),
            ]);
            $this->eventRecorder->record(
                ['run_id' => (string) $run->id, 'user_id' => (int) $user->id],
                [
                    'event_type' => 'artifact.generation.requested',
                    'payload' => [
                        'generation_id' => $requestId,
                        'format' => $format,
                        'filename' => $filename,
                        'document_hash' => hash('sha256', $document->toCanonicalJson()),
                    ],
                ],
            );

            return null;
        }, 3);
        if ($existing instanceof TalosArtifactGenerationException) {
            throw $existing;
        }
        if (is_array($existing)) {
            return $existing;
        }

        $generation = TalosArtifactGeneration::query()->findOrFail($requestId);
        try {
            $workerResult = $this->worker->generate(
                $requestId,
                $format,
                $filename,
                $document->toArray(),
            );
            $promoted = $this->promotion->promote($user, $run, $generation, $document, $workerResult);

            return [
                'generation' => $generation->refresh(),
                'artifact' => $promoted['artifact'],
                'document' => $promoted['document'],
                'replayed' => false,
            ];
        } catch (ArtifactWorkerException $exception) {
            $this->recordFailure(
                $generation,
                $run,
                $user,
                $exception->ambiguous
                    ? TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED
                    : TalosArtifactGeneration::STATUS_FAILED,
                $exception->errorCode,
            );

            throw $exception;
        } catch (TalosArtifactGenerationException $exception) {
            $this->recordFailure(
                $generation,
                $run,
                $user,
                TalosArtifactGeneration::STATUS_FAILED,
                $exception->errorCode,
            );

            throw $exception;
        }
    }

    public function show(
        User $user,
        TalosRun $run,
        TalosArtifactGeneration $generation,
    ): TalosArtifactGeneration {
        $this->assertOwned($user, $run, $generation);

        return $generation->load(['artifact', 'document']);
    }

    public function cancel(
        User $user,
        TalosRun $run,
        TalosArtifactGeneration $generation,
    ): TalosArtifactGeneration {
        $this->assertOwned($user, $run, $generation);
        $this->policy->authorize($user, 'artifacts.generate', $this->policyContext($run));
        if (! in_array($generation->status, [
            TalosArtifactGeneration::STATUS_RUNNING,
            TalosArtifactGeneration::STATUS_CANCELLATION_REQUESTED,
        ], true)) {
            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_REQUEST_NOT_ACTIVE',
                'Artifact generation is not active.',
                409,
            );
        }

        try {
            $this->worker->cancel((string) $generation->id);
        } catch (ArtifactWorkerException $exception) {
            if ($exception->ambiguous || $exception->errorCode === 'ARTIFACT_REQUEST_NOT_ACTIVE') {
                $updated = TalosArtifactGeneration::query()
                    ->whereKey($generation->id)
                    ->whereIn('status', [
                        TalosArtifactGeneration::STATUS_RUNNING,
                        TalosArtifactGeneration::STATUS_CANCELLATION_REQUESTED,
                    ])
                    ->update([
                        'status' => TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED,
                        'failure_code' => $exception->errorCode,
                    ]);
                $generation = $generation->refresh();
                if ($updated !== 1
                    && $generation->status !== TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED) {
                    throw new TalosArtifactGenerationException(
                        'TALOS_ARTIFACT_REQUEST_NOT_ACTIVE',
                        'Artifact generation is no longer active.',
                        409,
                        details: ['status' => (string) $generation->status],
                    );
                }

                throw new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_RECOVERY_REQUIRED',
                    'Artifact cancellation requires state reconciliation.',
                    409,
                    details: ['worker_code' => $exception->errorCode],
                );
            }

            throw $exception;
        }

        $updated = TalosArtifactGeneration::query()
            ->whereKey($generation->id)
            ->where('status', TalosArtifactGeneration::STATUS_RUNNING)
            ->update([
                'status' => TalosArtifactGeneration::STATUS_CANCELLATION_REQUESTED,
                'failure_code' => null,
            ]);
        $generation = $generation->refresh();
        if ($updated === 1
            || $generation->status === TalosArtifactGeneration::STATUS_CANCELLATION_REQUESTED) {
            return $generation;
        }

        throw new TalosArtifactGenerationException(
            'TALOS_ARTIFACT_REQUEST_NOT_ACTIVE',
            'Artifact generation is no longer active.',
            409,
            details: ['status' => (string) $generation->status],
        );
    }

    private function authorize(User $user, TalosRun $run): void
    {
        $context = $this->policyContext($run);
        $this->policy->authorize($user, 'artifacts.generate', $context);
        $this->policy->authorize($user, 'files.write', $context);
    }

    /** @return array<string, mixed> */
    private function policyContext(TalosRun $run): array
    {
        return is_string($run->session_id) && $run->session_id !== ''
            ? ['session_id' => $run->session_id]
            : [];
    }

    /**
     * @return array{generation: TalosArtifactGeneration, artifact: mixed, document: mixed, replayed: bool}|TalosArtifactGenerationException
     */
    private function reconcileExisting(
        TalosArtifactGeneration $generation,
        User $user,
        TalosRun $run,
        string $requestHash,
    ): array|TalosArtifactGenerationException {
        if ((int) $generation->user_id !== (int) $user->id
            || ! hash_equals((string) $generation->run_id, (string) $run->id)
            || ! hash_equals((string) $generation->request_hash, $requestHash)) {
            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_IDEMPOTENCY_KEY_REUSED',
                'Idempotency-Key was already used for another artifact request.',
                422,
                'Idempotency-Key',
            );
        }

        if ($generation->status === TalosArtifactGeneration::STATUS_SUCCEEDED) {
            $generation->load(['artifact', 'document']);
            if ($generation->artifact === null || $generation->document === null) {
                $generation->forceFill([
                    'status' => TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED,
                    'failure_code' => 'TALOS_ARTIFACT_SETTLED_STATE_INCOMPLETE',
                ])->save();
                return new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_RECOVERY_REQUIRED',
                    'Artifact generation state requires reconciliation.',
                    409,
                );
            }

            return [
                'generation' => $generation,
                'artifact' => $generation->artifact,
                'document' => $generation->document,
                'replayed' => true,
            ];
        }

        if ($generation->status === TalosArtifactGeneration::STATUS_RUNNING) {
            $staleAfter = config('services.talos.artifact.stale_after_seconds', 180);
            $staleAfter = is_int($staleAfter) && $staleAfter > 0 ? $staleAfter : 180;
            if ($generation->started_at !== null && $generation->started_at->lte(now()->subSeconds($staleAfter))) {
                $generation->forceFill([
                    'status' => TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED,
                    'failure_code' => 'TALOS_ARTIFACT_STALE_RUNNING',
                ])->save();
                return new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_RECOVERY_REQUIRED',
                    'Artifact generation state requires reconciliation.',
                    409,
                );
            }

            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_REQUEST_ACTIVE',
                'Artifact generation is already active.',
                409,
            );
        }

        throw new TalosArtifactGenerationException(
            $generation->status === TalosArtifactGeneration::STATUS_RECOVERY_REQUIRED
                ? 'TALOS_ARTIFACT_RECOVERY_REQUIRED'
                : 'TALOS_ARTIFACT_REQUEST_SETTLED',
            'Artifact generation cannot be repeated with this idempotency key.',
            409,
            details: [
                'status' => (string) $generation->status,
                'failure_code' => $generation->failure_code,
            ],
        );
    }

    private function recordFailure(
        TalosArtifactGeneration $generation,
        TalosRun $run,
        User $user,
        string $status,
        string $errorCode,
    ): void {
        DB::transaction(function () use ($errorCode, $generation, $run, $status, $user): void {
            $generation->forceFill([
                'status' => $status,
                'failure_code' => $errorCode,
                'completed_at' => $status === TalosArtifactGeneration::STATUS_FAILED ? now() : null,
            ])->save();
            $this->eventRecorder->record(
                ['run_id' => (string) $run->id, 'user_id' => (int) $user->id],
                [
                    'event_type' => 'artifact.generation.failed',
                    'severity' => 'error',
                    'payload' => [
                        'generation_id' => (string) $generation->id,
                        'status' => $status,
                        'code' => $errorCode,
                    ],
                ],
            );
        }, 3);
    }

    private function normalizeIdempotencyKey(?string $value): string
    {
        if (! is_string($value)) {
            throw $this->invalidIdempotencyKey();
        }
        $value = trim($value);
        if (str_starts_with($value, '"') && str_ends_with($value, '"') && strlen($value) > 2) {
            $value = substr($value, 1, -1);
        }
        $value = strtolower($value);
        if (preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $value) !== 1) {
            throw $this->invalidIdempotencyKey();
        }

        return $value;
    }

    private function invalidIdempotencyKey(): TalosArtifactGenerationException
    {
        return new TalosArtifactGenerationException(
            'TALOS_ARTIFACT_IDEMPOTENCY_KEY_INVALID',
            'Idempotency-Key must be a UUID.',
            422,
            'Idempotency-Key',
        );
    }

    private function assertFormatAndFilename(string $format, string $filename): void
    {
        $extension = self::EXTENSION_BY_FORMAT[$format] ?? null;
        $basename = basename(str_replace('\\', '/', $filename));
        if (! is_string($extension)
            || $filename === ''
            || strlen($filename) > 255
            || $basename !== $filename
            || in_array($filename, ['.', '..'], true)
            || preg_match('/[\x00-\x1f\x7f]/', $filename) === 1
            || strtolower((string) pathinfo($filename, PATHINFO_EXTENSION)) !== $extension) {
            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_REQUEST_INVALID',
                'Artifact format and filename do not match the supported contract.',
                422,
                'filename',
            );
        }
    }

    private function requestHash(
        string $format,
        string $filename,
        TalosSemanticDocumentV1 $document,
    ): string {
        try {
            $json = json_encode([
                'format' => $format,
                'filename' => $filename,
                'document' => $document->toArray(),
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        } catch (Throwable $exception) {
            throw new TalosArtifactGenerationException(
                'TALOS_ARTIFACT_REQUEST_INVALID',
                'Artifact request cannot be canonicalized.',
                422,
                previous: $exception,
            );
        }

        return hash('sha256', $json);
    }

    private function assertOwned(
        User $user,
        TalosRun $run,
        TalosArtifactGeneration $generation,
    ): void {
        if ((int) $run->user_id !== (int) $user->id
            || (int) $generation->user_id !== (int) $user->id
            || ! hash_equals((string) $run->id, (string) $generation->run_id)) {
            abort(404);
        }
    }
}
