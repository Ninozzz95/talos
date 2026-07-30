<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Policy\TalosCapabilityDecision;
use App\Services\Policy\TalosCapabilityPolicyException;
use App\Services\Policy\TalosCapabilityPolicyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosCapabilityPolicyController extends Controller
{
    public function __construct(private readonly TalosCapabilityPolicyService $policies) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->policies->snapshot($this->user($request))]);
    }

    public function update(Request $request, string $capability): JsonResponse
    {
        $validated = $request->validate([
            'expected_revision' => ['required', 'integer', 'min:0'],
            'decision' => ['required', 'string', Rule::in(TalosCapabilityDecision::values())],
            'session_id' => ['sometimes', 'nullable', 'string', 'uuid'],
            'session_ttl_seconds' => [
                'sometimes',
                'integer',
                'min:60',
                'max:'.TalosCapabilityPolicyService::SESSION_TTL_MAX_SECONDS,
            ],
            'risk_acknowledged' => ['sometimes', 'boolean:strict'],
        ]);

        try {
            $snapshot = $this->policies->update(
                $this->user($request),
                $capability,
                $validated['decision'],
                (int) $validated['expected_revision'],
                [
                    'session_id' => $validated['session_id'] ?? null,
                    'session_ttl_seconds' => $validated['session_ttl_seconds'] ?? null,
                    'risk_acknowledged' => $validated['risk_acknowledged'] ?? false,
                ],
            );
        } catch (TalosCapabilityPolicyException $exception) {
            return $this->exceptionResponse($exception);
        }

        return response()->json(['data' => $snapshot]);
    }

    public function masterEnable(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'expected_revision' => ['required', 'integer', 'min:0'],
            'warning_acknowledged' => ['required', 'accepted'],
        ]);

        try {
            $result = $this->policies->masterEnable(
                $this->user($request),
                (int) $validated['expected_revision'],
                (bool) $validated['warning_acknowledged'],
            );
        } catch (TalosCapabilityPolicyException $exception) {
            return $this->exceptionResponse($exception);
        }

        return response()->json([
            'data' => $result['policy'],
            'meta' => [
                'enabled_capabilities' => $result['enabled_capabilities'],
                'excluded_capabilities' => $result['excluded_capabilities'],
            ],
        ]);
    }

    public function revokeAll(Request $request): JsonResponse
    {
        $request->validate([
            'expected_revision' => ['sometimes', 'integer', 'min:0'],
        ]);

        return response()->json(['data' => $this->policies->revokeAll($this->user($request))]);
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    private function exceptionResponse(TalosCapabilityPolicyException $exception): JsonResponse
    {
        $payload = [
            'message' => $exception->getMessage(),
            'code' => $exception->errorCode,
            'errors' => $exception->field === null
                ? new \stdClass
                : [$exception->field => [$exception->getMessage()]],
            'details' => $exception->details,
        ];
        if ($exception->snapshot !== null) {
            $payload['data'] = $exception->snapshot;
        }

        return response()->json($payload, $exception->status);
    }
}
