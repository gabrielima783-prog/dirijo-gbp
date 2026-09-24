import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/server/config.js";

test("configuração distribuível não lê chaves de projetos vizinhos", () => {
  const root = mkdtempSync(join(tmpdir(), "dirijo-gbp-config-"));
  const projectDir = join(root, "dirijo-gbp");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(root, "mape-ia"), { recursive: true });
  writeFileSync(join(root, "mape-ia", ".env"), "OPENAI_API_KEY=chave-de-outro-projeto\n");

  try {
    const config = loadConfig(projectDir, {});
    assert.equal(config.openaiApiKey, undefined);
    assert.equal(config.apifyToken, undefined);
    assert.equal(config.pageSpeedApiKey, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
