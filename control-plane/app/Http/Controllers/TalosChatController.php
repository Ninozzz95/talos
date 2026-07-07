<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

final class TalosChatController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:20000'],
            'api_key' => ['sometimes', 'nullable', 'string', 'max:4096'],
        ]);

        $validatorUrl = rtrim((string) config(
            'services.avm_validator.url',
            env('AVM_VALIDATOR_URL', 'http://127.0.0.1:3000'),
        ), '/');

        try {
            $response = Http::timeout(120)
                ->acceptJson()
                ->post($validatorUrl . '/chat', [
                    'message' => (string) $validated['message'],
                    'api_key' => (string) ($validated['api_key'] ?? ''),
                ]);
        } catch (ConnectionException $exception) {
            return response()->json([
                'error' => 'Validator chat endpoint is unreachable.',
                'details' => $exception->getMessage(),
            ], 502);
        }

        if (! $response->successful()) {
            return response()->json([
                'error' => 'Validator chat endpoint returned an error.',
                'status' => $response->status(),
                'details' => $response->body(),
            ], 502);
        }

        $payload = $response->json();
        if (! is_array($payload)) {
            return response()->json([
                'error' => 'Validator chat endpoint returned invalid JSON.',
            ], 502);
        }

        return response()->json($payload);
    }
}
