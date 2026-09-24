import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

export type PresentationFormat = 'desktop' | 'mobile';

export interface PdfExportOptions {
  presentationUrl: string;
  outputPath: string;
  format?: PresentationFormat;
  expectedSlideCount?: number;
  timeoutMs?: number;
}

export interface AnalysisPdfExportOptions {
  analysisId: string;
  outputPath: string;
  baseUrl?: string;
  format?: PresentationFormat;
  expectedSlideCount?: number;
  timeoutMs?: number;
}

export interface PdfExportResult {
  outputPath: string;
  slideCount: number;
  bytes: number;
}

function validateLocalPresentationUrl(value: string): URL {
  const url = new URL(value);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!localHosts.has(url.hostname)) {
    throw new Error('O PDF só pode ser gerado a partir do painel local');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('A rota de apresentação precisa usar HTTP');
  }
  return url;
}

function validateOutputPath(outputPath: string): void {
  if (path.extname(outputPath).toLowerCase() !== '.pdf') {
    throw new Error('O arquivo de saída precisa usar a extensão .pdf');
  }
}

async function waitForPresentation(page: import('playwright').Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    await Promise.all(
      images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      }),
    );
  });
}

async function validateRenderedSlides(
  page: import('playwright').Page,
  format: PresentationFormat,
  expectedSlideCount?: number,
): Promise<number> {
  const slideLocator = page.locator('[data-slide]');
  const slideCount = await slideLocator.count();
  if (slideCount < 8 || slideCount > 10) {
    throw new Error(`A apresentação renderizada precisa ter entre 8 e 10 slides; recebeu ${slideCount}`);
  }
  if (expectedSlideCount !== undefined && slideCount !== expectedSlideCount) {
    throw new Error(`A apresentação renderizou ${slideCount} slides; eram esperados ${expectedSlideCount}`);
  }

  for (let index = 0; index < slideCount; index += 1) {
    const slide = slideLocator.nth(index);
    const box = await slide.boundingBox();
    if (!box || box.width < 800 || box.height < 450) {
      throw new Error(`O slide ${index + 1} não possui dimensões suficientes para exportação`);
    }
    const expectedRatio = format === 'mobile' ? 9 / 16 : 16 / 9;
    const ratio = box.width / box.height;
    if (Math.abs(ratio - expectedRatio) > 0.035) {
      throw new Error(`O slide ${index + 1} não está no formato ${format === 'mobile' ? '9:16' : '16:9'}`);
    }
    const overflow = await slide.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    if (overflow.horizontal > 2 || overflow.vertical > 2) {
      throw new Error(`O slide ${index + 1} possui conteúdo cortado ou fora da página`);
    }
  }
  return slideCount;
}

async function validateWrittenPdf(outputPath: string): Promise<number> {
  const info = await stat(outputPath);
  if (info.size < 10_000) throw new Error('O PDF gerado está vazio ou incompleto');
  const header = await readFile(outputPath).then((file) => file.subarray(0, 5).toString('ascii'));
  if (header !== '%PDF-') throw new Error('O arquivo exportado não possui um cabeçalho PDF válido');
  return info.size;
}

export async function exportPresentationPdf(options: PdfExportOptions): Promise<PdfExportResult> {
  const presentationUrl = validateLocalPresentationUrl(options.presentationUrl);
  validateOutputPath(options.outputPath);
  const format = options.format ?? 'desktop';
  const pageSize = format === 'mobile'
    ? { width: '1080px', height: '1920px', viewport: { width: 1080, height: 1920 } }
    : { width: '13.333333in', height: '7.5in', viewport: { width: 1280, height: 720 } };
  const timeoutMs = options.timeoutMs ?? 45_000;
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: pageSize.viewport,
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(timeoutMs);
    await page.emulateMedia({ media: 'print', colorScheme: 'light', reducedMotion: 'reduce' });
    const response = await page.goto(presentationUrl.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    if (!response?.ok()) {
      throw new Error(`A rota da apresentação respondeu com HTTP ${response?.status() ?? 'desconhecido'}`);
    }

    await waitForPresentation(page, timeoutMs);
    const slideCount = await validateRenderedSlides(page, format, options.expectedSlideCount);
    await page.addStyleTag({
      content: `
        @page { size: ${pageSize.width} ${pageSize.height}; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
        [data-slide] {
          width: ${pageSize.width} !important;
          height: ${pageSize.height} !important;
          min-width: ${pageSize.width} !important;
          min-height: ${pageSize.height} !important;
          max-width: ${pageSize.width} !important;
          max-height: ${pageSize.height} !important;
          overflow: hidden !important;
          break-after: page !important;
          page-break-after: always !important;
          box-shadow: none !important;
        }
        [data-slide]:last-child { break-after: auto !important; page-break-after: auto !important; }
      `,
    });
    await page.pdf({
      path: options.outputPath,
      width: pageSize.width,
      height: pageSize.height,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true,
    });
    const bytes = await validateWrittenPdf(options.outputPath);
    return { outputPath: options.outputPath, slideCount, bytes };
  } finally {
    await browser.close();
  }
}

export async function exportAnalysisPdf(options: AnalysisPdfExportOptions): Promise<PdfExportResult> {
  const baseUrl = options.baseUrl ?? 'http://127.0.0.1:8787';
  const format = options.format ?? 'desktop';
  const presentationUrl = new URL(
    `/presentation/${encodeURIComponent(options.analysisId)}?print=1&format=${format}`,
    baseUrl,
  ).toString();
  return exportPresentationPdf({
    presentationUrl,
    outputPath: options.outputPath,
    format,
    ...(options.expectedSlideCount === undefined
      ? {}
      : { expectedSlideCount: options.expectedSlideCount }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
}
