<?php

declare(strict_types=1);

namespace App\Services\Cookbook;

final class LocalModelCommandPlanner
{
    /**
     * @return array{mode:string,executed:bool,requires_approval:bool,commands:list<string>,warnings:list<string>}
     */
    public function downloadPreview(string $modelId, string $runtime): array
    {
        return $this->plan($modelId, $runtime, 'download');
    }

    /**
     * @return array{mode:string,executed:bool,requires_approval:bool,commands:list<string>,warnings:list<string>}
     */
    public function servePreview(string $modelId, string $runtime): array
    {
        return $this->plan($modelId, $runtime, 'serve');
    }

    /**
     * @return array{mode:string,executed:bool,requires_approval:bool,commands:list<string>,warnings:list<string>}
     */
    private function plan(string $modelId, string $runtime, string $action): array
    {
        $commands = match ([$runtime, $action]) {
            ['ollama', 'download'] => ["ollama pull {$modelId}"],
            ['ollama', 'serve'] => ["ollama run {$modelId}"],
            ['llama_cpp', 'download'] => ["llama-cli --hf-repo {$modelId} --download-only"],
            ['llama_cpp', 'serve'] => ["llama-server --hf-repo {$modelId}"],
            ['vllm', 'download'] => ["vllm download {$modelId}"],
            ['vllm', 'serve'] => ["vllm serve {$modelId}"],
            default => [],
        };

        return [
            'mode' => 'dry_run',
            'executed' => false,
            'requires_approval' => true,
            'commands' => $commands,
            'warnings' => [
                'Preview only. TALOS Cookbook V1 does not execute local model commands.',
            ],
        ];
    }
}
