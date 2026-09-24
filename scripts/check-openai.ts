import { loadConfig } from "../src/server/config.js";
import { OpenAIDiagnosticClient } from "../src/server/adapters/openai.js";
import type { Evidence } from "../src/shared/types.js";

const config = loadConfig();
if (!config.openaiApiKey) throw new Error("OpenAI não configurada.");
const client = new OpenAIDiagnosticClient({ apiKey: config.openaiApiKey, model: config.openaiModel });
const baseEvidence = { analysisId: "live-check", sourceUrl: "https://maps.google.com/?cid=123", observedAt: new Date().toISOString(), confidence: 0.98 };
const evidence: Evidence[] = [
  { ...baseEvidence, id: "live-check-profile", source: "maps", title: "Estrutura pública do perfil", value: { nota: 4.6, avaliacoes: 84, descricao: "ausente" }, category: "profile" },
  { ...baseEvidence, id: "live-check-reviews", source: "reviews", title: "Avaliações e respostas", value: { sampleSize: 20, ownerResponseRate: 25, themes: [{ theme: "demora", count: 4 }] }, category: "reputation" },
  { ...baseEvidence, id: "live-check-media", source: "maps", title: "Fotos e atividade pública", value: { photoCount: 12, updateCount: 0 }, category: "media" },
];
const result = await client.generate("Empresa de validação", evidence);
process.stdout.write(JSON.stringify({
  ok: true,
  model: client.model,
  findings: result.output.findings.length,
  slides: result.output.slides.length,
  durationSeconds: result.output.slides.reduce((sum, slide) => sum + slide.durationSeconds, 0),
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  verificationApplied: result.verificationApplied,
}) + "\n");
