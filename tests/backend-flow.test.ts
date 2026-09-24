import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "../src/server/db.js";
import { AnalysisRepository } from "../src/server/repository.js";
import { AnalysisService } from "../src/server/service.js";
import { assertCollectedPlaceMatchesUrl, resolveSharedGoogleMapsUrl } from "../src/server/adapters/apify.js";
import { pdfDownloadFilename } from "../src/server/app.js";

const mainPlace = {
  title: "Clínica Horizonte",
  categoryName: "Clínica odontológica",
  categories: ["Clínica odontológica"],
  address: "Rua Exemplo, 10, Vila Velha - ES",
  city: "Vila Velha",
  phone: "+55 27 99999-9999",
  website: "https://example.com",
  totalScore: 4.6,
  reviewsCount: 84,
  reviewsDistribution: { 5: 70, 1: 4 },
  reviews: [
    { reviewerName: "Nome que não pode aparecer", stars: 5, text: "Atendimento acolhedor", publishedAtDate: "2026-09-01", responseFromOwner: { text: "Obrigado" } },
    { reviewerName: "Outro nome", stars: 2, text: "Demora no retorno", publishedAtDate: "2026-08-20" },
  ],
  imageUrls: ["https://images.example/photo.jpg"],
  ownerUpdates: [{ text: "Novos horários" }],
  questionsAndAnswers: [],
  url: "https://maps.google.com/?cid=123",
};

function setup(options: { failCompetitors?: boolean; withWebsite?: boolean; withInstagram?: boolean } = {}) {
  const repository = new AnalysisRepository(createDatabase({ filename: ":memory:" }));
  const apify = {
    async collectPlace() {
      return { runId: "run-place", datasetId: "dataset-place", costUsd: 0.03, items: [{ ...mainPlace, website: options.withWebsite ? mainPlace.website : undefined }] };
    },
    async collectCompetitors() {
      if (options.failCompetitors) throw new Error("Falha simulada na comparação");
      return {
        runId: "run-competitors",
        datasetId: "dataset-competitors",
        costUsd: 0.04,
        items: [
          mainPlace,
          { ...mainPlace, title: "Sorriso Local", totalScore: 4.8, reviewsCount: 130 },
          { ...mainPlace, title: "Odonto Praia", totalScore: 4.5, reviewsCount: 55 },
        ],
      };
    },
  };
  const website = options.withWebsite ? {
    async audit(url: string) {
      return { origin: new URL(url).origin, pages: [], https: true, robots: true, sitemap: true };
    },
  } : undefined;
  const pageSpeed = options.withWebsite ? {
    async inspect() {
      return { performanceScore: 82, firstContentfulPaint: "1,2 s", largestContentfulPaint: "2,1 s", cumulativeLayoutShift: "0.02", strategy: "mobile" };
    },
  } : undefined;
  const instagram = options.withInstagram ? {
    async run(input: Record<string, unknown>) {
      assert.deepEqual(input, { usernames: ["clinica"], includeAboutSection: false });
      return {
        runId: "run-instagram", datasetId: "dataset-instagram", costUsd: 0.002,
        items: [{ username: "clinica", fullName: "Clínica Horizonte", biography: "Cuidado e agendamento pelo link", followersCount: 1200, postsCount: 90, latestPosts: [
          { url: "https://instagram.com/p/abc", caption: "Fale com nossa equipe pelo WhatsApp", timestamp: "2026-09-20T12:00:00.000Z", type: "Image", likesCount: 20 },
        ] }],
      };
    },
  } : undefined;
  const service = new AnalysisService({ repository, apify: apify as never, instagram: instagram as never, website: website as never, pageSpeed: pageSpeed as never, costLimitUsd: 1 });
  return { repository, service };
}

test("coleta Maps completa preserva evidências, custo e rascunho local quando a IA está indisponível", async () => {
  const { service } = setup();
  const created = service.create({ mapsUrl: "https://maps.app.goo.gl/abc", contactName: "Marina" });
  const result = await service.collect(created.id);

  assert.equal(result.status, "finalized");
  assert.equal(result.companyName, "Clínica Horizonte");
  assert.equal(result.sourceStatuses.maps.status, "completed", result.sourceStatuses.maps.error);
  assert.equal(result.sourceStatuses.reviews.status, "completed");
  assert.equal(result.sourceStatuses.competitors.status, "completed");
  assert.equal(result.sourceStatuses.website.status, "skipped");
  assert.equal(result.sourceStatuses.ai.status, "failed");
  assert.equal(result.slides.length, 9);
  const missingSite = result.evidence.find((item) => item.source === "website");
  assert.equal((missingSite?.value as { present?: boolean }).present, false);
  assert.equal(result.findings.find((item) => item.evidenceIds.includes(missingSite?.id ?? ""))?.priority, "important");
  assert.ok(result.findings.length >= 3);
  assert.ok(result.slides.every((slide) => slide.approved));
  assert.ok(result.findings.every((finding) => finding.approved));
  assert.ok(result.actualCostUsd > 0);
  assert.doesNotMatch(JSON.stringify(result.evidence), /Nome que não pode aparecer|Outro nome/);
  assert.match(JSON.stringify(result.evidence), /Demora no retorno/);
});

test("usa o site confirmado no formulário para auditoria e PageSpeed", async () => {
  const { service } = setup({ withWebsite: true });
  const created = service.create({ mapsUrl: "https://maps.app.goo.gl/abc", websiteUrl: "https://site-confirmado.example" });
  const result = await service.collect(created.id);

  assert.equal(result.sourceStatuses.website.status, "completed");
  assert.equal(result.sourceStatuses.pagespeed.status, "completed");
  assert.equal(result.evidence.find((item) => item.source === "pagespeed")?.sourceUrl, "https://site-confirmado.example");
  assert.equal((result.evidence.find((item) => item.source === "pagespeed")?.value as { performanceScore?: number }).performanceScore, 82);
  assert.ok(result.slides.some((slide) => slide.layout === "website"));
});

test("falha isolada mantém resultados parciais e entrega o material disponível", async () => {
  const { service } = setup({ failCompetitors: true });
  const created = service.create({ mapsUrl: "https://www.google.com/maps/place/exemplo" });
  const result = await service.collect(created.id);

  assert.equal(result.status, "finalized");
  assert.equal(result.sourceStatuses.maps.status, "completed");
  assert.equal(result.sourceStatuses.competitors.status, "failed");
  assert.ok(result.evidence.some((item) => item.source === "maps"));
  assert.equal(result.slides.length, 9);

  const retried = await service.retry(created.id, "competitors");
  assert.equal(retried.status, "finalized");
  assert.equal(retried.sourceStatuses.competitors.status, "failed");
  assert.match(retried.sourceStatuses.competitors.error ?? "", /Falha simulada/);
});

test("coleta o Instagram automaticamente a partir do link público", async () => {
  const { service } = setup({ withInstagram: true });
  const created = service.create({ mapsUrl: "https://maps.app.goo.gl/abc", instagramUrl: "https://instagram.com/clinica/" });
  const result = await service.collect(created.id);

  assert.equal(result.sourceStatuses.instagram.status, "completed");
  const instagram = result.evidence.find((item) => item.source === "instagram")?.value as { username?: string; signals?: { postsWithCallToAction?: number } };
  assert.equal(instagram.username, "clinica");
  assert.equal(instagram.signals?.postsWithCallToAction, 1);
  assert.equal(result.slides.length, 10);
  assert.ok(result.slides.some((slide) => slide.layout === "instagram"));
});

test("material nasce aprovado e continua editável depois da finalização automática", async () => {
  const { repository, service } = setup();
  const created = service.create({ mapsUrl: "https://maps.google.com/?cid=123" });
  const collected = await service.collect(created.id);
  assert.equal(collected.status, "finalized");
  assert.ok(collected.findings.every((item) => item.approved));
  assert.ok(collected.slides.every((item) => item.approved));
  repository.replaceFindings(created.id, collected.findings.map((item, index) => ({ ...item, observation: index === 0 ? "Correção opcional do operador." : item.observation, approved: false })));
  assert.equal(service.finalize(created.id).status, "finalized");
  assert.ok(service.get(created.id).findings.every((item) => item.approved));
  assert.match(service.get(created.id).findings[0]?.observation ?? "", /Correção opcional/);
  assert.deepEqual(new Set(repository.versions(created.id).map((version) => version.kind)), new Set(["created", "findings", "slides", "finalized"]));
  assert.throws(() => repository.replaceSlides(created.id, collected.slides.slice(0, 7)), /8 e 10 slides/);
});

test("exclui uma análise e todos os seus dados relacionados", () => {
  const { repository, service } = setup();
  const created = service.create({ mapsUrl: "https://maps.google.com/?cid=123" });
  assert.equal(repository.delete(created.id), true);
  assert.equal(repository.get(created.id), undefined);
  assert.equal(repository.delete(created.id), false);
});

test("nome do PDF usa empresa, data e identifica somente a versão celular", () => {
  assert.equal(pdfDownloadFilename("Lumina Estética, Saúde e Bem-estar", "2026-09-24T14:00:00.000Z", "desktop"), "LuminaEsteticaSaudeEBemEstar-24-09-26.pdf");
  assert.equal(pdfDownloadFilename("Lumina Estética, Saúde e Bem-estar", "2026-09-24T14:00:00.000Z", "mobile"), "LuminaEsteticaSaudeEBemEstar-24-09-26-Celular.pdf");
});

test("valida link do Maps e limite de quatro capturas do Instagram", () => {
  const { service } = setup();
  assert.throws(() => service.create({ mapsUrl: "https://example.com" }), /Google Maps/);
  assert.doesNotThrow(() => service.create({ mapsUrl: "https://share.google/8BAUNFPRrDDC1MXoS" }));
  assert.throws(
    () => service.create({ mapsUrl: "https://maps.app.goo.gl/abc", instagramScreenshots: ["1", "2", "3", "4", "5"] }),
    /quatro capturas/,
  );
});

test("converte share.google preservando a ficha exata do Google Maps", async () => {
  const resolved = await resolveSharedGoogleMapsUrl("https://share.google/8BAUNFPRrDDC1MXoS", async () => new Response(
    '<a href="https://www.google.com/maps/place/Aline+Almeida+Consultoria+Imobili%C3%A1ria/data=!4m2!3m1!1s0x0:0x123?sa=X&amp;hl=pt-BR">abrir</a>',
    { status: 200, headers: { "content-type": "text/html" } },
  ));
  assert.equal(resolved, "https://www.google.com/maps/place/Aline+Almeida+Consultoria+Imobili%C3%A1ria/data=!4m2!3m1!1s0x0:0x123?sa=X&hl=pt-BR");
});

test("interrompe a coleta quando o Google devolve uma empresa diferente", () => {
  const exactUrl = "https://www.google.com/maps/place/Lumina+Est%C3%A9tica,+Sa%C3%BAde+e+Bem-estar/data=!4m2!3m1!1s0x0:0x123";
  assert.doesNotThrow(() => assertCollectedPlaceMatchesUrl({ title: "Lumina Estética, Saúde e Bem-estar" }, exactUrl));
  assert.throws(
    () => assertCollectedPlaceMatchesUrl({ title: "Lumina Aesthetic & Wellness" }, exactUrl),
    /empresa diferente/,
  );
});
