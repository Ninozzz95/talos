<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosConnector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosConnectorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $includeTools = $request->boolean('include_tools');

        $connectors = TalosConnector::query()
            ->withCount('tools')
            ->when($includeTools, fn ($query) => $query->with('tools'))
            ->orderBy('display_name')
            ->get()
            ->map(fn (TalosConnector $connector): array => $connector->toApiArray($includeTools))
            ->values();

        return response()->json(['data' => $connectors]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $connector = TalosConnector::query()->create($this->validated($request, true));

        return response()->json(['data' => $connector->toApiArray()], 201);
    }

    public function show(TalosConnector $connector): JsonResponse
    {
        return response()->json(['data' => $connector->load('tools')->toApiArray(true)]);
    }

    public function update(Request $request, TalosConnector $connector): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $connector->update($this->validated($request, false, $connector));

        return response()->json(['data' => $connector->refresh()->toApiArray()]);
    }

    public function destroy(Request $request, TalosConnector $connector): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $connector->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $create, ?TalosConnector $connector = null): array
    {
        return $request->validate([
            'key' => [
                $create ? 'required' : 'sometimes',
                'string',
                'max:100',
                'regex:/^[a-z][a-z0-9_\\-]*$/',
                Rule::unique('talos_connectors', 'key')->ignore($connector?->id),
            ],
            'display_name' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'is_enabled' => ['sometimes', 'boolean'],
            'health_status' => ['sometimes', 'string', Rule::in(['unknown', 'healthy', 'degraded', 'offline'])],
            'capabilities' => ['sometimes', 'nullable', 'array'],
            'policy' => ['sometimes', 'nullable', 'array'],
            'health_payload' => ['sometimes', 'nullable', 'array'],
            'last_checked_at' => ['sometimes', 'nullable', 'date'],
        ]);
    }

    private function assertRegistryWriteAllowed(Request $request): void
    {
        $expected = (string) config('services.talos.registry_write_token', '');
        $actual = (string) $request->header('X-Talos-Registry-Token', '');

        if ($expected === '' || ! hash_equals($expected, $actual)) {
            TalosAuditEvent::record('registry_write.denied', 'connector', null, [
                'route' => $request->path(),
                'method' => $request->method(),
                'expected_configured' => $expected !== '',
                'credential_present' => $actual !== '',
            ]);

            abort(403, 'TALOS registry write token is required.');
        }
    }
}
