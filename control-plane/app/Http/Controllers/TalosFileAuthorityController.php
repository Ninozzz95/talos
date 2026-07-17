<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Talos\FileAuthority\TalosFileAuthorityException;
use App\Services\Talos\FileAuthority\TalosFileAuthorityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class TalosFileAuthorityController extends Controller
{
    public function __construct(private readonly TalosFileAuthorityService $authority) {}

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);
        $sessionId = $request->query('session_id');
        if ($sessionId !== null && (! is_string($sessionId) || strlen($sessionId) > 255)) {
            throw ValidationException::withMessages(['session_id' => ['Session identifier is invalid.']]);
        }

        return response()->json(['data' => $this->authority->listForUser($userId, $sessionId)->map->toApiArray()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);
        $validated = $request->validate([
            'scope' => ['required', 'string', Rule::in(TalosFileAuthorityService::SCOPES)],
            'label' => ['sometimes', 'nullable', 'string', 'max:255'],
            'permissions' => ['required', 'array', 'min:1', 'max:2'],
            'permissions.*' => ['required', 'string', 'distinct', Rule::in(TalosFileAuthorityService::PERMISSIONS)],
            'file_ids' => ['sometimes', 'array', 'max:64'],
            'file_ids.*' => ['required', 'string', 'uuid', 'distinct'],
            'session_id' => ['sometimes', 'nullable', 'string', 'uuid'],
            'warning_acknowledged' => ['sometimes', 'boolean'],
            'expires_at' => ['sometimes', 'nullable', 'date'],
        ]);

        try {
            $grant = $this->authority->create($userId, $validated);
        } catch (TalosFileAuthorityException $exception) {
            $this->throwValidation($exception);
        }

        return response()->json(['data' => $grant->toApiArray()], 201);
    }

    public function destroy(Request $request, string $grant): JsonResponse
    {
        $userId = $request->user()?->id;
        abort_unless($userId !== null, 401);
        try {
            $revoked = $this->authority->revoke($userId, $grant);
        } catch (TalosFileAuthorityException $exception) {
            if ($exception->status === 404) {
                abort(404);
            }
            $this->throwValidation($exception);
        }

        return response()->json(['data' => $revoked->toApiArray()]);
    }

    private function throwValidation(TalosFileAuthorityException $exception): never
    {
        throw ValidationException::withMessages([$exception->field => [$exception->getMessage()]]);
    }
}
