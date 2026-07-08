<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Services\Admin\TalosAdminGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosAdminAuditEventController extends Controller
{
    public function index(Request $request, TalosAdminGate $gate): JsonResponse
    {
        $gate->require($request, 'talos.audit.read');

        $validated = $request->validate([
            'event_type' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $events = TalosAuditEvent::query()
            ->when(
                filled($validated['event_type'] ?? null),
                fn ($query) => $query->where('event_type', $validated['event_type']),
            )
            ->latest('created_at')
            ->limit(200)
            ->get()
            ->map(fn (TalosAuditEvent $event): array => $event->toApiArray())
            ->values();

        return response()->json(['data' => $events]);
    }
}
