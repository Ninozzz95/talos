<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosTool;
use App\Services\Tools\TalosToolPlanningContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosToolController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tools = TalosTool::query()
            ->with('connector')
            ->when(
                ! $request->boolean('include_disabled'),
                fn ($query) => $query->availableForPlanning(),
            )
            ->orderBy('name')
            ->get()
            ->map(fn (TalosTool $tool): array => $tool->toApiArray())
            ->values();

        return response()->json(['data' => $tools]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $tool = TalosTool::query()->create($this->validated($request, true));

        return response()->json(['data' => $tool->load('connector')->toApiArray()], 201);
    }

    public function show(TalosTool $tool): JsonResponse
    {
        return response()->json(['data' => $tool->load('connector')->toApiArray()]);
    }

    public function update(Request $request, TalosTool $tool): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $tool->update($this->validated($request, false, $tool));

        return response()->json(['data' => $tool->refresh()->load('connector')->toApiArray()]);
    }

    public function destroy(Request $request, TalosTool $tool): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $tool->delete();

        return response()->json(null, 204);
    }

    public function planningContext(TalosToolPlanningContextService $planningContext): JsonResponse
    {
        return response()->json(['data' => $planningContext->context()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $create, ?TalosTool $tool = null): array
    {
        return $request->validate([
            'connector_id' => [$create ? 'required' : 'sometimes', 'string', 'exists:talos_connectors,id'],
            'name' => [
                $create ? 'required' : 'sometimes',
                'string',
                'max:120',
                'regex:/^[A-Z][A-Z0-9_]*$/',
                Rule::unique('talos_tools', 'name')->ignore($tool?->id),
            ],
            'display_name' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'input_schema' => [$create ? 'required' : 'sometimes', 'array'],
            'risk_level' => ['sometimes', 'string', Rule::in(['low', 'medium', 'high', 'critical'])],
            'capability' => ['sometimes', 'nullable', 'string', 'max:255'],
            'policy' => ['sometimes', 'nullable', 'array'],
            'is_enabled' => ['sometimes', 'boolean'],
            'planning_enabled' => ['sometimes', 'boolean'],
        ]);
    }

    private function assertRegistryWriteAllowed(Request $request): void
    {
        $expected = (string) config('services.talos.registry_write_token', '');
        $actual = (string) $request->header('X-Talos-Registry-Token', '');

        if ($expected === '' || ! hash_equals($expected, $actual)) {
            TalosAuditEvent::record('registry_write.denied', 'tool', null, [
                'route' => $request->path(),
                'method' => $request->method(),
                'expected_configured' => $expected !== '',
                'credential_present' => $actual !== '',
                'provided_token' => $actual,
            ]);

            abort(403, 'TALOS registry write token is required.');
        }
    }
}
