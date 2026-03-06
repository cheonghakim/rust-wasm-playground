// app.js
import express from "express";
import crypto from "node:crypto";
import { execFile, execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "url";
import os from "node:os";
import rateLimit from "express-rate-limit";
await fs.mkdir(ROOT, { recursive: true });

const BUILD_TIMEOUT = Number(process.env.BUILD_TIMEOUT_MS || 300_000); // 5분

// wasm-pack 경로 탐색
function resolveBin(name) {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    return execSync(`${cmd} ${name}`)
      .toString()
      .split(/\r?\n/)
      .find(Boolean)
      ?.trim();
  } catch {
    return null;
  }
}
const WASM_PACK =
  process.env.WASM_PACK_PATH || resolveBin("wasm-pack") || "wasm-pack";

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Artifact serving (/artifact/<key>/out/*)
app.use(
  "/artifact",
  express.static(ROOT, {
    fallthrough: false,
    setHeaders(res, filePath) {
      // CORS 열 필요는 없지만 열어두어도 무방
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (filePath.endsWith(".wasm")) res.type("application/wasm");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

// Temporary memory store for previews
const previews = new Map();

app.post("/preview", express.text({ type: "*/*" }), (req, res) => {
  const id = crypto.randomBytes(8).toString("hex");
  previews.set(id, req.body);
  res.json({ id });
});

app.get("/preview/:id", (req, res) => {
  const html = previews.get(req.params.id);
  if (!html) return res.sendStatus(404);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Rate limiting for compilation
app.use(
  "/compile",
  rateLimit({
    windowMs: 10_000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Periodic cleanup (removes builds older than 24h)
const TTL_MS = 24 * 60 * 60 * 1000;
setInterval(async () => {
  try {
    const entries = await fs.readdir(ROOT, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(
      entries.map(async (e) => {
        if (!e.isDirectory()) return;
        const full = path.join(ROOT, e.name);
        const st = await fs.stat(full);
        if (now - st.mtimeMs > TTL_MS) {
          await fs.rm(full, { recursive: true, force: true });
        }
      }),
    );
  } catch {}
}, 60_000).unref();

// Rust formatting
app.post("/format", async (req, res) => {
  const code = req.body.code || "";
  try {
    const { stdout } = await run("rustfmt", ["--emit", "stdout"], {
      input: code,
    });
    res.json({ formatted: stdout });
  } catch {
    res.json({ formatted: code });
  }
});

// Compilation endpoint
app.post("/compile", async (req, res) => {
  try {
    let userSrc = String(req.body?.source || "").trim();
    if (!userSrc.includes("#[wasm_bindgen]")) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing #[wasm_bindgen] exports." });
    }
    if (
      userSrc.includes("#[wasm_bindgen]") &&
      !/use\s+wasm_bindgen::prelude/.test(userSrc)
    ) {
      userSrc = `use wasm_bindgen::prelude::*;\n\n${userSrc}`;
    }

    const key = crypto
      .createHash("sha256")
      .update(userSrc)
      .digest("hex")
      .slice(0, 16);

    const workDir = path.join(ROOT, key);
    const srcDir = path.join(workDir, "crate");
    const outDir = path.join(workDir, "out");

    // Cache hit
    try {
      const st = await fs.stat(path.join(outDir, "hello_wasm.js"));
      if (st.isFile()) {
        return res.json({ ok: true, baseUrl: `/artifact/${key}/out` });
      }
    } catch {}

    // Atomic build (prevent race conditions)
    const tmpDir = path.join(
      ROOT,
      `${key}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const tmpSrc = path.join(tmpDir, "crate");
    const tmpOut = path.join(tmpDir, "out");
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(path.join(tmpSrc, "src"), { recursive: true });

    // Cargo.toml
    await fs.writeFile(
      path.join(tmpSrc, "Cargo.toml"),
      `[package]
name = "hello_wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"
console_error_panic_hook = "0.1"
`,
      "utf8",
    );

    // src/lib.rs
    await fs.writeFile(path.join(tmpSrc, "src", "lib.rs"), userSrc, "utf8");

    // Run wasm-pack
    try {
      console.log("wasm-pack bin:", WASM_PACK);
      console.log("crate dir:", tmpSrc, "→ out:", tmpOut);
      await run(
        WASM_PACK,
        ["build", tmpSrc, "--release", "--target", "web", "--out-dir", tmpOut],
        { timeout: BUILD_TIMEOUT, env: { ...process.env } },
      );
    } catch (error) {
      console.error("STDERR:", error?.stderr?.toString?.() ?? error?.stderr);
      console.error("STDOUT:", error?.stdout?.toString?.() ?? error?.stdout);
      throw new Error(
        "Compile failed:\n" +
          (
            error?.stderr?.toString?.() ||
            error?.stdout?.toString?.() ||
            String(error)
          ).slice(0, 12000),
      );
    }

    // Check output
    const built = await fs
      .stat(path.join(tmpOut, "hello_wasm.js"))
      .then(() => true)
      .catch(() => false);
    if (!built) throw new Error("Build succeeded but hello_wasm.js not found.");

    // Final promotion
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(workDir), { recursive: true });
    await fs.rename(tmpDir, workDir);

    return res.json({ ok: true, baseUrl: `/artifact/${key}/out` });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "Compile failed",
      detail: String(e).slice(0, 12000),
    });
  }
});

app.listen(8787, () => console.log("compile server on :8787"));
