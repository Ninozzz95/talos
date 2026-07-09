<?php

declare(strict_types=1);

namespace App\Services\Cookbook;

use App\Models\TalosLocalRuntime;

final class DependencyPlanner
{
    /**
     * @return array<string, mixed>
     */
    public function catalog(): array
    {
        $runtimeEvidence = TalosLocalRuntime::query()
            ->get()
            ->keyBy('kind');

        return [
            'policy' => $this->policy(),
            'dependencies' => array_map(function (array $definition) use ($runtimeEvidence): array {
                $runtime = $runtimeEvidence->get($definition['runtime']);

                return [
                    ...$definition,
                    'detected_status' => $runtime instanceof TalosLocalRuntime ? $runtime->status : 'unknown',
                    'detected_version' => $runtime instanceof TalosLocalRuntime ? $runtime->version : null,
                    'evidence' => $runtime instanceof TalosLocalRuntime ? ($runtime->evidence ?? []) : [],
                    'install_allowed' => false,
                    'required_scope' => 'talos.shell.exec',
                    'execution_gate' => 'host_shell_execution_disabled',
                ];
            }, $this->definitions()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function preview(string $runtime, string $modelId): array
    {
        $definition = collect($this->definitions())
            ->firstWhere('runtime', $runtime) ?? [
                'runtime' => $runtime,
                'name' => $runtime,
                'package_manager' => 'manual',
                'install_hint' => 'Install this runtime manually from its official documentation.',
            ];

        return [
            'mode' => 'dry_run',
            'runtime' => $runtime,
            'model_id' => $modelId,
            'executed' => false,
            'requires_approval' => true,
            'install_allowed' => false,
            'policy' => $this->policy(),
            'steps' => [
                [
                    'kind' => 'dependency_check',
                    'runtime' => $runtime,
                    'description' => 'Inspect runtime readiness from TALOS local evidence.',
                    'read_only' => true,
                ],
                [
                    'kind' => 'install_preview',
                    'runtime' => $runtime,
                    'package_manager' => $definition['package_manager'] ?? 'manual',
                    'description' => $definition['install_hint'] ?? 'Install manually from official documentation.',
                    'read_only' => true,
                    'executed' => false,
                ],
                [
                    'kind' => 'model_download_preview',
                    'runtime' => $runtime,
                    'model_id' => $modelId,
                    'description' => 'Generate the future model download step only after host execution policy is enabled.',
                    'read_only' => true,
                    'executed' => false,
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function policy(): array
    {
        return [
            'default_decision' => 'deny',
            'execution_allowed' => false,
            'install_execution_enabled' => false,
            'serve_execution_enabled' => false,
            'required_scope' => 'talos.shell.exec',
            'preview_scope' => 'talos.shell.preview',
            'plain_commands_are_preview_only' => true,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function definitions(): array
    {
        return [
            [
                'runtime' => 'ollama',
                'name' => 'Ollama',
                'package_manager' => 'official_installer',
                'install_hint' => 'Install Ollama from the official package for this host before enabling local model serving.',
                'supports' => ['pull', 'serve'],
            ],
            [
                'runtime' => 'llama_cpp',
                'name' => 'llama.cpp',
                'package_manager' => 'source_or_release',
                'install_hint' => 'Install a llama.cpp build that matches CPU/GPU acceleration requirements.',
                'supports' => ['download', 'serve'],
            ],
            [
                'runtime' => 'vllm',
                'name' => 'vLLM',
                'package_manager' => 'python',
                'install_hint' => 'Install vLLM in an isolated Python environment after GPU compatibility has been confirmed.',
                'supports' => ['serve'],
            ],
        ];
    }
}
