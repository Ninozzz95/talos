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
        'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64=',
        'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64=',
        'TALOS_BROWSER_ACTION_KEY_ID=',
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
        'provision_browser_action_keypair',
        'browser-action-keypair.mjs',
        'node:24.18.0-bookworm-slim',
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
        'OPENSSL_CONF',
        'openssl.cnf',
        'OPENSSL_KEYTYPE_EC',
        'prime256v1',
        'opcache.file_cache',
        'opcache.file_cache_fallback',
        'var\opcache',
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

    $requiredExtensions = $manifest['windows_x64']['required_php_extensions'] ?? null;
    assertTrue(
        is_array($requiredExtensions) && in_array('sodium', $requiredExtensions, true),
        'The pinned Windows PHP profile must enable Sodium for signed action capabilities.'
    );
}

function testDockerFreshCloneIncludesEveryRuntimeWithoutMaskingMigrations(): void
{
    $root = dirname(__DIR__, 2);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    foreach ([
        'browser-worker:',
        'context: browser-worker',
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
    assertDeploymentFileContains($root.'/browser-worker/Dockerfile', [
        'browser-worker',
        'playwright install',
        'ENV NODE_ENV=production',
        'TALOS_BROWSER_WORKER_TOKEN',
        'USER node',
        'PLAYWRIGHT_BROWSERS_PATH',
    ]);
}

function testTalosImageDefersLaravelDiscoveryUntilRuntimeConfigurationExists(): void
{
    $root = dirname(__DIR__, 2);
    $dockerfile = (string) file_get_contents($root.'/Dockerfile.talos');
    $entrypoint = (string) file_get_contents($root.'/docker/talos-entrypoint.sh');

    preg_match_all('/composer install[^\r\n]*/', $dockerfile, $composerInstallMatches);
    $composerInstalls = $composerInstallMatches[0] ?? [];
    assertTrue(count($composerInstalls) === 2, 'Dockerfile.talos should contain the two reviewed Composer installs.');
    foreach ($composerInstalls as $composerInstall) {
        assertTrue(
            str_contains($composerInstall, '--no-scripts'),
            'Every Dockerfile.talos Composer install must defer configuration-dependent scripts until runtime.'
        );
    }

    $discoveryOffset = strpos($entrypoint, 'php artisan package:discover --ansi');
    $migrationOffset = strpos($entrypoint, 'php artisan migrate --force');
    assertTrue(
        $discoveryOffset !== false && $migrationOffset !== false && $discoveryOffset < $migrationOffset,
        'The TALOS entrypoint must discover Laravel packages with runtime configuration before migrations.'
    );

    $normalizedDockerfile = strtolower($dockerfile);
    foreach ([
        'arg talos_browser_',
        'env talos_browser_',
        'copy .env',
        'copy control-plane/.env',
    ] as $forbidden) {
        assertTrue(
            ! str_contains($normalizedDockerfile, $forbidden),
            "Dockerfile.talos must not embed runtime browser configuration through {$forbidden}."
        );
    }
}

function testTalosImageRejectsHostGeneratedLaravelManifests(): void
{
    $root = dirname(__DIR__, 2);
    $dockerignore = (string) file_get_contents($root.'/.dockerignore');
    $entrypoint = (string) file_get_contents($root.'/docker/talos-entrypoint.sh');
    $cleanup = 'rm -f bootstrap/cache/packages.php bootstrap/cache/services.php';

    assertTrue(
        in_array('control-plane/bootstrap/cache/*.php', preg_split('/\R/', $dockerignore) ?: [], true),
        '.dockerignore must exclude host-generated Laravel PHP manifests from the production build context.'
    );

    $cleanupOffset = strpos($entrypoint, $cleanup);
    $discoveryOffset = strpos($entrypoint, 'php artisan package:discover --ansi');
    assertTrue(
        $cleanupOffset !== false && $discoveryOffset !== false && $cleanupOffset < $discoveryOffset,
        'The TALOS entrypoint must remove only stale Laravel package/provider manifests before runtime discovery.'
    );

    foreach ([
        'rm -rf bootstrap/cache',
        'rm -f bootstrap/cache/*',
    ] as $forbidden) {
        assertTrue(
            ! str_contains($entrypoint, $forbidden),
            "The TALOS entrypoint must not broadly delete bootstrap cache through {$forbidden}."
        );
    }
}

function testProductionBuildContextAndTalosImageReuseAreBounded(): void
{
    $root = dirname(__DIR__, 2);
    $dockerignore = (string) file_get_contents($root.'/.dockerignore');
    $ignoreLines = array_map('trim', preg_split('/\R/', $dockerignore) ?: []);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    foreach ([
        'control-plane/storage/',
        'control-plane/public/build/',
        'control-plane/tests/',
        'core/tests/',
        'validator/tests/',
        'docs/',
        'scripts/tests/',
    ] as $ignoredPath) {
        assertTrue(
            in_array($ignoredPath, $ignoreLines, true),
            ".dockerignore must exclude non-runtime build input {$ignoredPath}."
        );
    }

    foreach ([
        'browser-worker/.dockerignore' => ['node_modules/', 'tests/', 'storage/', '*.log'],
        'ocr-worker/.dockerignore' => ['.venv/', 'tests/', '__pycache__/', '.pytest_cache/', '*.py[cod]'],
    ] as $path => $requiredLines) {
        assertTrue(is_file($root.'/'.$path), "{$path} must define its owned build context.");
        $lines = array_map('trim', preg_split('/\R/', (string) file_get_contents($root.'/'.$path)) ?: []);
        foreach ($requiredLines as $requiredLine) {
            assertTrue(in_array($requiredLine, $lines, true), "{$path} must contain {$requiredLine}.");
        }
    }

    $services = [];
    foreach (['talos', 'talos-queue', 'browser-worker', 'ocr-worker'] as $serviceName) {
        assertTrue(
            (bool) preg_match('/\n  '.preg_quote($serviceName, '/').':\n(?<service>.*?)(?=\n  [a-z][a-z0-9-]*:\n|\nvolumes:)/s', $compose, $matches),
            "docker-compose.yml should contain a parseable {$serviceName} service."
        );
        $services[$serviceName] = $matches['service'];
    }

    $sharedImage = 'image: ${TALOS_APP_IMAGE:-talos-app:local}';
    assertTrue(str_contains($services['talos'], $sharedImage), 'The TALOS web service must own the shared app image name.');
    assertTrue(str_contains($services['talos'], 'pull_policy: build'), 'The TALOS web service must own the source build.');
    assertTrue(str_contains($services['talos'], 'dockerfile: Dockerfile.talos'), 'The TALOS web service must build Dockerfile.talos.');
    assertTrue(str_contains($services['talos-queue'], $sharedImage), 'The TALOS queue must consume the shared app image.');
    assertTrue(str_contains($services['talos-queue'], 'pull_policy: never'), 'The TALOS queue must not pull the locally built app image.');
    assertTrue(! str_contains($services['talos-queue'], 'build:'), 'The TALOS queue must not duplicate the app image build.');
    assertTrue(substr_count($compose, 'dockerfile: Dockerfile.talos') === 1, 'Dockerfile.talos must have exactly one Compose build owner.');

    foreach ([
        'browser-worker' => ['context: browser-worker', 'dockerfile: Dockerfile'],
        'ocr-worker' => ['context: ocr-worker', 'dockerfile: Dockerfile'],
    ] as $serviceName => $buildContract) {
        foreach ($buildContract as $needle) {
            assertTrue(str_contains($services[$serviceName], $needle), "{$serviceName} must contain {$needle}.");
        }
    }

    $talosDockerfile = (string) file_get_contents($root.'/Dockerfile.talos');
    $assetStageEnd = strpos($talosDockerfile, 'FROM php:8.5-fpm-bookworm AS talos_runtime');
    assertTrue($assetStageEnd !== false, 'Dockerfile.talos must retain a distinct frontend asset stage.');
    $assetStage = substr($talosDockerfile, 0, $assetStageEnd);
    $assetInputs = [
        'COPY control-plane/package*.json control-plane/.npmrc ./',
        'RUN npm ci --ignore-scripts',
        'COPY control-plane/vite.config.js control-plane/tsconfig.json ./',
        'COPY control-plane/patches ./patches',
        'COPY control-plane/scripts/vite-build.mjs ./scripts/vite-build.mjs',
        'COPY control-plane/resources ./resources',
        'COPY control-plane/public ./public',
        'RUN npm run build',
    ];
    $previousAssetInput = -1;
    foreach ($assetInputs as $assetInput) {
        $assetInputPosition = strpos($assetStage, $assetInput);
        assertTrue($assetInputPosition !== false, "The TALOS asset stage must contain {$assetInput}.");
        assertTrue($assetInputPosition > $previousAssetInput, "The TALOS asset stage must order {$assetInput} after its stable prerequisites.");
        $previousAssetInput = $assetInputPosition;
    }
    assertTrue(
        ! str_contains($assetStage, 'COPY control-plane ./'),
        'Backend-only control-plane source must not invalidate the TALOS frontend asset stage.'
    );

    $coreSource = strpos($talosDockerfile, 'COPY core ./core');
    $controlPlaneManifest = strpos($talosDockerfile, 'COPY control-plane/composer.json control-plane/composer.lock ./control-plane/');
    $controlPlaneInstall = strpos($talosDockerfile, 'cd control-plane && composer install');
    $controlPlaneSource = strpos($talosDockerfile, 'COPY control-plane ./control-plane');
    assertTrue(
        $coreSource !== false
        && $controlPlaneManifest !== false
        && $controlPlaneInstall !== false
        && $controlPlaneSource !== false
        && $coreSource < $controlPlaneManifest
        && $controlPlaneManifest < $controlPlaneInstall
        && $controlPlaneInstall < $controlPlaneSource,
        'Dockerfile.talos must install stable production dependencies before copying changing control-plane source.'
    );

    $validatorDockerfile = (string) file_get_contents($root.'/Dockerfile.validator');
    $validatorManifest = strpos($validatorDockerfile, 'COPY core/composer.json core/composer.lock ./core/');
    $validatorInstall = strpos($validatorDockerfile, 'cd core && composer install');
    $validatorSource = strpos($validatorDockerfile, 'COPY core ./core');
    assertTrue(
        $validatorManifest !== false
        && $validatorInstall !== false
        && $validatorSource !== false
        && $validatorManifest < $validatorInstall
        && $validatorInstall < $validatorSource,
        'Dockerfile.validator must cache core dependencies before copying changing core source.'
    );
}

function testClamAvDependencyHasAnExplicitPortableHealthcheck(): void
{
    $root = dirname(__DIR__, 2);
    $compose = (string) file_get_contents($root.'/docker-compose.yml');

    assertTrue(
        (bool) preg_match('/\n  clamav:\n(?<service>.*?)(?=\n  [a-z][a-z0-9-]*:\n|\nvolumes:)/s', $compose, $matches),
        'docker-compose.yml should contain a parseable clamav service.'
    );

    foreach ([
        'healthcheck:',
        'test: ["CMD", "/usr/local/bin/clamdcheck.sh"]',
        'interval: 30s',
        'timeout: 30s',
        'retries: 3',
        'start_period: 6m',
    ] as $needle) {
        assertTrue(
            str_contains($matches['service'], $needle),
            "The ClamAV service must declare the upstream portable healthcheck field {$needle}."
        );
    }
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

function testOptionalOcrDeploymentIsPinnedIsolatedAndDocumented(): void
{
    $root = dirname(__DIR__, 2);
    $talosDockerfile = strtolower((string) file_get_contents($root.'/Dockerfile.talos'));

    assertDeploymentFileContains($root.'/.env.example', [
        'TALOS_OCR_ENABLED=false',
        'TALOS_OCR_WORKER_TOKEN=',
        'TALOS_OCR_VLLM_API_KEY=',
        'TALOS_OCR_LIVE_HOST_PORT=13200',
        'TALOS_OCR_REQUEST_TIMEOUT_SECONDS=170',
    ]);
    assertDeploymentFileContains($root.'/.gitignore', [
        '__pycache__/',
        '*.py[codz]',
        '.pytest_cache/',
        '.venv/',
    ]);
    assertDeploymentFileContains($root.'/ocr-worker/Dockerfile', [
        'ghcr.io/astral-sh/uv:0.11.29@sha256:eb2843a1e56fd9e30c7276ce1a52cba86e64c7b385f5e3279a0e08e02dd058fc',
        'python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b',
        'uv sync --frozen --no-dev --no-install-project',
        '"--limit-concurrency", "4"',
        'USER 10001:10001',
    ]);
    foreach (['python', 'pip install', 'deepseek', 'vllm'] as $forbidden) {
        assertTrue(
            ! str_contains($talosDockerfile, $forbidden),
            "Dockerfile.talos must not contain the OCR dependency {$forbidden}."
        );
    }
    assertDeploymentFileContains($root.'/docs/deployment.md', [
        'Optional DeepSeek OCR-2 profile',
        'TALOS_OCR_ENABLED=true',
        'NVIDIA Container Toolkit',
        'docker/ocr-live.yml',
        'TALOS_OCR_LIVE=1',
        'TALOS_OCR_ENABLED=false',
        'no OCR host port',
        'one-shot model fetcher',
        'HF_HUB_OFFLINE=1',
        'read-only model snapshot',
    ]);
    assertDeploymentFileContains($root.'/docs/architecture/security-model.md', [
        'DeepSeek OCR-2',
        'fixed OCR prompt',
        'untrusted extraction evidence',
        '`--trust-remote-code` is forbidden',
        'model, runtime and renderer pin drift',
    ]);
    assertDeploymentFileContains($root.'/THIRD_PARTY_NOTICES.md', [
        'DeepSeek OCR-2',
        '2f3699ebbb96fa8af32212e8c170f2cc28730fad',
        'aaa02f3811945a91062062994c5c4a3f4c0af2b0',
        'vLLM 0.25.1',
        'sha256:e4f88a835143cd22aee2397a26ec6bb80b3a4a6fe0c882bcbc63822904766089',
        'pypdfium2 5.12.1',
        'Pillow `12.3.0`',
    ]);
}

function testRuntimeStateIsIgnored(): void
{
    $root = dirname(__DIR__, 2);

    assertDeploymentFileContains($root.'/.gitignore', [
        '.talos/',
    ]);
}

function testAdaptiveContainerRuntimeBootstrapIsPinnedAndWired(): void
{
    $root = dirname(__DIR__, 2);
    $manifestPath = $root.'/scripts/container-runtime/manifest.json';
    $manifest = json_decode((string) file_get_contents($manifestPath), true, flags: JSON_THROW_ON_ERROR);

    foreach ([
        'scripts/container-runtime/runtime.sh',
        'scripts/container-runtime/bootstrap.sh',
        'scripts/container-runtime/bootstrap-windows.ps1',
        'scripts/container-runtime/Talos.ContainerRuntime.psm1',
        'scripts/container-runtime/manifest.json',
        'scripts/tests/talos-container-runtime-adapter.sh',
        'scripts/tests/talos-container-runtime-windows.ps1',
    ] as $file) {
        assertTrue(is_file($root.'/'.$file), "{$file} should be packaged.");
    }

    assertTrue(
        ($manifest['schema_version'] ?? null) === 'talos.container-runtime.manifest.v1',
        'Container runtime manifest schema should be pinned.'
    );
    assertTrue(
        ($manifest['windows_x64']['docker_desktop']['version'] ?? null) === '4.82.0'
        && ($manifest['windows_x64']['docker_desktop']['build'] ?? null) === '233772'
        && ($manifest['windows_x64']['docker_desktop']['sha256'] ?? null) === 'a5b5837542f2f57fadbb09db90a60c84f8efc0a65f8d6dcd2e5b9fca3a2b87e6',
        'Docker Desktop artifact should remain at the reviewed pin.'
    );
    assertTrue(
        ($manifest['windows_x64']['podman']['version'] ?? null) === '6.0.1'
        && ($manifest['windows_x64']['podman']['commit'] ?? null) === '4cabbe6'
        && ($manifest['windows_x64']['podman']['sha256'] ?? null) === '127d02930ac25c80088817502e833916cd3ee1ed1e771dbd42a4ce81b2e0d415'
        && ($manifest['windows_x64']['podman']['binary_sha256'] ?? null) === '1ca3b88816a4f217d00a557c76dd279094185fda4122029b74eb5714dcef34f7'
        && ($manifest['windows_x64']['podman']['binary_bytes'] ?? null) === 45108736,
        'Podman artifact should remain at the reviewed pin.'
    );
    assertTrue(
        ($manifest['windows_x64']['compose']['version'] ?? null) === '5.1.4'
        && ($manifest['windows_x64']['compose']['commit'] ?? null) === '4732a2e'
        && ($manifest['windows_x64']['compose']['sha256'] ?? null) === 'e1a8faff28c7433635201a2222171b727f33ecdb0ed367e54d162d00432f39aa',
        'Docker Compose artifact should remain at the reviewed pin.'
    );

    assertDeploymentFileContains($root.'/talos', [
        'scripts/container-runtime/runtime.sh',
        'talos_runtime_ensure',
        'talos_runtime_require_existing',
        'talos_runtime_cli run --rm',
        'talos_runtime_compose',
        'talos_runtime_doctor',
    ]);
    assertDeploymentFileContains($root.'/.env.example', [
        'TALOS_CONTAINER_RUNTIME=auto',
        'TALOS_PODMAN_MACHINE=talos-machine',
    ]);
    assertDeploymentFileContains($root.'/README.md', [
        'adaptive container runtime',
        'No manual Docker or Podman installation is required',
        'Windows Server uses Podman Machine with Hyper-V',
        'trusted checkout',
    ]);
    assertDeploymentFileContains($root.'/docs/deployment.md', [
        'Adaptive container runtime bootstrap',
        'Docker Desktop `4.82.0` (build `233772`)',
        'Podman `6.0.1`',
        'Docker Compose `5.1.4`',
        'TALOS_CONTAINER_RUNTIME=auto',
        'TALOS_PODMAN_MACHINE=talos-machine',
        'TALOS_DOCKER_DESKTOP_LICENSE_ACCEPTED=1',
        '.tools/container-runtime',
        'restart required',
        'read-fenced',
        'Hyper-V Administrators',
    ]);
    assertDeploymentFileContains($root.'/THIRD_PARTY_NOTICES.md', [
        'Docker Desktop 4.82.0',
        'Podman 6.0.1',
        'Docker Compose 5.1.4',
        '4cabbe6',
        '4732a2e',
    ]);
    assertDeploymentFileContains($root.'/.agents/skills/talos-engineering/SKILL.md', [
        '`./talos up` is container-runtime adaptive',
        'TALOS_CONTAINER_RUNTIME=auto|docker|podman',
        'TALOS_PODMAN_MACHINE=talos-machine',
        'Automatic installation is Windows-only',
    ]);

    exec('bash '.escapeshellarg($root.'/scripts/tests/talos-container-runtime-adapter.sh').' 2>&1', $adapterOutput, $adapterCode);
    assertTrue($adapterCode === 0, "Adaptive runtime adapter contract failed:\n".implode(PHP_EOL, $adapterOutput));

    if (PHP_OS_FAMILY === 'Windows') {
        $command = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File '
            .escapeshellarg(str_replace('/', DIRECTORY_SEPARATOR, $root.'/scripts/tests/talos-container-runtime-windows.ps1'));
        exec($command.' 2>&1', $windowsOutput, $windowsCode);
        assertTrue($windowsCode === 0, "Windows runtime bootstrap contract failed:\n".implode(PHP_EOL, $windowsOutput));
    }
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
        'assert_container_env_present talos TALOS_BROWSER_ACTION_PRIVATE_KEY_B64',
        'assert_container_env_absent talos TALOS_BROWSER_ACTION_PUBLIC_KEY_B64',
        'assert_container_env_present talos-queue TALOS_BROWSER_ACTION_PRIVATE_KEY_B64',
        'assert_container_env_absent talos-queue TALOS_BROWSER_ACTION_PUBLIC_KEY_B64',
        'assert_container_env_present browser-worker TALOS_BROWSER_ACTION_PUBLIC_KEY_B64',
        'assert_container_env_absent browser-worker TALOS_BROWSER_ACTION_PRIVATE_KEY_B64',
        'assert_container_env_absent validator TALOS_BROWSER_ACTION_PRIVATE_KEY_B64',
        'assert_container_env_absent validator TALOS_BROWSER_ACTION_PUBLIC_KEY_B64',
        'assert_container_env_absent validator TALOS_BROWSER_WORKER_TOKEN',
        '/protocols/talos.browser.worker.v2/handshake',
        'service_token_and_signed_action_capability',
        'action?.algorithm!=="ES256"',
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
    'testTalosImageDefersLaravelDiscoveryUntilRuntimeConfigurationExists',
    'testTalosImageRejectsHostGeneratedLaravelManifests',
    'testProductionBuildContextAndTalosImageReuseAreBounded',
    'testClamAvDependencyHasAnExplicitPortableHealthcheck',
    'testProductionBrowserWorkerCannotBeSilentlyOmitted',
    'testOptionalSearxngIntegrationIsPinnedInternalAndJsonOnly',
    'testOptionalOcrDeploymentIsPinnedIsolatedAndDocumented',
    'testRuntimeStateIsIgnored',
    'testAdaptiveContainerRuntimeBootstrapIsPinnedAndWired',
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
