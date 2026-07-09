<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertDeploymentFileContains(string $path, array $needles): void
{
    assertTrue(is_file($path), "{$path} should exist.");

    $contents = (string) file_get_contents($path);
    foreach ($needles as $needle) {
        assertTrue(str_contains($contents, $needle), "{$path} should contain {$needle}.");
    }
}

function testRootEnvironmentContractExists(): void
{
    $root = dirname(__DIR__, 2);

    assertDeploymentFileContains($root.'/.env.example', [
        'APP_NAME=TALOS',
        'APP_PORT=8088',
        'AVM_VALIDATOR_URL=http://validator:3000',
        'TALOS_VALIDATOR_HEALTH_URL=http://validator:3000/health',
        'TALOS_ADMIN_EMAIL=',
        'TALOS_MODEL_PROVIDER_ALLOWED_HOSTS=',
    ]);
}

function testDockerComposeDefinesTalosQueueAndValidator(): void
{
    $root = dirname(__DIR__, 2);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    assertDeploymentFileContains($root.'/docker-compose.yml', [
        'talos:',
        'talos-queue:',
        'validator:',
        'Dockerfile.talos',
        'Dockerfile.validator',
        '${APP_BIND:-127.0.0.1}:${APP_PORT:-8088}:8088',
        'AVM_VALIDATOR_URL=http://validator:3000',
    ]);

    assertTrue(
        (bool) preg_match('/talos-queue:.*?depends_on:\s+talos:\s+condition: service_healthy/s', $compose),
        'talos-queue should wait for the TALOS web container to become healthy before starting.'
    );
}

function testDockerfilesAndRootLauncherExist(): void
{
    $root = dirname(__DIR__, 2);

    assertDeploymentFileContains($root.'/Dockerfile.talos', [
        'control-plane',
        'talos-entrypoint',
        'artisan',
        '--host=0.0.0.0',
        '--port=8088',
    ]);

    assertDeploymentFileContains($root.'/docker/talos-entrypoint.sh', [
        'php artisan key:generate --force',
        'php artisan migrate --force',
        'exec "$@"',
    ]);

    assertDeploymentFileContains($root.'/Dockerfile.validator', [
        'validator',
        'npm run build',
        'node',
        'dist/server.js',
    ]);

    assertDeploymentFileContains($root.'/talos', [
        'talos up',
        'talos doctor',
        'docker compose up -d --build',
        'maybe_boot',
        'TALOS_NO_BOOT',
        '--no-boot',
        '--plain',
        '.talos/state.json',
        'TALOS bootstrap',
    ]);

    assertDeploymentFileContains($root.'/talos.cmd', [
        'talos',
        'docker compose',
    ]);
}

function testRuntimeStateIsIgnored(): void
{
    $root = dirname(__DIR__, 2);

    assertDeploymentFileContains($root.'/.gitignore', [
        '.talos/',
    ]);
}

function testTalosDoctorDoesNotMislabelComposeConfigWhenDockerIsMissing(): void
{
    $root = dirname(__DIR__, 2);

    exec('docker --version 2>&1', $dockerOutput, $dockerCode);
    if ($dockerCode === 0) {
        echo "Docker is available; skipping missing-Docker doctor regression".PHP_EOL;

        return;
    }

    exec('bash '.escapeshellarg($root.'/talos').' doctor 2>&1', $output, $code);
    $text = implode(PHP_EOL, $output);

    assertTrue($code !== 0, 'talos doctor should return non-zero when Docker is unavailable.');
    assertTrue(str_contains($text, 'Docker CLI is not available'), 'talos doctor should report the missing Docker CLI.');
    assertTrue(! str_contains($text, 'compose config      FAIL invalid'), 'talos doctor should not call missing Docker a compose config error.');
}

$tests = [
    'testRootEnvironmentContractExists',
    'testDockerComposeDefinesTalosQueueAndValidator',
    'testDockerfilesAndRootLauncherExist',
    'testRuntimeStateIsIgnored',
    'testTalosDoctorDoesNotMislabelComposeConfigWhenDockerIsMissing',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed".PHP_EOL;
}

echo "All deployment packaging contract tests passed".PHP_EOL;
