<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\TraceReplay\TraceReplayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class TraceReplayController extends Controller
{
    public function __construct(private readonly TraceReplayService $traces)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'run_id' => ['required', 'string'],
            'events' => ['required', 'array', 'min:1'],
            'events.*.type' => ['required', 'string'],
            'events.*.node_id' => ['sometimes', 'string'],
            'events.*.action' => ['sometimes', 'string'],
        ]);

        if (! array_is_list($validated['events'])) {
            throw ValidationException::withMessages([
                'events' => 'Trace events must be an ordered list.',
            ]);
        }

        return response()->json($this->traces->build(
            (string) $validated['run_id'],
            $validated['events'],
        ));
    }
}
