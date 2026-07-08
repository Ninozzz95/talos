<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosRunEvent;
use App\Services\Runs\RunEventNormalizer;
use App\Services\TraceReplay\TraceReplayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class TalosRunController extends Controller
{
    public function index(): JsonResponse
    {
        $runs = TalosRun::query()
            ->latest('created_at')
            ->get()
            ->map(fn (TalosRun $run): array => $run->toApiArray())
            ->values();

        return response()->json(['data' => $runs]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->runValidationRules(required: true));

        $run = TalosRun::query()->create([
            ...$validated,
            'mode' => $validated['mode'] ?? 'avm_on',
            'status' => $validated['status'] ?? 'queued',
        ]);

        return response()->json(['data' => $run->toApiArray()], 201);
    }

    public function show(TalosRun $run): JsonResponse
    {
        return response()->json(['data' => $run->toApiArray()]);
    }

    public function update(Request $request, TalosRun $run): JsonResponse
    {
        $validated = $request->validate($this->runValidationRules(required: false));

        $run->update($validated);

        return response()->json(['data' => $run->refresh()->toApiArray()]);
    }

    public function events(TalosRun $run): JsonResponse
    {
        $events = $run->events()
            ->oldest('sequence')
            ->get()
            ->map(fn (TalosRunEvent $event): array => $event->toApiArray())
            ->values();

        return response()->json(['data' => $events]);
    }

    public function replay(TalosRun $run, TraceReplayService $traces): JsonResponse
    {
        $events = $run->events()
            ->oldest('sequence')
            ->get()
            ->map(fn (TalosRunEvent $event): array => [
                'id' => $event->id,
                'sequence' => $event->sequence,
                'type' => $event->event_type,
                'event_type' => $event->event_type,
                'node_id' => $event->node_id,
                'severity' => $event->severity,
                'payload' => $event->payload ?? [],
                'occurred_at' => $event->occurred_at?->toJSON(),
                'created_at' => $event->created_at?->toJSON(),
            ])
            ->values()
            ->all();

        return response()->json($traces->build($run->id, $events));
    }

    public function artifacts(TalosRun $run): JsonResponse
    {
        $artifacts = $run->artifacts()
            ->latest('created_at')
            ->get()
            ->map(fn (TalosRunArtifact $artifact): array => $artifact->toApiArray(includeRun: true))
            ->values();

        return response()->json(['data' => $artifacts]);
    }

    public function storeEvents(Request $request, TalosRun $run, RunEventNormalizer $normalizer): JsonResponse
    {
        $validated = $request->validate([
            'events' => [
                'required',
                'array',
                'min:1',
                function (string $attribute, mixed $value, callable $fail): void {
                    if (! is_array($value) || ! array_is_list($value)) {
                        $fail('The events field must be a JSON list.');
                    }
                },
            ],
            'events.*.event_type' => ['sometimes', 'nullable', 'string', 'max:255'],
            'events.*.type' => ['sometimes', 'nullable', 'string', 'max:255'],
            'events.*.node_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'events.*.severity' => ['sometimes', 'nullable', 'string', 'max:64'],
            'events.*.payload' => ['sometimes', 'nullable', 'array'],
        ]);

        /** @var array<int, array<string, mixed>> $eventPayloads */
        $eventPayloads = $validated['events'];

        $events = DB::transaction(function () use ($run, $eventPayloads, $normalizer) {
            $nextSequence = ((int) $run->events()->max('sequence')) + 1;
            $created = [];

            foreach ($eventPayloads as $eventPayload) {
                $created[] = $run->events()->create([
                    ...$normalizer->normalize($eventPayload),
                    'sequence' => $nextSequence,
                    'occurred_at' => now(),
                ]);
                $nextSequence++;
            }

            return collect($created);
        });

        return response()->json([
            'data' => $events
                ->map(fn (TalosRunEvent $event): array => $event->toApiArray())
                ->values(),
        ], 201);
    }

    public function storeArtifact(Request $request, TalosRun $run): JsonResponse
    {
        $validated = $request->validate([
            'artifact_type' => ['required', 'string', 'min:1', 'max:255'],
            'uri' => ['required', 'string', 'min:1', 'max:2048'],
            'mime_type' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $artifact = $run->artifacts()->create($validated);
        assert($artifact instanceof TalosRunArtifact);

        return response()->json(['data' => $artifact->toApiArray()], 201);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function runValidationRules(bool $required): array
    {
        $presence = $required ? 'required' : 'sometimes';

        return [
            'session_id' => ['sometimes', 'nullable', 'string', 'exists:talos_sessions,id'],
            'model_profile_id' => ['sometimes', 'nullable', 'string', 'exists:talos_model_profiles,id'],
            'context_set_id' => ['sometimes', 'nullable', 'string', 'exists:talos_context_sets,id'],
            'mode' => [$presence, 'string', Rule::in(['avm_on', 'avm_off', 'verified_execution', 'answer_only'])],
            'status' => [$presence, 'string', Rule::in(['queued', 'running', 'succeeded', 'failed', 'cancelled'])],
            'prompt_hash' => ['sometimes', 'nullable', 'string', 'size:64'],
            'prompt' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'provider' => ['sometimes', 'nullable', 'string', 'max:255'],
            'model' => ['sometimes', 'nullable', 'string', 'max:255'],
            'metadata' => ['sometimes', 'nullable', 'array'],
            'started_at' => ['sometimes', 'nullable', 'date'],
            'completed_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}
