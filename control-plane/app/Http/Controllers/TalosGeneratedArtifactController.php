<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosArtifactGeneration;
use App\Models\TalosRun;
use App\Models\User;
use App\Services\Artifacts\ArtifactWorkerException;
use App\Services\Artifacts\TalosArtifactGenerationException;
use App\Services\Artifacts\TalosDocumentGenerationService;
use App\Services\Artifacts\TalosSemanticDocumentV1;
use App\Services\Policy\TalosCapabilityPolicyException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosGeneratedArtifactController extends Controller
{
    public function store(
        Request $request,
        TalosRun $run,
        TalosDocumentGenerationService $generationService,
    ): JsonResponse {
        $user = $this->ownedUser($request, $run);

        try {
            $payload = $request->all();
            if (! is_array($payload)
                || array_diff(array_keys($payload), ['format', 'filename', 'document']) !== []
                || array_diff(['format', 'filename', 'document'], array_keys($payload)) !== []) {
                throw new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_REQUEST_INVALID',
                    'Artifact request contains missing or unknown fields.',
                    422,
                );
            }
            $format = $payload['format'] ?? null;
            $filename = $payload['filename'] ?? null;
            if (! is_string($format) || ! is_string($filename)) {
                throw new TalosArtifactGenerationException(
                    'TALOS_ARTIFACT_REQUEST_INVALID',
                    'Artifact format and filename are required.',
                    422,
                );
            }
            $document = TalosSemanticDocumentV1::fromRequestValue($payload['document'] ?? null);
            $result = $generationService->generate(
                $user,
                $run,
                $request->header('Idempotency-Key'),
                $format,
                $filename,
                $document,
            );

            return response()->json([
                'data' => [
                    'generation' => $result['generation']->toApiArray(),
                    'artifact' => $result['artifact']->toApiArray(),
                    'document' => $result['document']->toApiArray(includeProvenance: true),
                ],
                'meta' => ['replayed' => $result['replayed']],
            ], $result['replayed'] ? 200 : 201);
        } catch (TalosCapabilityPolicyException $exception) {
            return $this->policyFault($exception);
        } catch (TalosArtifactGenerationException|ArtifactWorkerException $exception) {
            return $this->generationFault($exception);
        }
    }

    public function show(
        Request $request,
        TalosRun $run,
        TalosArtifactGeneration $generation,
        TalosDocumentGenerationService $generationService,
    ): JsonResponse {
        $user = $this->ownedUser($request, $run);
        $generation = $generationService->show($user, $run, $generation);

        return response()->json([
            'data' => [
                'generation' => $generation->toApiArray(),
                'artifact' => $generation->artifact?->toApiArray(),
                'document' => $generation->document?->toApiArray(includeProvenance: true),
            ],
        ]);
    }

    public function cancel(
        Request $request,
        TalosRun $run,
        TalosArtifactGeneration $generation,
        TalosDocumentGenerationService $generationService,
    ): JsonResponse {
        $user = $this->ownedUser($request, $run);

        try {
            $generation = $generationService->cancel($user, $run, $generation);

            return response()->json(['data' => $generation->toApiArray()], 202);
        } catch (TalosCapabilityPolicyException $exception) {
            return $this->policyFault($exception);
        } catch (TalosArtifactGenerationException|ArtifactWorkerException $exception) {
            return $this->generationFault($exception);
        }
    }

    private function ownedUser(Request $request, TalosRun $run): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $run->user_id === (int) $user->id, 404);

        return $user;
    }

    private function policyFault(TalosCapabilityPolicyException $exception): JsonResponse
    {
        return response()->json([
            'code' => $exception->errorCode,
            'message' => $exception->getMessage(),
            'field' => $exception->field,
            'details' => $exception->details,
        ], $exception->status);
    }

    private function generationFault(
        TalosArtifactGenerationException|ArtifactWorkerException $exception,
    ): JsonResponse {
        return response()->json([
            'code' => $exception->errorCode,
            'message' => $exception->getMessage(),
            'field' => $exception instanceof TalosArtifactGenerationException ? $exception->field : null,
            'details' => $exception->details,
        ], $exception->httpStatus);
    }
}
