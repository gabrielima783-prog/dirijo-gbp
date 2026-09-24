import { resolve } from "node:path";
import { createDiagnostic } from "../src/core/diagnostic.js";
import type { AssessedEvidence } from "../src/core/types.js";
import { createDatabase } from "../src/server/db.js";
import { AnalysisRepository } from "../src/server/repository.js";
import type { AnalysisInput, Evidence, SourceName } from "../src/shared/types.js";

const databaseFile = resolve(process.env.DATABASE_FILE || "data/demo.sqlite");
const repository = new AnalysisRepository(createDatabase({ filename: databaseFile }));
const demoVisual = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#091016"/><circle cx="930" cy="190" r="220" fill="#23C5C9" opacity=".85"/><rect x="100" y="120" width="610" height="520" rx="28" fill="#F1F0E9"/><rect x="155" y="190" width="420" height="28" rx="14" fill="#091016"/><rect x="155" y="250" width="310" height="14" rx="7" fill="#23C5C9"/><rect x="155" y="320" width="470" height="190" rx="18" fill="#ffffff"/><rect x="155" y="545" width="220" height="46" rx="23" fill="#FFB52B"/><path d="M885 520h110v-68l115 118-115 118v-70H885z" fill="#FFB52B"/></svg>')}`;
const input: AnalysisInput = {
  mapsUrl: "https://maps.google.com/?cid=123",
  companyName: "Clínica Horizonte",
  websiteUrl: "https://clinica.example",
  instagramUrl: "https://instagram.com/clinica",
  contactName: "Marina",
  instagramScreenshots: [demoVisual],
  instagramChecklist: {
    bio: "Especialidade e cidade aparecem com clareza.",
    positioning: "A comunicação é acolhedora, mas ainda genérica para o serviço prioritário.",
    services: "Os tratamentos aparecem principalmente em posts recentes.",
    recentContent: "Há constância, com poucos conteúdos de prova e bastidores.",
    socialProof: "Depoimentos aparecem, porém sem uma organização recorrente.",
    callToAction: "O contato existe, mas o agendamento não é apresentado como próximo passo principal.",
    bioLink: "Leva ao WhatsApp.",
    strengths: "Identidade visual consistente e equipe presente.",
    opportunities: "Dar mais destaque ao serviço prioritário e ao agendamento.",
  },
};
const analysis = repository.create(input, 0.36, 1);
repository.setCompanyName(analysis.id, input.companyName!);

const now = new Date().toISOString();
const add = (
  source: SourceName,
  title: string,
  value: unknown,
  extra: Partial<Pick<Evidence, "category" | "assessment" | "impact" | "recommendation">> = {},
) => repository.replaceEvidence(analysis.id, source, [{
  source,
  title,
  value,
  sourceUrl: source === "instagram" ? input.instagramUrl : source === "website" || source === "pagespeed" ? input.websiteUrl : input.mapsUrl,
  observedAt: now,
  confidence: source === "instagram" ? 1 : 0.95,
  ...extra,
}]);

repository.replaceEvidence(analysis.id, "maps", [
  { source: "maps", title: "Estrutura do Perfil da Empresa", value: { nota: 4.6, avaliacoes: 84, categoriaPrincipal: "Clínica odontológica", descricao: "ausente", horarios: "preenchidos" }, sourceUrl: input.mapsUrl, observedAt: now, confidence: 0.98, category: "profile", assessment: "negative", impact: "high", recommendation: "Completar a descrição e revisar categorias e serviços prioritários." },
  { source: "maps", title: "Fotos, vídeos e sinais de atividade", value: { photoCount: 23, updateCount: 1, questionCount: 0, ultimaAtualizacao: "há 7 meses", imageDataUrls: [demoVisual] }, sourceUrl: input.mapsUrl, observedAt: now, confidence: 0.95, category: "media", assessment: "negative", impact: "medium", recommendation: "Atualizar imagens e publicações com registros recentes dos serviços e da equipe." },
]);
add("reviews", "Reputação e atendimento público", {
  nota: 4.6,
  total: 84,
  recentes90Dias: 6,
  respostasRecentes: 2,
  temasPositivos: ["acolhimento", "explicação clara", "estrutura"],
  objecoes: ["demora no retorno", "dificuldade de agendamento"],
}, { category: "reputation", assessment: "negative", impact: "high", recommendation: "Criar rotina de resposta e tratar dúvidas recorrentes antes do contato." });
add("competitors", "Retrato comparativo da consulta", {
  termo: "clínica odontológica",
  local: "Vila Velha, ES",
  amostra: 5,
  negociosComMaisAvaliacoesRecentes: 3,
  negociosComRespostasMaisFrequentes: 4,
}, { category: "comparison", assessment: "neutral", impact: "medium", recommendation: "Usar a amostra como referência de atividade, sem tratar o recorte como ranking." });
add("website", "Site e caminho até o contato", {
  https: true,
  whatsapp: true,
  agendamento: false,
  paginaServicoPrioritario: false,
  analytics: { ga4: true, gtm: true, metaPixel: false },
  dadosEstruturados: false,
  screenshotDataUrl: demoVisual,
}, { category: "website", assessment: "negative", impact: "medium", recommendation: "Criar uma página específica para o serviço e tornar o agendamento o próximo passo visível." });
add("pagespeed", "Experiência mobile", { performanceScore: 61, firstContentfulPaint: "1,8 s", largestContentfulPaint: "3,4 s", cumulativeLayoutShift: "0,04" }, { category: "website", assessment: "negative", impact: "medium" });
add("instagram", "Como o Instagram conduz até o contato", {
  username: "clinica",
  fullName: "Clínica Horizonte",
  biography: "Cuidado próximo e tratamentos personalizados.",
  externalUrl: "https://wa.me/5527999999999",
  followersCount: 1820,
  postsCount: 128,
  latestPosts: [],
  signals: { sampleSize: 12, postsLast30Days: 5, postsLast90Days: 12, daysSinceLastPost: 4, reelsInSample: 5, carouselsInSample: 3, postsWithCallToAction: 2, postsWithProofSignals: 3 },
  imageDataUrls: [demoVisual],
  manual: { checklist: input.instagramChecklist, screenshots: input.instagramScreenshots },
}, { category: "instagram", assessment: "neutral", impact: "medium", recommendation: "Conectar bio, prova social e convite ao contato ao serviço prioritário." });
add("operator", "Ponto forte observado", "Identidade consistente e equipe apresentada com proximidade.", { category: "general", assessment: "positive", impact: "medium" });

const current = repository.get(analysis.id)!;
const result = createDiagnostic({
  analysisId: analysis.id,
  input,
  companyName: input.companyName,
  evidence: current.evidence as AssessedEvidence[],
  generatedAt: now,
});
repository.replaceFindings(analysis.id, result.findings.map((item, position) => ({ ...item, approved: true, position })));
repository.replaceSlides(analysis.id, result.presentation.slides.map((item, position) => ({ ...item, approved: true, position })));
for (const source of ["maps", "reviews", "competitors", "website", "pagespeed", "instagram", "operator", "ai"] as SourceName[]) repository.setSource(analysis.id, source, "completed");
repository.setStatus(analysis.id, "finalized");
process.stdout.write(`${analysis.id}\n`);
