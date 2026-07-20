<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\User;
use Database\Seeders\TalosHumanJourneySeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use ReflectionMethod;
use RuntimeException;
use Tests\TestCase;

final class TalosHumanJourneySeederTest extends TestCase
{
    /** @var list<string> */
    private const ENVIRONMENT_KEYS = [
        'TALOS_HJ_RUN_ID',
        'TALOS_HJ_RUN_ROOT',
        'TALOS_HJ_LOGIN_EMAIL',
        'TALOS_HJ_LOGIN_PASSWORD',
        'TALOS_HJ_PROVIDER_BASE_URL',
        'TALOS_HJ_PROVIDER_MODEL',
    ];

    private string $sandboxRoot;

    private string $originalStoragePath;

    /** @var array<string, mixed> */
    private array $originalDatabaseConfig;

    protected function setUp(): void
    {
        parent::setUp();

        $this->sandboxRoot = sys_get_temp_dir().DIRECTORY_SEPARATOR.'talos-hj-seeder-'.Str::uuid();
        File::ensureDirectoryExists($this->sandboxRoot);
        $this->originalStoragePath = $this->app->storagePath();
        $this->originalDatabaseConfig = [
            'default' => config('database.default'),
            'url' => config('database.connections.sqlite.url'),
            'database' => config('database.connections.sqlite.database'),
        ];
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        DB::purge('sqlite');
        config([
            'database.default' => $this->originalDatabaseConfig['default'],
            'database.connections.sqlite.url' => $this->originalDatabaseConfig['url'],
            'database.connections.sqlite.database' => $this->originalDatabaseConfig['database'],
        ]);
        $this->app->useStoragePath($this->originalStoragePath);
        $this->app->instance('env', 'testing');
        foreach (self::ENVIRONMENT_KEYS as $key) {
            $this->unsetEnvironment($key);
        }
        $this->deleteSandbox();

        parent::tearDown();
    }

    public function test_it_rejects_every_runtime_outside_testing_before_database_access(): void
    {
        $runRoot = $this->createRunRoot();
        $this->setValidEnvironment($runRoot);
        $this->app->instance('env', 'production');
        config(['database.default' => 'mysql']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('testing');

        (new TalosHumanJourneySeeder)->run();
    }

    public function test_it_rejects_database_or_storage_outside_run_root(): void
    {
        $runRoot = $this->createRunRoot();
        $this->setValidEnvironment($runRoot);
        $insideStorage = $runRoot.DIRECTORY_SEPARATOR.'runtime'.DIRECTORY_SEPARATOR.'laravel'.DIRECTORY_SEPARATOR.'storage';
        File::ensureDirectoryExists($insideStorage);
        $outsideDatabase = $this->sandboxRoot.DIRECTORY_SEPARATOR.'outside.sqlite';
        File::put($outsideDatabase, '');
        $this->app->useStoragePath($insideStorage);
        $this->configureSqlite($outsideDatabase);

        try {
            (new TalosHumanJourneySeeder)->run();
            $this->fail('The seeder accepted a database outside the run root.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('database', strtolower($exception->getMessage()));
        }

        $insideDatabase = $runRoot.DIRECTORY_SEPARATOR.'runtime'.DIRECTORY_SEPARATOR.'laravel'.DIRECTORY_SEPARATOR.'database.sqlite';
        File::ensureDirectoryExists(dirname($insideDatabase));
        File::put($insideDatabase, '');
        $outsideStorage = $this->sandboxRoot.DIRECTORY_SEPARATOR.'outside-storage';
        File::ensureDirectoryExists($outsideStorage);
        $this->configureSqlite($insideDatabase);
        $this->app->useStoragePath($outsideStorage);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('storage');

        (new TalosHumanJourneySeeder)->run();
    }

    public function test_it_rejects_missing_or_invalid_synthetic_inputs(): void
    {
        $runRoot = $this->createRunRoot();
        $invalidCases = [
            ['TALOS_HJ_RUN_ID', 'invalid-run', 'run ID'],
            ['TALOS_HJ_LOGIN_EMAIL', 'not-an-email', 'email'],
            ['TALOS_HJ_LOGIN_PASSWORD', 'too-short', 'password'],
            ['TALOS_HJ_PROVIDER_BASE_URL', 'http://localhost:43125/v1', 'base URL'],
            ['TALOS_HJ_PROVIDER_MODEL', "invalid\nmodel", 'model'],
        ];

        foreach ($invalidCases as [$key, $value, $expectedMessage]) {
            $this->setValidEnvironment($runRoot);
            $this->setEnvironment($key, $value);

            try {
                (new TalosHumanJourneySeeder)->run();
                $this->fail("The seeder accepted invalid {$key}.");
            } catch (RuntimeException $exception) {
                $this->assertStringContainsString($expectedMessage, $exception->getMessage());
            }
        }

        $validator = new ReflectionMethod(TalosHumanJourneySeeder::class, 'assertValidInputs');
        try {
            $validator->invoke(
                new TalosHumanJourneySeeder,
                'hj_20260718T220000Z_8f31c0aa',
                'human-journey@example.test',
                'human-journey-password-42',
                'http://127.0.0.1:43125/v1',
                "\xC3\x28",
            );
            $this->fail('The seeder accepted a non-UTF-8 provider model.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('model', $exception->getMessage());
        }

        $this->setValidEnvironment($runRoot);
        $this->unsetEnvironment('TALOS_HJ_LOGIN_PASSWORD');

        $this->expectException(RuntimeException::class);
        (new TalosHumanJourneySeeder)->run();
    }

    public function test_it_creates_one_idempotent_synthetic_owner_and_healthy_credential_free_profile(): void
    {
        $runtime = $this->prepareMigratedRuntime();

        (new TalosHumanJourneySeeder)->run();
        (new TalosHumanJourneySeeder)->run();

        $this->assertSame(1, User::query()->count());
        $this->assertSame(1, TalosModelProfile::query()->count());
        $user = User::query()->sole();
        $profile = TalosModelProfile::query()->sole();

        $this->assertSame('human-journey@example.test', $user->email);
        $this->assertTrue(Hash::check('human-journey-password-42', $user->password));
        $this->assertSame($user->id, $profile->user_id);
        $this->assertSame('ollama', $profile->provider);
        $this->assertSame('talos-human-journey-fixture', $profile->model);
        $this->assertSame('http://127.0.0.1:43125/v1', $profile->base_url);
        $this->assertSame('healthy', $profile->status);
        $this->assertNull($profile->encrypted_secret);
        $this->assertSame([
            'chat' => true,
            'tools' => true,
            'fixture' => true,
        ], $profile->capabilities);
        $this->assertSame('hj_20260718T220000Z_8f31c0aa', $profile->probe_result['run_id']);
        $this->assertSame($runtime['database'], config('database.connections.sqlite.database'));
        $this->assertSame($runtime['storage'], storage_path());
    }

    public function test_it_does_not_modify_an_unselected_database_file(): void
    {
        $sentinel = $this->sandboxRoot.DIRECTORY_SEPARATOR.'normal-database.sqlite';
        File::put($sentinel, 'normal database sentinel '.Str::random(32));
        $before = hash_file('sha256', $sentinel);
        $this->prepareMigratedRuntime();

        (new TalosHumanJourneySeeder)->run();

        $this->assertSame($before, hash_file('sha256', $sentinel));
        $this->assertSame(1, User::query()->count());
        $this->assertSame(1, TalosModelProfile::query()->count());
    }

    /** @return array{root: string, database: string, storage: string} */
    private function prepareMigratedRuntime(): array
    {
        $root = $this->createRunRoot();
        $database = $root.DIRECTORY_SEPARATOR.'runtime'.DIRECTORY_SEPARATOR.'laravel'.DIRECTORY_SEPARATOR.'database.sqlite';
        $storage = $root.DIRECTORY_SEPARATOR.'runtime'.DIRECTORY_SEPARATOR.'laravel'.DIRECTORY_SEPARATOR.'storage';
        File::ensureDirectoryExists(dirname($database));
        File::ensureDirectoryExists($storage);
        File::put($database, '');
        $this->setValidEnvironment($root);
        $this->configureSqlite($database);
        $this->app->useStoragePath($storage);

        $exitCode = Artisan::call('migrate:fresh', [
            '--database' => 'sqlite',
            '--force' => true,
        ]);
        $this->assertSame(0, $exitCode, Artisan::output());

        return compact('root', 'database', 'storage');
    }

    private function createRunRoot(): string
    {
        $root = $this->sandboxRoot.DIRECTORY_SEPARATOR.'hj_20260718T220000Z_8f31c0aa';
        File::ensureDirectoryExists($root);

        return $root;
    }

    private function configureSqlite(string $database): void
    {
        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.url' => null,
            'database.connections.sqlite.database' => $database,
        ]);
        DB::purge('sqlite');
    }

    private function setValidEnvironment(string $runRoot): void
    {
        $values = [
            'TALOS_HJ_RUN_ID' => 'hj_20260718T220000Z_8f31c0aa',
            'TALOS_HJ_RUN_ROOT' => $runRoot,
            'TALOS_HJ_LOGIN_EMAIL' => 'human-journey@example.test',
            'TALOS_HJ_LOGIN_PASSWORD' => 'human-journey-password-42',
            'TALOS_HJ_PROVIDER_BASE_URL' => 'http://127.0.0.1:43125/v1',
            'TALOS_HJ_PROVIDER_MODEL' => 'talos-human-journey-fixture',
        ];

        foreach ($values as $key => $value) {
            $this->setEnvironment($key, $value);
        }
    }

    private function setEnvironment(string $key, string $value): void
    {
        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }

    private function unsetEnvironment(string $key): void
    {
        putenv($key);
        unset($_ENV[$key], $_SERVER[$key]);
    }

    private function deleteSandbox(): void
    {
        $temporaryRoot = realpath(sys_get_temp_dir());
        $sandbox = realpath($this->sandboxRoot);
        if ($temporaryRoot === false || $sandbox === false) {
            return;
        }

        $prefix = rtrim(str_replace('\\', '/', $temporaryRoot), '/').'/';
        $candidate = str_replace('\\', '/', $sandbox);
        if (! str_starts_with(strtolower($candidate), strtolower($prefix.'talos-hj-seeder-'))) {
            throw new RuntimeException('Refusing to delete a Human Journey test path outside the owned sandbox.');
        }

        File::deleteDirectory($sandbox);
    }
}
