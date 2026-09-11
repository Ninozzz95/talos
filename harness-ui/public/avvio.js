// src/avvio.js
(function ponteDelTema() {
  var modo = "system";
  try {
    var grezzo = window.localStorage.getItem("talos.harness.desktop.settings.v1");
    if (grezzo) {
      var salvato = JSON.parse(grezzo);
      modo = salvato && salvato.appearance && salvato.appearance.colorMode || "system";
    }
  } catch (errore) {
    modo = "system";
  }
  var chiaro = modo === "light" || modo !== "dark" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  var radice = document.documentElement;
  if (chiaro) radice.setAttribute("data-theme", "light");
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
