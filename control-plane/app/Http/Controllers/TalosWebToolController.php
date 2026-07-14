<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Talos\Web\TalosWebFetchException;
use App\Services\Talos\Web\TalosWebFetchService;
use App\Services\Talos\Web\WebSearchProviderFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

final class TalosWebToolController extends Controller
{
    public function search(Request $request, WebSearchProviderFactory $providers): JsonResponse
    {
        $payload = $this->validated($request, [
            'query' => ['required', 'string', 'max:512'],
            'options' => ['sometimes', 'array:language,pageno,time_range,safesearch'],
            'options.language' => ['sometimes', 'string', 'max:32', 'regex:/\A[A-Za-z0-9_-]+\z/'],
            'options.pageno' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'options.time_range' => ['sometimes', 'nullable', 'in:day,month,year'],
            'options.safesearch' => ['sometimes', 'integer', 'min:0', 'max:2'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        $ownerRef = $this->ownerRef($request);
        if ($ownerRef === null) {
            return $this->authenticationRequired();
        }

        try {
            $response = $providers->forOwner($ownerRef)->search(
                (string) $payload['query'],
                is_array($payload['options'] ?? null) ? $payload['options'] : [],
            );
        } catch (Throwable) {
            return response()->json([
                'code' => 'TALOS_WEB_SEARCH_FAILED',
                'message' => 'Web search could not complete the request.',
                'details' => [],
            ], 502);
        }

        return response()->json(['data' => $response->toArray()]);
    }

    public function fetch(Request $request, TalosWebFetchService $fetcher): JsonResponse
    {
        $payload = $this->validated($request, [
            'url' => ['required', 'string', 'max:2048'],
            'timeout_ms' => ['sometimes', 'integer', 'min:1', 'max:15000'],
            'max_bytes' => ['sometimes', 'integer', 'min:1', 'max:10000000'],
            'max_redirects' => ['sometimes', 'integer', 'min:0', 'max:10'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        if ($this->ownerRef($request) === null) {
            return $this->authenticationRequired();
        }

        try {
            $result = $fetcher->fetch(
                (string) $payload['url'],
                (int) ($payload['timeout_ms'] ?? 10000),
                (int) ($payload['max_bytes'] ?? 1000000),
                (int) ($payload['max_redirects'] ?? 3),
            );
        } catch (TalosWebFetchException $exception) {
            return response()->json([
                'code' => $exception->errorCode,
                'message' => $exception->getMessage(),
                'details' => [],
            ], $this->fetchErrorStatus($exception));
        } catch (Throwable) {
            return response()->json([
                'code' => 'TALOS_WEB_FETCH_UNAVAILABLE',
                'message' => 'Web fetch endpoint is unavailable.',
                'details' => [],
            ], 502);
        }

        return response()->json(['data' => $result->toArray()]);
    }

    /** @param array<string, mixed> $rules @return array<string, mixed>|JsonResponse */
    private function validated(Request $request, array $rules): array|JsonResponse
    {
        $validator = Validator::make($request->all(), $rules);
        if ($validator->fails()) {
            return response()->json([
                'code' => 'TALOS_WEB_VALIDATION_FAILED',
                'message' => 'Web tool request validation failed.',
                'details' => $validator->errors()->toArray(),
            ], 422);
        }

        return $validator->validated();
    }

    private function ownerRef(Request $request): ?string
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return null;
        }
        $identifier = (string) $user->getAuthIdentifier();

        return $identifier === '' ? null : 'talos-user:'.$identifier;
    }

    private function authenticationRequired(): JsonResponse
    {
        return response()->json([
            'code' => 'TALOS_AUTH_REQUIRED',
            'message' => 'Authentication required.',
        ], 401);
    }

    private function fetchErrorStatus(TalosWebFetchException $exception): int
    {
        if ($exception->errorCode === 'TALOS_WEB_FETCH_TIMEOUT') {
            return 504;
        }

        return in_array($exception->errorCode, [
            'TALOS_WEB_FETCH_BOUNDS',
            'TALOS_WEB_FETCH_URL_BLOCKED',
            'TALOS_WEB_FETCH_REDIRECT_INVALID',
            'TALOS_WEB_FETCH_REDIRECT_LIMIT',
            'TALOS_WEB_FETCH_CONTENT_INVALID',
            'TALOS_WEB_FETCH_CONTENT_TOO_LARGE',
            'TALOS_WEB_FETCH_CONTENT_TYPE',
        ], true) ? 422 : 502;
    }
}
