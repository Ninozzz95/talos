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
        'TALOS_BROWSER_WORKER_URL=http://browser-worker:3100',
        'TALOS_BROWSER_WORKER_TOKEN=',
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
        'php:8.5-fpm',
        'nginx',
        'talos-server',
    ]);

    assertDeploymentFileContains($root.'/docker/talos-server.sh', [
        'php-fpm --nodaemonize',
        "nginx -g 'daemon off;'",
        'kill -0',
        'trap',
    ]);
    assertTrue(
        ! str_contains((string) file_get_contents($root.'/docker/talos-server.sh'), 'php-fpm -D'),
        'The TALOS container must not leave PHP-FPM running as an unmonitored daemon.'
    );

    assertDeploymentFileContains($root.'/docker/nginx/talos.conf', [
        'listen 8088',
        'try_files',
        'fastcgi_pass 127.0.0.1:9000',
    ]);

    assertDeploymentFileContains($root.'/docker/talos-entrypoint.sh', [
        '${APP_KEY:-}',
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
        'talos dev',
        'talos doctor',
        'doctor --repair',
        'compose up -d --build',
        'maybe_boot',
        'TALOS_NO_BOOT',
        '--no-boot',
        '--plain',
        '.talos/state.json',
        'TALOS bootstrap',
        'TALOS_BROWSER_WORKER_TOKEN',
        'random_hex_32',
        'active_talos_url',
        'http://127.0.0.1:8000',
        'doctor:runtime',
        'chmod 600 .env',
    ]);

    $launcher = (string) file_get_contents($root.'/talos');
    assertTrue(! str_contains($launcher, 'APP_KEY is missing and PHP is not available'), 'Docker startup must not require host PHP for APP_KEY generation.');

    assertDeploymentFileContains($root.'/talos.cmd', [
        'talos',
        'GIT_BASH',
        'Git for Windows',
        'where git.exe',
    ]);
    assertTrue(
        ! str_contains(strtolower((string) file_get_contents($root.'/talos.cmd')), 'where bash.exe'),
        'The Windows launcher must not select an arbitrary Bash implementation from PATH.'
    );

    assertTrue(
        ! preg_match('/if\s+native_setup\s+repair\s*;/m', $launcher),
        'talos doctor --repair must not suppress native setup failures through a conditional function call.'
    );
}

function testTrackedLaunchersAreRelocatable(): void
{
    $root = dirname(__DIR__, 2);
    $launchers = [
        'talos',
        'talos.cmd',
        'core/boot.bat',
        'core/boot.sh',
        'core/kadmos.cmd',
    ];

    foreach ($launchers as $launcher) {
        $contents = (string) file_get_contents($root.'/'.$launcher);
        assertTrue(
            ! preg_match('~[A-Za-z]:[\\\\/](?:Users|Documents and Settings)[\\\\/]~i', $contents),
            "{$launcher} must not contain a user-specific Windows path."
        );
        assertTrue(
            ! str_contains(str_replace('\\', '/', $contents), '/c/Users/ninox/Desktop/AVM'),
            "{$launcher} must not contain the original checkout path."
        );
    }
}

function testNativeToolchainBootstrapIsPinnedAndVerifiable(): void
{
    $root = dirname(__DIR__, 2);

    assertDeploymentFileContains($root.'/scripts/bootstrap-tools.sh', [
        'bootstrap-tools.ps1',
        '--verify-only',
    ]);
    assertDeploymentFileContains($root.'/scripts/bootstrap-tools.ps1', [
        'VerifyOnly',
        'Repair',
        'SHA256',
        '.tools',
        'php.ini',
        'GetFileName',
        'GetFullPath',
        'artifact destination escapes the downloads directory',
        'curl.cainfo',
        'openssl.cafile',
        '${TALOS_PHP_ROOT}',
    ]);
    assertDeploymentFileContains($root.'/browser-worker/package.json', [
        'doctor:runtime',
    ]);

    $manifestPath = $root.'/scripts/toolchain/manifest.json';
    assertTrue(is_file($manifestPath), 'The pinned native toolchain manifest should exist.');
    $manifest = json_decode((string) file_get_contents($manifestPath), true, flags: JSON_THROW_ON_ERROR);

    foreach (['php', 'node', 'composer', 'cacert'] as $artifact) {
        assertTrue(isset($manifest['windows_x64'][$artifact]), "Manifest should define {$artifact}.");
        $entry = $manifest['windows_x64'][$artifact];
        assertTrue(is_string($entry['version'] ?? null) && $entry['version'] !== '', "{$artifact} should pin a version.");
        assertTrue(
            is_string($entry['url'] ?? null) && str_starts_with($entry['url'], 'https://'),
            "{$artifact} should use a pinned HTTPS URL."
        );
        assertTrue(
            is_string($entry['sha256'] ?? null) && preg_match('/^[a-f0-9]{64}$/', $entry['sha256']) === 1,
            "{$artifact} should pin a lowercase SHA-256 digest."
        );
    }
}

function testDockerFreshCloneIncludesEveryRuntimeWithoutMaskingMigrations(): void
{
    $root = dirname(__DIR__, 2);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    foreach ([
        'browser-worker:',
        'Dockerfile.browser-worker',
        'TALOS_BROWSER_WORKER_URL=http://browser-worker:3100',
        'DB_DATABASE=/app/control-plane/storage/app/talos/database.sqlite',
        'env_file:',
        '- .env',
    ] as $needle) {
        assertTrue(str_contains($compose, $needle), "docker-compose.yml should contain {$needle}.");
    }

    assertTrue(
        ! str_contains($compose, 'talos-database:/app/control-plane/database'),
        'Docker persistence must not mask Laravel database migrations.'
    );
    assertTrue(
        ! str_contains($compose, '.env:/app/control-plane/.env'),
        'The private root .env must be injected as environment, not mounted where PHP-FPM needs filesystem access.'
    );

    assertDeploymentFileContains($root.'/Dockerfile.talos', [
        'COPY core ./core',
        'cd core',
        'composer install --no-dev',
    ]);
    assertDeploymentFileContains($root.'/Dockerfile.browser-worker', [
        'browser-worker',
        'playwright install',
        'ENV NODE_ENV=production',
        'TALOS_BROWSER_WORKER_TOKEN',
        'USER node',
        'PLAYWRIGHT_BROWSERS_PATH',
    ]);
}

function testProductionBrowserWorkerCannotBeSilentlyOmitted(): void
{
    $root = dirname(__DIR__, 2);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    assertDeploymentFileContains($root.'/control-plane/app/Providers/AppServiceProvider.php', [
        'BrowserWorkerConfiguration',
        'assertReadyFor($this->app->environment())',
    ]);
    assertDeploymentFileContains($root.'/control-plane/app/Services/Talos/Browser/BrowserWorkerConfiguration.php', [
        "environment !== 'production'",
        'TALOS_BROWSER_WORKER_URL is required in production',
        'TALOS_BROWSER_WORKER_TOKEN is required in production',
        'must contain at least 32 characters',
        '128 bits of estimated entropy',
        'TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT',
    ]);

    foreach (['talos', 'talos-queue'] as $serviceName) {
        assertTrue(
            (bool) preg_match('/\n  '.preg_quote($serviceName, '/').':\n(?<service>.*?)(?=\n  [a-z][a-z0-9-]*:\n|\nvolumes:)/s', $compose, $matches),
            "docker-compose.yml should contain a parseable {$serviceName} service."
        );
        assertTrue(
            str_contains($matches['service'], 'TALOS_BROWSER_WORKER_TOKEN=${TALOS_BROWSER_WORKER_TOKEN:?TALOS_BROWSER_WORKER_TOKEN is required}'),
            "{$serviceName} must fail Compose expansion when the browser-worker secret is missing."
        );
        assertTrue(
            str_contains($matches['service'], 'TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true'),
            "{$serviceName} must explicitly opt into its private HTTP browser-worker bridge."
        );
        assertTrue(
            (bool) preg_match('/browser-worker:\s+condition: service_healthy/s', $matches['service']),
            "{$serviceName} must wait for a healthy browser worker."
        );
    }

    assertDeploymentFileContains($root.'/docs/deployment.md', [
        'Native browser-worker service',
        'TALOS_BROWSER_WORKER_URL=http://127.0.0.1:3100',
        'TALOS_BROWSER_WORKER_TOKEN=<same-strong-secret>',
        'TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true',
        'HTTPS worker URLs are accepted by default.',
        'until `/readyz` reports `browser_worker.status=healthy`',
    ]);
}

function testOptionalSearxngIntegrationIsPinnedInternalAndJsonOnly(): void
{
    $root = dirname(__DIR__, 2);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    assertDeploymentFileContains($root.'/.env.example', [
        'TALOS_WEB_SEARCH_PROVIDER=unavailable',
        'TALOS_SEARXNG_URL=http://searxng:8080',
        'TALOS_SEARXNG_SECRET=',
        'TALOS_BROWSER_SEARCH_ENABLED=false',
        'TALOS_BROWSER_SEARCH_ORIGIN=',
    ]);
    assertDeploymentFileContains($root.'/docker-compose.yml', [
        'searxng:',
        'profiles: ["search"]',
        'docker.io/searxng/searxng:2026.7.12-c19d86faa@sha256:f433294b46a93564993c4371005341e013d94aa8ea4662d8ee521cd2cccb08e8',
        './deploy/searxng/settings.yml:/etc/searxng/settings.yml:ro',
        'TALOS_WEB_SEARCH_PROVIDER=${TALOS_WEB_SEARCH_PROVIDER:-unavailable}',
        'TALOS_SEARXNG_URL=${TALOS_SEARXNG_URL:-http://searxng:8080}',
        'test: ["CMD", "wget", "--spider", "--quiet", "--timeout=5", "--tries=1", "http://127.0.0.1:8080/healthz"]',
        'interval: 10s',
        'timeout: 5s',
        'retries: 12',
        'start_period: 20s',
    ]);
    assertDeploymentFileContains($root.'/deploy/searxng/settings.yml', [
        'use_default_settings: true',
        'formats:',
        '- json',
        'limiter: false',
        'public_instance: false',
    ]);
    assertTrue(
        preg_match('/\n  searxng:\n(?<service>.*?)(?=\n  [a-z][a-z0-9-]*:\n|\nvolumes:)/s', $compose, $matches) === 1,
        'docker-compose.yml should contain a parseable SearXNG service block.'
    );
    assertTrue(
        ! str_contains($matches['service'], 'ports:'),
        'The optional SearXNG API must stay internal and must not publish a host port.'
    );
    assertDeploymentFileContains($root.'/talos', [
        'TALOS_WEB_SEARCH_PROVIDER',
        'COMPOSE_PROFILES',
        '--profile search',
        'reconcile_stale_search_service',
        'rm -sf searxng',
        'wait_for_search_ready',
        'compose_all_profiles',
        'search_health_url="http://127.0.0.1:8080/healthz"',
        'wget --spider --quiet --timeout=5 --tries=1',
        'search_json_url="http://127.0.0.1:8080/search?q=talos&format=json"',
        'seq 1 3',
        'results',
        'python3 -c',
    ]);
    assertDeploymentFileContains($root.'/scripts/tests/talos-clean-clone-launcher.sh', [
        'The unavailable search provider did not reconcile a stale SearXNG service',
        'Provider switch to unavailable did not reconcile stale SearXNG before up',
        'SearXNG launcher command did not activate the search profile',
        'Explicit COMPOSE_PROFILES=search intent was not preserved',
        'SearXNG launcher did not wait for the internal /healthz endpoint',
        'SearXNG launcher did not remove all Compose profiles during down',
    ]);
    assertDeploymentFileContains($root.'/docs/deployment.md', [
        'TALOS_WEB_SEARCH_PROVIDER=searxng',
        'Bash launcher automatically',
        'enables the Compose `search` profile',
        'bounded JSON API readiness probe',
        'stale auto-managed SearXNG service',
        'COMPOSE_PROFILES',
    ]);
    assertDeploymentFileContains($root.'/THIRD_PARTY_NOTICES.md', [
        'SearXNG 2026.7.12-c19d86faa',
        'https://github.com/searxng/searxng/commit/c19d86faa393bdd696a5708e3c294f956d750683',
        'AGPL-3.0-or-later',
        'sha256:f433294b46a93564993c4371005341e013d94aa8ea4662d8ee521cd2cccb08e8',
        'optional isolated sidecar',
    ]);
}

function testRuntimeStateIsIgnored(): void
{
    $root = dirname(__DIR__, 2);

    assertDeploymentFileContains($root.'/.gitignore', [
        '.talos/',
    ]);
}

function testRootLauncherHelpWorksFromRenamedPathWithSpaces(): void
{
    $root = dirname(__DIR__, 2);
    $temporaryRoot = sys_get_temp_dir().'/TALOS Renamed Clone '.bin2hex(random_bytes(4));
    assertTrue(mkdir($temporaryRoot, 0777, true), 'Temporary renamed checkout should be created.');

    try {
        $launcher = $temporaryRoot.'/talos';
        assertTrue(copy($root.'/talos', $launcher), 'Root launcher should be copied into the renamed checkout.');
        exec('bash '.escapeshellarg($launcher).' --plain help 2>&1', $output, $code);
        $text = implode(PHP_EOL, $output);

        assertTrue($code === 0, 'Root launcher help should run from a renamed path containing spaces.');
        assertTrue(str_contains($text, 'talos up'), 'Relocated launcher should render its usage.');
        assertTrue(! str_contains(str_replace('\\', '/', $text), str_replace('\\', '/', $root)), 'Relocated launcher output must not expose the source checkout.');
    } finally {
        if (isset($launcher) && is_file($launcher)) {
            unlink($launcher);
        }
        if (is_dir($temporaryRoot)) {
            rmdir($temporaryRoot);
        }
    }
}

function testDockerFirstCleanCloneDoesNotRequireHostPhp(): void
{
    $root = dirname(__DIR__, 2);
    $contract = $root.'/scripts/tests/talos-clean-clone-launcher.sh';
    assertTrue(is_file($contract), 'The clean-clone launcher contract should exist.');

    exec('bash '.escapeshellarg($contract).' 2>&1', $output, $code);
    assertTrue($code === 0, "Clean-clone Docker launcher contract failed:\n".implode(PHP_EOL, $output));
}

function testRealDockerIntegrationContractIsWiredIntoCi(): void
{
    $root = dirname(__DIR__, 2);
    $integration = (string) file_get_contents($root.'/scripts/tests/talos-docker-integration.sh');
    $tokenAssignment = 'export TALOS_BROWSER_WORKER_TOKEN="$(generate_strong_token)"';
    $configInvocation = 'docker compose --profile search config';
    $tokenPosition = strpos($integration, $tokenAssignment);
    $configPosition = strpos($integration, $configInvocation);

    assertTrue(
        str_contains($integration, $tokenAssignment),
        'The Docker integration must generate a fresh strong browser-worker token.'
    );
    assertTrue(
        is_int($tokenPosition) && is_int($configPosition) && $tokenPosition < $configPosition,
        'The browser-worker token must be exported before Compose config is evaluated.'
    );
    assertTrue(
        str_contains($integration, 'openssl rand -hex 32')
        && str_contains($integration, '/dev/urandom')
        && str_contains($integration, 'A cryptographically secure random generator is required.'),
        'The Docker integration token generator must fail closed without a cryptographically secure source.'
    );

    assertDeploymentFileContains($root.'/scripts/tests/talos-docker-integration.sh', [
        'docker compose',
        'COMPOSE_PROJECT_NAME="talos-integration-$$"',
        'COMPOSE_PROFILES=search',
        'docker compose --profile search config',
        'python3 -c',
        '/search?q=talos&format=json',
        '/healthz',
        '/readyz',
        'integration-marker',
        'docker compose --profile "*" down -v --remove-orphans',
        'ps -q searxng',
        'SearXNG is still running after all-profile teardown.',
        'cp -p',
        'trap cleanup EXIT',
    ]);
    assertDeploymentFileContains($root.'/.github/workflows/ci.yml', [
        'docker-integration:',
        'talos-docker-integration.sh',
    ]);
}

function testTalosWebContainerSupervisesBothProcesses(): void
{
    $root = dirname(__DIR__, 2);
    $contract = $root.'/scripts/tests/talos-server-supervision.sh';
    assertTrue(is_file($contract), 'The TALOS web process supervision contract should exist.');

    exec('bash '.escapeshellarg($contract).' 2>&1', $output, $code);
    assertTrue($code === 0, "TALOS web process supervision contract failed:\n".implode(PHP_EOL, $output));
}

/**
 * @return array{0: string, 1: int}
 */
function runWindowsLauncher(string $launcher, array $arguments): array
{
    $quotedArguments = array_map(
        static fn (string $argument): string => '"'.str_replace('"', '""', $argument).'"',
        $arguments,
    );
    $command = 'cmd.exe /d /s /c ""'.str_replace('"', '""', $launcher).'" '.implode(' ', $quotedArguments).'"';
    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    assertTrue(is_resource($process), 'The Windows launcher process should start.');
    $output = stream_get_contents($pipes[1]).stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    return [$output, proc_close($process)];
}

function testWindowsLauncherWorksFromPathWithSpacesAndPropagatesExitCode(): void
{
    if (PHP_OS_FAMILY !== 'Windows') {
        echo "Non-Windows platform; skipping talos.cmd execution regression".PHP_EOL;

        return;
    }

    $root = dirname(__DIR__, 2);
    $temporaryRoot = sys_get_temp_dir().'/TALOS Windows Clone '.bin2hex(random_bytes(4));
    assertTrue(mkdir($temporaryRoot, 0777, true), 'Temporary Windows checkout should be created.');

    try {
        foreach (['talos', 'talos.cmd'] as $file) {
            assertTrue(copy($root.'/'.$file, $temporaryRoot.'/'.$file), "{$file} should be copied.");
        }

        [$helpOutput, $helpCode] = runWindowsLauncher($temporaryRoot.'/talos.cmd', ['--plain', 'help']);
        assertTrue($helpCode === 0, "talos.cmd help failed:\n{$helpOutput}");
        assertTrue(str_contains($helpOutput, 'talos up'), 'talos.cmd should render help from a path containing spaces.');

        [, $failureCode] = runWindowsLauncher($temporaryRoot.'/talos.cmd', ['--plain', 'not-a-command']);
        assertTrue($failureCode !== 0, 'talos.cmd must propagate the Bash launcher failure exit code.');
    } finally {
        foreach (['talos', 'talos.cmd'] as $file) {
            if (is_file($temporaryRoot.'/'.$file)) {
                unlink($temporaryRoot.'/'.$file);
            }
        }
        if (is_dir($temporaryRoot)) {
            rmdir($temporaryRoot);
        }
    }
}

function testTalosDoctorAcceptsHealthyNativeProfileWhenDockerIsMissing(): void
{
    $root = dirname(__DIR__, 2);

    exec('docker --version 2>&1', $dockerOutput, $dockerCode);
    if ($dockerCode === 0) {
        echo "Docker is available; skipping missing-Docker doctor regression".PHP_EOL;

        return;
    }

    exec('bash '.escapeshellarg($root.'/talos').' doctor 2>&1', $output, $code);
    $text = implode(PHP_EOL, $output);

    assertTrue($code === 0, 'talos doctor should succeed when the native profile is healthy.');
    assertTrue(str_contains($text, 'Docker CLI is not available'), 'talos doctor should report the unavailable Docker CLI.');
    assertTrue(str_contains($text, 'native toolchain    OK'), 'talos doctor should report the healthy native profile.');
    assertTrue(! str_contains($text, 'compose config      FAIL invalid'), 'talos doctor should not call missing Docker a compose config error.');
}

function testCoreKeepsConformanceSdkOutOfProductionRuntime(): void
{
    $root = dirname(__DIR__, 2);
    $composer = json_decode((string) file_get_contents($root.'/core/composer.json'), true, flags: JSON_THROW_ON_ERROR);

    assertTrue(! isset($composer['require']['mcp/sdk']), 'The MCP conformance SDK must not inflate the core production runtime.');
    assertTrue(($composer['require-dev']['mcp/sdk'] ?? null) === '0.6.0', 'The pinned MCP SDK should remain available to conformance tests.');
}

$tests = [
    'testRootEnvironmentContractExists',
    'testDockerComposeDefinesTalosQueueAndValidator',
    'testDockerfilesAndRootLauncherExist',
    'testTrackedLaunchersAreRelocatable',
    'testNativeToolchainBootstrapIsPinnedAndVerifiable',
    'testDockerFreshCloneIncludesEveryRuntimeWithoutMaskingMigrations',
    'testProductionBrowserWorkerCannotBeSilentlyOmitted',
    'testOptionalSearxngIntegrationIsPinnedInternalAndJsonOnly',
    'testRuntimeStateIsIgnored',
    'testRootLauncherHelpWorksFromRenamedPathWithSpaces',
    'testDockerFirstCleanCloneDoesNotRequireHostPhp',
    'testRealDockerIntegrationContractIsWiredIntoCi',
    'testTalosWebContainerSupervisesBothProcesses',
    'testWindowsLauncherWorksFromPathWithSpacesAndPropagatesExitCode',
    'testTalosDoctorAcceptsHealthyNativeProfileWhenDockerIsMissing',
    'testCoreKeepsConformanceSdkOutOfProductionRuntime',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed".PHP_EOL;
}

echo "All deployment packaging contract tests passed".PHP_EOL;
