<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosTool;
use App\Services\Talos\Agent\TalosProceduralToolRegistry;
use App\Services\Tools\TalosToolContractMapper;
use App\Services\Tools\TalosToolPlanningContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Kadmos\Alignment\Contract\AlignmentContractException;
use Kadmos\Alignment\Contract\ToolDefinitionV1;

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

        if ($request->boolean('include_bundled')) {
            foreach (TalosProceduralToolRegistry::contracts() as $toolName => $contract) {
                $tools->push(TalosToolContractMapper::bundledApiEnvelope($toolName, $contract));
            }
            $tools = $tools->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values();
        }

        return response()->json(['data' => $tools]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $payload = $this->validated($request, true);
        $id = (string) Str::orderedUuid();
        $contract = $this->contractForWrite($payload, $id, 1);
        $tool = TalosTool::query()->create(TalosToolContractMapper::persistenceAttributes($contract, $payload));

        return response()->json(['data' => $tool->load('connector')->toApiArray()], 201);
    }

    public function show(TalosTool $tool): JsonResponse
    {
        return response()->json(['data' => $tool->load('connector')->toApiArray()]);
    }

    public function update(Request $request, TalosTool $tool): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $payload = [
            ...$this->writePayloadFromModel($tool),
            ...$this->validated($request, false, $tool),
        ];
        $contract = $this->contractForWrite($payload, (string) $tool->id, ((int) $tool->contract_revision) + 1);
        $tool->update(TalosToolContractMapper::persistenceAttributes($contract, $payload));

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
            'output_schema' => ['sometimes', 'nullable', 'array'],
            'risk_level' => ['sometimes', 'string', Rule::in(['low', 'medium', 'high', 'critical'])],
            'capability' => ['sometimes', 'nullable', 'string', 'max:255'],
            'capabilities' => ['sometimes', 'array', 'min:1', 'max:64'],
            'capabilities.*' => ['string', 'min:1', 'max:255', 'distinct'],
            'actions' => ['sometimes', 'array', 'min:1', 'max:3'],
            'actions.*' => ['string', Rule::in(['read', 'write', 'outbound']), 'distinct'],
            'confirmation' => ['sometimes', 'string', Rule::in(['policy', 'always'])],
            'effects' => ['sometimes', 'array:mutates_state,parallel_safe,requires_approval,produces_evidence'],
            'effects.mutates_state' => ['required_with:effects', 'boolean'],
            'effects.parallel_safe' => ['required_with:effects', 'boolean'],
            'effects.requires_approval' => ['required_with:effects', 'boolean'],
            'effects.produces_evidence' => ['required_with:effects', 'boolean'],
            'execution' => ['sometimes', 'array:locations,implementation_key'],
            'execution.locations' => ['required_with:execution', 'array', 'min:1', 'max:3'],
            'execution.locations.*' => ['string', Rule::in(['trusted_node', 'remote_provider']), 'distinct'],
            'execution.implementation_key' => ['required_with:execution', 'string', 'min:1', 'max:200'],
            'schema_version' => ['sometimes', 'integer', Rule::in([ToolDefinitionV1::SCHEMA_VERSION])],
            'lifecycle_integrity_sha256' => ['sometimes', 'nullable', 'string', 'regex:/^[a-f0-9]{64}$/'],
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
            ]);

            abort(403, 'TALOS registry write token is required.');
        }
    }

    /** @param array<string, mixed> $payload */
    private function contractForWrite(array $payload, string $id, int $revision): ToolDefinitionV1
    {
        $name = (string) ($payload['name'] ?? '');
        foreach (TalosProceduralToolRegistry::contracts() as $contract) {
            if (($contract->toArray()['name'] ?? null) === $name) {
                throw ValidationException::withMessages([
                    'name' => ['The tool name is reserved by the bundled procedural registry.'],
                ]);
            }
        }

        try {
            return TalosToolContractMapper::fromLegacyWrite($payload, $id, $revision);
        } catch (AlignmentContractException $exception) {
            throw ValidationException::withMessages([
                'contract' => [$exception->errorCode.': '.$exception->details],
            ]);
        }
    }

    /** @return array<string, mixed> */
    private function writePayloadFromModel(TalosTool $tool): array
    {
        return [
            'connector_id' => $tool->connector_id,
            'name' => $tool->name,
            'display_name' => $tool->display_name,
            'description' => $tool->description,
            'input_schema' => $tool->input_schema,
            'output_schema' => $tool->output_schema,
            'risk_level' => $tool->risk_level,
            'capability' => $tool->capability,
            'capabilities' => $tool->capabilities,
            'actions' => $tool->actions,
            'confirmation' => $tool->confirmation,
            'effects' => $tool->effects,
            'execution' => [
                'locations' => $tool->execution_locations,
                'implementation_key' => $tool->implementation_key,
            ],
            'schema_version' => $tool->schema_version,
            'lifecycle_integrity_sha256' => $tool->lifecycle_integrity_sha256,
            'policy' => $tool->policy,
            'is_enabled' => $tool->is_enabled,
            'planning_enabled' => $tool->planning_enabled,
        ];
    }
}
