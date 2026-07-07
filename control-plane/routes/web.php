<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect('/chat');
});

Route::get('/chat', function () {
    return view('chat');
});

Route::get('/dashboard', function () {
    return view('welcome');
});
