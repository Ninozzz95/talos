<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\TalosModelProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class TalosHumanJourneySeeder extends Seeder
{
    private const RUN_ID_PATTERN = '/^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$/D';

    private const MIN_PASSWORD_BYTES = 16;

    private const MAX_PASSWORD_BYTES = 1024;

    private const MAX_MODEL_BYTES = 255;

    public function run(): void
    {
        if (! app()->environment('testing')) {
            throw new RuntimeException('The TALOS Human Journey seeder is restricted to the testing environment.');
        }

        $runId = $this->requiredEnvironment('TALOS_HJ_RUN_ID');
        $runRoot = $this->requiredEnvironment('TALOS_HJ_RUN_ROOT');
        $email = $this->requiredEnvironment('TALOS_HJ_LOGIN_EMAIL');
        $password = $this->requiredEnvironment('TALOS_HJ_LOGIN_PASSWORD');
        $providerBaseUrl = $this->requiredEnvironment('TALOS_HJ_PROVIDER_BASE_URL');
        $providerModel = $this->requiredEnvironment('TALOS_HJ_PROVIDER_MODEL');

        $this->assertValidInputs($runId, $email, $password, $providerBaseUrl, $providerModel);
        $this->assertIsolatedRuntime($runRoot);

        DB::transaction(function () use ($runId, $email, $password, $providerBaseUrl, $providerModel): void {
            $user = User::query()->updateOrCreate([
                'email' => $email,
            ], [
                'name' => 'TALOS Human Journey',
                'password' => $password,
            ]);

            TalosModelProfile::query()->updateOrCreate([
                'user_id' => $user->id,
                'provider' => 'ollama',
                'model' => $providerModel,
                'base_url' => $providerBaseUrl,
            ], [
                'display_name' => 'TALOS Human Journey fixture',
                'encrypted_secret' => null,
                'timeout_seconds' => 15,
                'status' => 'healthy',
                'capabilities' => [
                    'chat' => true,
                    'tools' => true,
                    'fixture' => true,
                ],
                'probe_result' => [
                    'ok' => true,
                    'code' => 'TALOS_HJ_PROVIDER_READY',
                    'fixture' => true,
                    'run_id' => $runId,
                ],
            ]);
        });
    }

    private function requiredEnvironment(string $name): string
    {
        $value = getenv($name);
        if (! is_string($value) || trim($value) === '') {
            throw new RuntimeException("Required Human Journey environment input {$name} is missing.");
        }

        return $value;
    }

    private function assertIsolatedRuntime(string $runRoot): void
    {
        if (config('database.default') !== 'sqlite') {
            throw new RuntimeException('The TALOS Human Journey seeder requires the isolated SQLite connection.');
        }

        $canonicalRunRoot = realpath($runRoot);
        if ($canonicalRunRoot === false || ! is_dir($canonicalRunRoot)) {
            throw new RuntimeException('The TALOS Human Journey run root is not an existing directory.');
        }

        $laravelRoot = realpath($canonicalRunRoot.DIRECTORY_SEPARATOR.'runtime'.DIRECTORY_SEPARATOR.'laravel');
        if ($laravelRoot === false || ! is_dir($laravelRoot)) {
            throw new RuntimeException('The TALOS Human Journey Laravel runtime root is missing.');
        }

        $configuredDatabase = config('database.connections.sqlite.database');
        $canonicalDatabase = is_string($configuredDatabase) ? realpath($configuredDatabase) : false;
        if ($canonicalDatabase === false || ! is_file($canonicalDatabase) || ! $this->isContainedPath($canonicalDatabase, $laravelRoot)) {
            throw new RuntimeException('The TALOS Human Journey database must be an existing file inside the run root.');
        }

        $canonicalStorage = realpath(storage_path());
        if ($canonicalStorage === false || ! is_dir($canonicalStorage) || ! $this->isContainedPath($canonicalStorage, $laravelRoot)) {
            throw new RuntimeException('The TALOS Human Journey storage path must be inside the run root.');
        }
    }

    private function assertValidInputs(
        string $runId,
        string $email,
        string $password,
        string $providerBaseUrl,
        string $providerModel,
    ): void {
        if (preg_match(self::RUN_ID_PATTERN, $runId) !== 1) {
            throw new RuntimeException('The TALOS Human Journey run ID is invalid.');
        }

        if ($email !== trim($email) || strlen($email) > 255 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new RuntimeException('The TALOS Human Journey login email is invalid.');
        }

        $passwordBytes = strlen($password);
        if ($passwordBytes < self::MIN_PASSWORD_BYTES || $passwordBytes > self::MAX_PASSWORD_BYTES) {
            throw new RuntimeException('The TALOS Human Journey login password length is invalid.');
        }

        $modelBytes = strlen($providerModel);
        if ($providerModel !== trim($providerModel)
            || $modelBytes < 1
            || $modelBytes > self::MAX_MODEL_BYTES
            || ! mb_check_encoding($providerModel, 'UTF-8')
            || preg_match('/[\x00-\x1f\x7f]/', $providerModel) === 1) {
            throw new RuntimeException('The TALOS Human Journey provider model is invalid.');
        }

        $parts = parse_url($providerBaseUrl);
        $port = is_array($parts) && isset($parts['port']) && is_int($parts['port']) ? $parts['port'] : 0;
        $expected = $port >= 1024 && $port <= 65535 ? "http://127.0.0.1:{$port}/v1" : '';
        if (! is_array($parts)
            || $providerBaseUrl !== $expected
            || ($parts['scheme'] ?? null) !== 'http'
            || ($parts['host'] ?? null) !== '127.0.0.1'
            || ($parts['path'] ?? null) !== '/v1'
            || isset($parts['user'], $parts['pass'])
            || array_key_exists('query', $parts)
            || array_key_exists('fragment', $parts)) {
            throw new RuntimeException('The TALOS Human Journey provider base URL is invalid.');
        }
    }

    private function isContainedPath(string $candidate, string $root): bool
    {
        $normalizedCandidate = str_replace('\\', '/', $candidate);
        $normalizedRoot = rtrim(str_replace('\\', '/', $root), '/').'/';
        if (PHP_OS_FAMILY === 'Windows') {
            $normalizedCandidate = strtolower($normalizedCandidate);
            $normalizedRoot = strtolower($normalizedRoot);
        }

        return str_starts_with($normalizedCandidate, $normalizedRoot);
    }
}
