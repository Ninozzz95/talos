<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosHardwareProfile;
use App\Models\TalosLocalRuntime;
use App\Models\TalosModelCatalogEntry;
use App\Services\Cookbook\HardwareScanner;
use App\Services\Cookbook\LocalModelCommandPlanner;
use App\Services\Cookbook\ModelFitScorer;
use App\Services\Cookbook\RuntimeReadinessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosCookbookController extends Controller
{
    public function overview(ModelFitScorer $fitScorer): JsonResponse
    {
        $profile = $this->latestProfile();
        $models = TalosModelCatalogEntry::query()
            ->where('status', 'available')
            ->orderBy('display_name')
            ->limit(5)
            ->get()
            ->map(fn (TalosModelCatalogEntry $model): array => $this->modelPayload($model, $fitScorer, $profile))
            ->values();

        return response()->json(['data' => [
            'profile' => $profile === null ? null : $this->profilePayload($profile),
            'runtimes' => TalosLocalRuntime::query()
                ->orderBy('kind')
                ->get()
                ->map(fn (TalosLocalRuntime $runtime): array => $runtime->toApiArray())
                ->values(),
            'models' => $models,
        ]]);
    }

    public function scan(
        HardwareScanner $scanner,
        RuntimeReadinessService $readiness,
    ): JsonResponse {
        $hardware = $scanner->scan();
        $runtimes = $readiness->check();

        $profile = TalosHardwareProfile::query()->create([
            ...$hardware,
            'runtimes' => $runtimes,
        ]);
        assert($profile instanceof TalosHardwareProfile);

        foreach ($runtimes as $runtime) {
            TalosLocalRuntime::query()->updateOrCreate(
                ['kind' => $runtime['kind']],
                [
                    'name' => $runtime['name'],
                    'status' => $runtime['status'],
                    'version' => $runtime['version'],
                    'executable_path' => $runtime['executable_path'],
                    'evidence' => $runtime['evidence'],
                    'last_checked_at' => $runtime['last_checked_at'],
                ],
            );
        }

        return response()->json(['data' => [
            'profile' => $this->profilePayload($profile->refresh()),
            'runtimes' => $runtimes,
        ]]);
    }

    public function models(ModelFitScorer $fitScorer): JsonResponse
    {
        $profile = $this->latestProfile();
        $models = TalosModelCatalogEntry::query()
            ->orderBy('display_name')
            ->get()
            ->map(fn (TalosModelCatalogEntry $model): array => $this->modelPayload($model, $fitScorer, $profile))
            ->values();

        return response()->json(['data' => $models]);
    }

    public function storeModel(Request $request, ModelFitScorer $fitScorer): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'max:120'],
            'model_id' => ['required', 'string', 'max:255'],
            'display_name' => ['required', 'string', 'max:255'],
            'parameters_b' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999'],
            'quantization' => ['sometimes', 'nullable', 'string', 'max:120'],
            'context_window' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'runtime_modes' => ['sometimes', 'array'],
            'runtime_modes.*' => ['string', Rule::in(['ollama', 'llama_cpp', 'vllm'])],
            'estimated_vram_mb' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'estimated_ram_mb' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'tags' => ['sometimes', 'nullable', 'array'],
            'tags.*' => ['string', 'max:80'],
            'source_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'status' => ['sometimes', 'string', Rule::in(['available', 'disabled', 'experimental'])],
        ]);

        $model = TalosModelCatalogEntry::query()->create([
            ...$validated,
            'runtime_modes' => $validated['runtime_modes'] ?? [],
            'tags' => $validated['tags'] ?? [],
            'status' => $validated['status'] ?? 'available',
        ]);
        assert($model instanceof TalosModelCatalogEntry);

        return response()->json([
            'data' => $this->modelPayload($model, $fitScorer, $this->latestProfile()),
        ], 201);
    }

    public function downloadPreview(Request $request, LocalModelCommandPlanner $planner): JsonResponse
    {
        $validated = $this->validatedPreview($request);

        return response()->json(['data' => $planner->downloadPreview($validated['model_id'], $validated['runtime'])]);
    }

    public function servePreview(Request $request, LocalModelCommandPlanner $planner): JsonResponse
    {
        $validated = $this->validatedPreview($request);

        return response()->json(['data' => $planner->servePreview($validated['model_id'], $validated['runtime'])]);
    }

    public function planningContext(): JsonResponse
    {
        return response()->json([
            'source' => 'talos_cookbook',
            'policy' => [
                'shell_execution_allowed' => false,
                'previews_require_approval' => true,
                'tools_are_read_only' => true,
            ],
            'tools' => [
                [
                    'id' => 'scan_hardware',
                    'description' => 'Inspect local hardware and runtime readiness without shell execution.',
                    'risk_level' => 'low',
                    'read_only' => true,
                ],
                [
                    'id' => 'list_fit_models',
                    'description' => 'List local model catalog entries with deterministic fit scoring.',
                    'risk_level' => 'low',
                    'read_only' => true,
                ],
                [
                    'id' => 'runtime_readiness',
                    'description' => 'Inspect local runtime readiness without installing or starting services.',
                    'risk_level' => 'low',
                    'read_only' => true,
                ],
            ],
        ]);
    }

    /**
     * @return array{model_id:string,runtime:string}
     */
    private function validatedPreview(Request $request): array
    {
        return $request->validate([
            'model_id' => ['required', 'string', 'max:255', 'regex:/\A[A-Za-z0-9._\/:-]+\z/'],
            'runtime' => ['required', 'string', Rule::in(['ollama', 'llama_cpp', 'vllm'])],
        ]);
    }

    private function latestProfile(): ?TalosHardwareProfile
    {
        return TalosHardwareProfile::query()
            ->latest('scanned_at')
            ->latest('created_at')
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function profilePayload(TalosHardwareProfile $profile): array
    {
        return [
            ...$profile->toApiArray(),
            'trust_level' => 'local_evidence',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function modelPayload(
        TalosModelCatalogEntry $model,
        ModelFitScorer $fitScorer,
        ?TalosHardwareProfile $profile,
    ): array {
        return [
            ...$model->toApiArray(),
            'fit' => $fitScorer->score($model, $profile),
        ];
    }
}
