<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosCalendarDraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosCalendarDraftController extends Controller
{
    public function index(): JsonResponse
    {
        $drafts = TalosCalendarDraft::query()
            ->latest('created_at')
            ->get()
            ->map(fn (TalosCalendarDraft $draft): array => $draft->toApiArray())
            ->values();

        return response()->json(['data' => $drafts]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'run_id' => ['sometimes', 'nullable', 'string', 'exists:talos_runs,id'],
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'attendees' => ['sometimes', 'nullable', 'array'],
            'attendees.*' => ['email'],
            'status' => ['sometimes', 'nullable', Rule::in(['draft'])],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        $draft = TalosCalendarDraft::query()->create([
            ...$validated,
            'timezone' => $validated['timezone'] ?? 'UTC',
            'status' => 'draft',
            'confirmation_required' => true,
        ]);
        assert($draft instanceof TalosCalendarDraft);

        return response()->json(['data' => $draft->toApiArray()], 201);
    }

    public function confirm(TalosCalendarDraft $calendarDraft): JsonResponse
    {
        $calendarDraft->update([
            'status' => 'confirmed',
            'confirmation_required' => false,
            'confirmed_at' => now(),
        ]);

        TalosAuditEvent::record('calendar.confirmed', 'calendar_draft', (string) $calendarDraft->id, [
            'title' => $calendarDraft->title,
            'starts_at' => $calendarDraft->starts_at?->toJSON(),
            'ends_at' => $calendarDraft->ends_at?->toJSON(),
            'attendees_count' => count($calendarDraft->attendees ?? []),
        ]);

        return response()->json(['data' => $calendarDraft->refresh()->toApiArray()]);
    }
}
