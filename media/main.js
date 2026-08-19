(function () {
  const vscode = acquireVsCodeApi();
  const statusEl = document.getElementById("status");

  function setStatus(text, color) {
    statusEl.textContent = text;
    if (color) {
      statusEl.style.color = color;
    }
  }

  function report(msg) {
    vscode.postMessage({ type: "error", message: String(msg) });
    setStatus("ERROR: " + msg, "#f14c4c");
  }

  window.addEventListener("error", function (e) {
    report(e.message || "unknown error");
  });
  window.addEventListener("unhandledrejection", function (e) {
    report(e.reason);
  });

  if (typeof Terminal === "undefined") {
    report("xterm.js did not load");
    return;
  }
  if (typeof FitAddon === "undefined" || !FitAddon.FitAddon) {
    report("addon-fit.js did not load");
    return;
  }

  var term;
  try {
    term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      scrollback: 10000,
      fontFamily: "Consolas, 'Courier New', monospace",
      theme: { background: "#1e1e1e", foreground: "#d4d4d4" }
    });
    var fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(document.getElementById("terminal"));
    fit.fit();
  } catch (err) {
    report(err && err.message ? err.message : err);
    return;
  }

  term.onData(function (data) {
    vscode.postMessage({ type: "input", data: data });
  });

  var el = document.getElementById("terminal");
  el.addEventListener("click", function () {
    term.focus();
  });
  term.focus();

  window.addEventListener("message", function (event) {
    var msg = event.data;
    switch (msg.type) {
      case "data":
        term.write(msg.data);
        break;
      case "status":
        setStatus(msg.text, msg.color);
        break;
      case "exit":
        term.write("\r\n\x1b[31m[opencode exited]\x1b[0m\r\n");
        setStatus("opencode exited (code " + msg.exitCode + ")", "#e2c08d");
        break;
    }
  });

  var reportSize = function () {
    vscode.postMessage({ type: "resize", cols: term.cols, rows: term.rows });
  };
  new ResizeObserver(reportSize).observe(el);
  reportSize();

  setStatus("opencode connected — waiting for output\u2026");
  vscode.postMessage({ type: "ready" });
})();