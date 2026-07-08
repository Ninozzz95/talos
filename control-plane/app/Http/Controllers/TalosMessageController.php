<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosMessageController extends Controller
{
    public function index(TalosSession $session): JsonResponse
    {
        $messages = $session->messages()
            ->oldest('created_at')
            ->oldest('id')
            ->get();

        return response()->json(['data' => $messages]);
    }

    public function store(Request $request, TalosSession $session): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['required', 'string', Rule::in(['user', 'assistant', 'system', 'tool'])],
            'content' => ['required', 'string', 'min:1', 'max:20000'],
            'model_profile_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'run_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $message = $session->messages()->create($validated);

        return response()->json(['data' => $message], 201);
    }
}
