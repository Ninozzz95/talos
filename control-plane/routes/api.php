<?php

declare(strict_types=1);

use App\Http\Controllers\FileIngestionController;
use App\Http\Controllers\BenchmarkComparisonController;
use App\Http\Controllers\FaultExplainerController;
use App\Http\Controllers\TalosChatController;
use App\Http\Controllers\TraceReplayController;
use Illuminate\Support\Facades\Route;

Route::post('/talos/chat', TalosChatController::class);
Route::post('/files/ingest', FileIngestionController::class);
Route::post('/benchmarks/compare', BenchmarkComparisonController::class);
Route::post('/faults/explain', FaultExplainerController::class);
Route::post('/traces/replay', TraceReplayController::class);
