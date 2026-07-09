<?php

declare(strict_types=1);

namespace App\Services\Cookbook;

final class RuntimeReadinessService
{
    /**
     * @return array<string, array<string, mixed>>
     */
    public function check(): array
    {
        return [
            'ollama' => $this->runtime('Ollama', 'ollama', ['ollama']),
            'llama_cpp' => $this->runtime('llama.cpp server', 'llama_cpp', ['llama-server', 'llama-server.exe']),
            'vllm' => $this->runtime('vLLM', 'vllm', ['vllm', 'vllm.exe']),
        ];
    }

    /**
     * @param list<string> $executables
     * @return array<string, mixed>
     */
    private function runtime(string $name, string $kind, array $executables): array
    {
        $path = $this->findExecutable($executables);

        return [
            'name' => $name,
            'kind' => $kind,
            'status' => $path === null ? 'unavailable' : 'available',
            'version' => null,
            'executable_path' => $path,
            'evidence' => [
                'inspection' => 'path_lookup_only',
                'shell_execution' => false,
                'executables' => $executables,
            ],
            'last_checked_at' => now(),
        ];
    }

    /**
     * @param list<string> $executables
     */
    private function findExecutable(array $executables): ?string
    {
        $path = getenv('PATH');
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $extensions = [''];
        if (PHP_OS_FAMILY === 'Windows') {
            $pathExt = getenv('PATHEXT');
            $extensions = is_string($pathExt) && trim($pathExt) !== ''
                ? array_map('strtolower', array_filter(array_map('trim', explode(';', $pathExt))))
                : ['.exe', '.bat', '.cmd'];
        }

        foreach (explode(PATH_SEPARATOR, $path) as $directory) {
            $directory = trim($directory, " \t\n\r\0\x0B\"");
            if ($directory === '' || ! is_dir($directory)) {
                continue;
            }

            foreach ($executables as $executable) {
                foreach ($extensions as $extension) {
                    $candidate = $directory.DIRECTORY_SEPARATOR.$executable;
                    if ($extension !== '' && ! str_ends_with(strtolower($candidate), $extension)) {
                        $candidate .= $extension;
                    }

                    if (is_file($candidate)) {
                        return $candidate;
                    }
                }
            }
        }

        return null;
    }
}
