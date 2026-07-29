<?php

namespace App\Providers;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosDocument;
use App\Models\TalosFile;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Observers\TalosLibraryChatReferenceObserver;
use App\Observers\TalosLibrarySourceObserver;
use App\Services\FileIngestion\FileBenchmarkScenarioFactory;
use App\Services\FileIngestion\Malware\ClamAvInstreamClient;
use App\Services\FileIngestion\Malware\TalosMalwareScanner;
use App\Services\FileIngestion\Ocr\DisabledTalosOcrClient;
use App\Services\FileIngestion\Ocr\HttpDeepSeekOcrClient;
use App\Services\FileIngestion\Ocr\TalosOcrClient;
use App\Services\FileIngestion\TalosBenchmarkScenarioMaterializer;
use App\Services\FileIngestion\TalosFilePipelineHealth;
use App\Services\FileIngestion\TalosFileSidecarHealth;
use App\Services\Talos\Agent\TalosLaravelToolExecutionBackend;
use App\Services\Talos\Agent\TalosToolExecutionBackend;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerConfiguration;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserActionCapabilityIssuer;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Browser\TalosBrowserTestFixturePermit;
use App\Services\Talos\Web\UnavailableWebSearchProvider;
use App\Services\Talos\Web\WebSearchProvider;
use App\Services\Talos\Web\WebSearchProviderFactory;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Foundation\Vite;
use Illuminate\Routing\UrlGenerator;
use Illuminate\Support\ServiceProvider;
use RuntimeException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(TalosToolExecutionBackend::class, TalosLaravelToolExecutionBackend::class);
        $this->app->bind(TalosMalwareScanner::class, ClamAvInstreamClient::class);
        $this->app->bind(TalosFilePipelineHealth::class, TalosFileSidecarHealth::class);
        $this->app->bind(TalosBenchmarkScenarioMaterializer::class, FileBenchmarkScenarioFactory::class);
        $this->app->bind(TalosOcrClient::class, static fn (): TalosOcrClient => (
            config('talos-files.ocr.enabled') === true
                ? new HttpDeepSeekOcrClient
                : new DisabledTalosOcrClient
        ));

        $this->app->singleton(BrowserWorkerConfiguration::class, static function (): BrowserWorkerConfiguration {
            return new BrowserWorkerConfiguration(
                (string) config('services.talos.browser.worker_url', ''),
                (string) config('services.talos.browser.worker_token', ''),
                (bool) filter_var(config('services.talos.browser.allow_insecure_internal_transport', false), FILTER_VALIDATE_BOOL),
            );
        });

        $this->app->singleton(TalosBrowserActionCapabilityIssuer::class, static function (): TalosBrowserActionCapabilityIssuer {
            return new TalosBrowserActionCapabilityIssuer(
                (string) config('services.talos.browser.action_private_key_b64', ''),
                (string) config('services.talos.browser.action_key_id', ''),
            );
        });

        $this->app->singleton(TalosBrowserPolicy::class, static function (Application $app): TalosBrowserPolicy {
            $configuredOrigin = config('services.talos.browser.test_fixture_origin');

            return new TalosBrowserPolicy(
                fixturePermit: TalosBrowserTestFixturePermit::fromEnvironment(
                    is_string($configuredOrigin) ? $configuredOrigin : null,
                    $app->environment('testing'),
                ),
            );
        });

        $this->app->bind(BrowserSessionClient::class, function (Application $app): BrowserSessionClient {
            $configuredDriver = config('services.talos.browser.client_driver');
            $driver = is_string($configuredDriver) && trim($configuredDriver) !== ''
                ? strtolower(trim($configuredDriver))
                : ($app->environment('testing') ? 'fake' : 'http');

            if ($driver === 'fake') {
                if (! $app->environment('testing')) {
                    throw new RuntimeException('The fake TALOS browser client is restricted to the testing environment.');
                }

                return new FakeBrowserSessionClient;
            }
            if ($driver !== 'http') {
                throw new RuntimeException("Unsupported TALOS browser client driver [{$driver}].");
            }

            $configuration = $app->make(BrowserWorkerConfiguration::class);

            return new HttpBrowserSessionClient(
                $configuration->url(),
                $configuration->token(),
                15,
                $app->make(TalosBrowserActionCapabilityIssuer::class),
            );
        });
        $this->app->singleton(WebSearchProviderFactory::class, function (Application $app): WebSearchProviderFactory {
            $configuration = config('services.talos.web.search', []);

            return new WebSearchProviderFactory(
                $app->make(BrowserSessionClient::class),
                is_array($configuration) ? $configuration : [],
            );
        });
        $this->app->bind(WebSearchProvider::class, static fn (): WebSearchProvider => (
            new UnavailableWebSearchProvider('owner_context_required')
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(
        Vite $vite,
        BrowserWorkerConfiguration $browserWorker,
        UrlGenerator $urlGenerator,
    ): void
    {
        TalosFile::observe(TalosLibrarySourceObserver::class);
        TalosDocument::observe(TalosLibrarySourceObserver::class);
        TalosRunArtifact::observe(TalosLibrarySourceObserver::class);
        TalosBrowserArtifact::observe(TalosLibrarySourceObserver::class);
        TalosMessage::observe(TalosLibraryChatReferenceObserver::class);
        TalosRun::observe(TalosLibraryChatReferenceObserver::class);

        if (! $this->app->environment('local')) {
            $canonicalOrigin = rtrim((string) config('app.url'), '/');
            if ($canonicalOrigin === '') {
                throw new RuntimeException('APP_URL must define the canonical TALOS browser origin.');
            }
            $urlGenerator->useOrigin($canonicalOrigin);
        }

        $browserWorker->assertReadyFor($this->app->environment());
        if ($this->app->environment('production')) {
            $this->app->make(TalosBrowserActionCapabilityIssuer::class);
        }

        $hotFile = config('app.vite_hot_file');
        if (is_string($hotFile) && trim($hotFile) !== '') {
            $vite->useHotFile($hotFile);
        }
    }
}
