<?php

declare(strict_types=1);

use App\Http\Controllers\FileIngestionController;
use App\Http\Controllers\BenchmarkComparisonController;
use Illuminate\Support\Facades\Route;

Route::post('/files/ingest', FileIngestionController::class);
Route::post('/benchmarks/compare', BenchmarkComparisonController::class);
