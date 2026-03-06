export class CodePlayground {
  constructor({ meta = "", title = "", fileManager, defaultFiles }) {
    this.fileManager = fileManager;
    this.defaultFiles = defaultFiles;

    this.debounce = null;
    this.libs = [];

    this.meta = meta;
    this.title = title;

    this.reqId = 0;
    this.compileTime = null;
    this.currentCompileAbort = null;

    this.els = {
      frame: document.getElementById("frame"),
      log: document.getElementById("console"),
      runBtn: document.getElementById("runBtn"),
      resetBtn: document.getElementById("resetBtn"),
      status: document.getElementById("status"),
      libUrl: document.getElementById("libUrl"),
      addLib: document.getElementById("addLib"),
      formatting: document.getElementById("formatting"),
      wrapToggle: document.getElementById("wrapToggle"),
      fontPlus: document.getElementById("fontPlus"),
      fontMinus: document.getElementById("fontMinus"),
    };

    this.scheduleRunEvt = this.scheduleRun.bind(this);
    this.runEvt = this.run.bind(this);
    this.resetEvt = this.reset.bind(this);
    this.addLibEvt = this.addLibByCdn.bind(this);
    this.onMsgEvt = this.onMsg.bind(this);
    this.onKeyDownEvt = this.onKeyDown.bind(this);
    this.onFormattingEvt = this.onFormatting.bind(this);

    // Auto-run on file changes
    this.fileManager.onChange = () => this.scheduleRun();

    this.setStarter();
    this.bindEvents();
  }

  destruct() {
    this.els?.addLib?.removeEventListener("click", this.addLibEvt);
    this.els?.runBtn?.removeEventListener("click", this.runEvt);
    this.els?.resetBtn?.removeEventListener("click", this.resetEvt);
    this.els?.formatting?.removeEventListener("click", this.onFormattingEvt);
    this.els?.wrapToggle?.removeEventListener("click", this._wrapEvt);
    this.els?.fontPlus?.removeEventListener("click", this._fontPlusEvt);
    this.els?.fontMinus?.removeEventListener("click", this._fontMinusEvt);
    window.removeEventListener("message", this.onMsgEvt);
    window.removeEventListener("keydown", this.onKeyDownEvt);

    clearTimeout(this.debounce);
    clearTimeout(this.compileTime);
    try {
      this.currentCompileAbort?.abort();
    } catch (_) {}

    this.fileManager?.destruct();
  }

  bindEvents() {
    this.els.addLib?.addEventListener("click", this.addLibEvt);
    this.els.runBtn?.addEventListener("click", this.runEvt);
    this.els.resetBtn?.addEventListener("click", this.resetEvt);
    this.els.formatting?.addEventListener("click", this.onFormattingEvt);
    window.addEventListener("keydown", this.onKeyDownEvt);

    this._wrapEvt = () => {
      const on = this.fileManager.toggleLineWrapping();
      this.updateStatus(on ? "Line wrap: ON" : "Line wrap: OFF");
    };
    this.els.wrapToggle?.addEventListener("click", this._wrapEvt);

    this._fontPlusEvt = () => {
      const sz = this.fileManager.changeFontSize(1);
      this.updateStatus(`Font: ${sz}px`);
    };
    this._fontMinusEvt = () => {
      const sz = this.fileManager.changeFontSize(-1);
      this.updateStatus(`Font: ${sz}px`);
    };
    this.els.fontPlus?.addEventListener("click", this._fontPlusEvt);
    this.els.fontMinus?.addEventListener("click", this._fontMinusEvt);
  }

  onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      this.run();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      this.fileManager.saveState();
      this.updateStatus("Saved");
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "w") {
      e.preventDefault();
      if (this.fileManager.state.activeFileId) {
        this.fileManager.closeTab(this.fileManager.state.activeFileId);
      }
      return;
    }

    if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      const ids = this.fileManager.state.openFileIds;
      if (ids.length <= 1) return;
      const idx = ids.indexOf(this.fileManager.state.activeFileId);
      const next = e.shiftKey
        ? (idx - 1 + ids.length) % ids.length
        : (idx + 1) % ids.length;
      this.fileManager.switchToFile(ids[next]);
      return;
    }
  }

  onMsg(e) {
    const data = e.data || {};
    if (!data.__mini) return;

    const msg = (data.args || [])
      .map((v) => {
        if (typeof v === "string") return v;
        try {
          return JSON.stringify(v, null, 2);
        } catch {
          return String(v);
        }
      })
      .join(" ");
    this.print(
      data.type === "warn" ? "warn" : data.type === "error" ? "error" : "log",
      msg,
    );
  }

  addLibByCdn() {
    const u = this.els.libUrl?.value?.trim();
    if (!u) return;
    try {
      new URL(u, window.location.href);
    } catch {
      this.print("warn", "Invalid URL");
      return;
    }
    if (!this.libs.includes(u)) this.libs.push(u);
    if (this.els.libUrl) this.els.libUrl.value = "";
    this.scheduleRun();
  }

  setStarter() {
    if (!this.fileManager.state) {
      this.fileManager.initWithDefaults(this.defaultFiles);
    }

    this.libs = Array.isArray(this.fileManager.state.libs)
      ? this.fileManager.state.libs
      : [];

    this.updateStatus("Ready");
    this.scheduleRun();
  }

  async onFormatting() {
    if (
      typeof prettier === "undefined" ||
      typeof prettierPlugins === "undefined"
    ) {
      this.print("warn", "Prettier not loaded.");
      return;
    }

    try {
      for (const fileId of this.fileManager.state.openFileIds) {
        const cm = this.fileManager.editors.get(fileId);
        if (!cm) continue;
        const file = this.fileManager.getFile(fileId);
        if (!file) continue;

        const ext = this.fileManager.getExtension(file.name);
        const meta = this.fileManager.getMetaForFile(file.name);

        if (ext === ".rs") {
          await this.formatRust(cm);
          continue;
        }

        if (!meta.prettierParser) continue;

        const src = cm.getValue();
        const formatted = await prettier.format(src, {
          parser: meta.prettierParser,
          plugins: prettierPlugins,
          tabWidth: 2,
          semi: true,
          singleQuote: true,
        });

        cm.operation(() => {
          const sel = cm.listSelections();
          const scroll = {
            left: cm.getScrollInfo().left,
            top: cm.getScrollInfo().top,
          };
          cm.setValue(formatted);
          try {
            cm.setSelections(sel);
          } catch (_) {}
          cm.scrollTo(scroll.left, scroll.top);
        });
      }
    } catch (error) {
      this.print("error", error?.message ?? String(error));
    }
  }

  async formatRust(cm) {
    if (!cm) return;
    try {
      const src = cm.getValue();
      const res = await fetch("/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: src }),
      });
      const { formatted } = await res.json();
      if (typeof formatted === "string") {
        cm.setValue(formatted);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async compileAndLoad(rustSource) {
    const myId = ++this.reqId;
    this.updateStatus("Compiling…");

    try {
      this.currentCompileAbort?.abort();
    } catch (_) {}
    const ctrl = new AbortController();
    this.currentCompileAbort = ctrl;

    const res = await fetch("/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: rustSource }),
      signal: ctrl.signal,
    });

    const j = await res.json();
    if (myId !== this.reqId) return;
    if (!j.ok) throw new Error(j.error || "Compile failed");
    this.updateStatus("Done");
    return j;
  }

  updateStatus(msg) {
    if (this.els.status) this.els.status.textContent = msg;
  }

  scheduleRun() {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(this.run.bind(this), 500);
    this.updateStatus("Building…");
  }

  makePreviewHTML(html, css, js, rust, externalScripts = []) {
    const escScript = (s) => (s || "").replace(/<\/(script)/gi, "<\\/$1>");
    const escAttr = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );

    const libs = (
      Array.isArray(externalScripts) ? externalScripts : [externalScripts]
    )
      .filter(Boolean)
      .map((src) => `<script src="${src}"><\/script>`)
      .join("\n");

    const rustModuleBlock = (() => {
      if (!rust || !rust.baseUrl) return "";
      const exposeAs = rust.exposeAs || "__rust";
      const initName = rust.initName || "default";
      const modUrl = `${rust.baseUrl}/hello_wasm.js?v=${Date.now()}`;
      const wasmUrl = `${rust.baseUrl}/hello_wasm_bg.wasm?v=${Date.now()}`;

      return `
        // Rust module loader
        window.__rust = undefined;
        window.__rustReady = (async () => {
          try {
            const m = await import("${modUrl}");
            const __init =
              (typeof m["${initName}"] === "function") ? m["${initName}"] :
              (typeof m.default === "function") ? m.default :
              m.init;
            if (typeof __init === "function") {
              try { await __init(); }
              catch { await __init(new URL("${wasmUrl}", window.location.href)); }
            }
            window["${exposeAs}"] = m;
            window.__rust = m;
            return m;
          } catch (e) {
            console.error(e);
            document.body.insertAdjacentHTML(
              "beforeend",
              '<pre style="color:#f55">'+ String(e).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s])) +'</pre>'
            );
            throw e;
          }
        })();
      `;
    })();

    return `<!doctype html>
  <html>
  <head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta itemprop="description" content="${escAttr(this.meta)}" />
  <title>${escAttr(this.title)}</title>
  <style>${css || ""}</style>
  ${libs}
  </head>
  <body>
  ${html || ""}

  <!-- 콘솔/에러 브리지 -->
  <script>
  (function(){
    function safeToString(v) {
      if (v === null) return "null";
      const t = typeof v;
      if (t === "string" || t === "number" || t === "boolean") return String(v);
      if (t === "undefined") return "undefined";
      if (t === "symbol") { try { return v.toString(); } catch(_) { return "Symbol"; } }
      if (t === "bigint") { try { return v.toString() + "n"; } catch(_) { return "bigint"; } }
      if (t === "function") return "[Function" + (v.name ? " " + v.name : "") + "]";
      if (v instanceof Error) return v.stack || v.message || String(v);
      try {
        const seen = new WeakSet();
        return JSON.stringify(v, function (_k, val) {
          if (val && typeof val === "object") {
            if (seen.has(val)) return "[Circular]";
            seen.add(val);
          }
          if (typeof val === "function") return "[Function" + (val.name ? " " + val.name : "") + "]";
          if (typeof val === "symbol") { try { return val.toString(); } catch (_) { return "Symbol"; } }
          if (typeof val === "bigint") { try { return val.toString() + "n"; } catch (_) { return "bigint"; } }
          return val;
        });
      } catch (_) {
        try { return String(v); } catch (_) { return Object.prototype.toString.call(v); }
      }
    }

    function send(type, args){
      try {
        const arr = Array.from(args).map(safeToString);
        try {
          parent.postMessage({ __mini: true, type, args: arr }, '*');
        } catch (_) {}
      } catch (_) {}
    }

    ['log','info','warn','error'].forEach(k=>{
      const orig = (typeof console !== 'undefined' && console[k] && console[k].bind(console)) || function(){};
      console[k] = function(){
        try { send(k, arguments); } catch(_) {}
        try { return orig.apply(console, arguments); } catch(_) {}
      };
    });

    window.addEventListener('error', e=>{
      try {
        const message = (e && (e.message || (e.error && e.error.message))) || 'Error';
        const filename = (e && (e.filename || '')) || '';
        const lineno = (e && (e.lineno || '')) || '';
        const stack = (e && e.error && e.error.stack) ? e.error.stack : '';
        const payload = message + '\\n' + filename + ':' + lineno + '\\n' + stack;
        try { parent.postMessage({ __mini:true, type:'error', args:[payload] }, '*'); } catch(_) {}
      } catch (_) {}
    });
  })();
  <\/script>

  <!-- 사용자 JS -->
  <script type="module">
    (async () => {
      ${rustModuleBlock}
      if (window.__rustReady && typeof window.__rustReady.then === "function") {
        try { await window.__rustReady; } catch(e) { }
      }
      ${escScript(js)}
    })();
  <\/script>

  </body></html>`;
  }

  clearConsole() {
    if (this.els.log) {
      this.els.log.innerHTML = "";
    }
  }

  print(kind, text) {
    if (!this.els.log) return;
    const div = document.createElement("div");
    div.className = kind;
    div.textContent = text;
    this.els.log.appendChild(div);
    this.els.log.scrollTop = this.els.log.scrollHeight;
  }

  async run() {
    this.fileManager.syncAllEditors();

    this.fileManager.state.libs = this.libs;
    this.fileManager.saveState();
    this.clearConsole();

    clearTimeout(this.compileTime);
    this.compileTime = setTimeout(async () => {
      try {
        const snapshot = this.fileManager.getAllFilesSnapshot();

        let rustRes = null;
        if (snapshot.rs.length > 0) {
          const primaryRs =
            snapshot.rs.find((f) => f.name === "lib.rs") || snapshot.rs[0];
          const rustSrc = primaryRs.content.trim();
          if (rustSrc) {
            rustRes = await this.compileAndLoad(rustSrc);
          }
        }

        const combinedHtml = snapshot.html.map((f) => f.content).join("\n");
        const combinedCss = snapshot.css.map((f) => f.content).join("\n");
        const combinedJs = snapshot.js.map((f) => f.content).join("\n");

        const html = this.makePreviewHTML(
          combinedHtml,
          combinedCss,
          combinedJs,
          rustRes,
          this.libs,
        );

        const r = await fetch("/preview", { method: "POST", body: html });
        const { id } = await r.json();
        if (!id) throw new Error("Preview endpoint failed");
        if (this.els.frame) {
          this.els.frame.src = `/preview/${id}`;
        }
        this.updateStatus("Running");
      } catch (err) {
        this.print("error", err?.message || String(err));
        this.updateStatus("Preview failed");
      }
    }, 400);
  }

  reset() {
    try {
      localStorage.removeItem(this.fileManager.constructor.STORAGE_KEY);
    } catch (_) {}
    this.libs = [];
    this.fileManager.resetToDefaults(this.defaultFiles);
    this.clearConsole();
    this.updateStatus("Ready");
    this.scheduleRun();
  }
}
