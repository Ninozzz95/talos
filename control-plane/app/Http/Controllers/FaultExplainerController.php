<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\FaultExplaining\FaultExplainerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class FaultExplainerController extends Controller
{
    public function __construct(private readonly FaultExplainerService $faults)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'field' => ['required', 'string'],
            'expected' => ['required', 'string'],
            'received' => ['required', 'string'],
            'message' => ['required', 'string'],
        ]);

        return response()->json($this->faults->explain([
            'field' => (string) $validated['field'],
            'expected' => (string) $validated['expected'],
            'received' => (string) $validated['received'],
            'message' => (string) $validated['message'],
        ]));
    }
}
