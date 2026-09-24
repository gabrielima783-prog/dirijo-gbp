import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

const source = resolve(process.cwd());
const requestedTarget = process.argv[2] ?? resolve(source, "../dirijo-gbp-distribuicao");
const target = isAbsolute(requestedTarget) ? requestedTarget : resolve(process.cwd(), requestedTarget);

if (target === source || target.startsWith(`${source}/`)) {
  throw new Error("A cópia de distribuição precisa ficar fora da pasta original.");
}

try {
  const existing = await stat(target);
  if (!existing.isDirectory()) {
    throw new Error(`O destino já existe e não é uma pasta: ${target}`);
  }
  if ((await readdir(target)).length > 0) {
    throw new Error(`O destino já existe e não está vazio: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await mkdir(target, { recursive: true });
const excluded = new Set([
  ".git", ".env", ".env.local", ".DS_Store", "node_modules", "data", "dist", "dist-web", "output", "tmp",
  "playwright-report", "test-results",
]);

for (const entry of await readdir(source, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  await cp(resolve(source, entry.name), resolve(target, entry.name), { recursive: true, force: true });
}

console.log(`Cópia limpa criada em ${target}`);
console.log(`Para publicar: cd ${basename(target)} && git init && git add .`);
