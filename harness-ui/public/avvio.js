// src/avvio.js
(function ponteDelTema() {
  var TEMI = ["forge", "paper", "terminal", "aurora", "glacier", "ember", "atlas", "noir", "signal", "violet", "claudius", "basicus", "telemetry", "calm"];
  var VERSIONE_SCELTA = 2;
  var modo = "system";
  var tema = "calm";
  try {
    var grezzo = window.localStorage.getItem("talos.harness.desktop.settings.v1");
    if (grezzo) {
      var salvato = JSON.parse(grezzo);
      var aspetto = salvato && salvato.appearance || {};
      modo = aspetto.colorMode || "system";
      if (aspetto.themePresetVersione === VERSIONE_SCELTA && TEMI.indexOf(aspetto.themePreset) !== -1) tema = aspetto.themePreset;
    }
  } catch (errore) {
    modo = "system";
    tema = "calm";
  }
  var chiaro = modo === "light" || modo !== "dark" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  var radice = document.documentElement;
  if (chiaro) radice.setAttribute("data-theme", "light");
  radice.setAttribute("data-talos-theme", tema);
  radice.style.setProperty("color-scheme", chiaro ? "light" : "dark");
})();
function vitaDelVelo() {
  var MINIMO = 650;
  var MASSIMO = 4e3;
  var USCITA = 320;
  var velo = document.getElementById("talosAvvio");
  if (!velo) return;
  var partita = 0;
  var tolto = false;
  function accendi() {
    if (partita) return;
    partita = Date.now();
    velo.setAttribute("data-anima", "si");
  }
  function via() {
    if (tolto) return;
    tolto = true;
    velo.setAttribute("data-uscita", "si");
    setTimeout(function() {
      if (velo.parentNode) velo.parentNode.removeChild(velo);
    }, USCITA);
  }
  function quandoPronta() {
    if (!partita) accendi();
    setTimeout(via, Math.max(0, MINIMO - (Date.now() - partita)));
  }
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(accendi, { timeout: 400 });
  else setTimeout(accendi, 120);
  window.__talosAvvioPronta = quandoPronta;
  if (document.readyState === "complete") requestAnimationFrame(quandoPronta);
  else window.addEventListener("load", function() {
    requestAnimationFrame(quandoPronta);
  });
  setTimeout(via, MASSIMO);
}
if (document.getElementById("talosAvvio")) vitaDelVelo();
else document.addEventListener("DOMContentLoaded", vitaDelVelo, { once: true });
