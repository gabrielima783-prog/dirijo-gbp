import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { exportAnalysisPdf, exportPresentationPdf } from '../src/server/pdf.js';
import type { Analysis, SourceName } from '../src/shared/types.js';

function fixture(name = 'Clínica Exemplo', rating = 4): Analysis {
  const date = '2026-10-09T13:00:00Z';
  const sources: SourceName[] = ['maps','reviews','instagram','website','pagespeed','competitors','operator','ai'];
  return {
    id:'layout-fixture', status:'finalized', companyName:name,
    input:{companyName:name,mapsUrl:'https://maps.google.com/example',instagramUrl:'https://instagram.com/exemplo'},
    createdAt:date,updatedAt:date,estimatedCostUsd:0,actualCostUsd:0,costLimitUsd:1,
    sourceStatuses:Object.fromEntries(sources.map(source=>[source,{status:['maps','reviews','instagram'].includes(source)?'completed':'skipped',updatedAt:date}])) as Analysis['sourceStatuses'],
    findings:[],slides:[],assets:[],costs:[],
    evidence:[
      {id:'maps',analysisId:'layout-fixture',source:'maps',title:'Perfil',value:{title:name,totalScore:rating,reviewsCount:12},observedAt:date,confidence:1},
      {id:'reviews',analysisId:'layout-fixture',source:'reviews',title:'Avaliações',value:{sampleSize:12,ownerResponseCount:0,ownerResponseVerification:'verified'},observedAt:date,confidence:1},
      {id:'instagram',analysisId:'layout-fixture',source:'instagram',title:'Instagram',value:{username:'clinicaexemplo',biography:'Centro de estética avançada. Especialistas em pele e cuidados personalizados.',latestPosts:[],signals:{}},observedAt:date,confidence:1},
    ],
  };
}

test('layout comercial ajusta textos variáveis na prévia e no PDF sem cortar conteúdo', {timeout:60000}, async () => {
  let analysis = fixture();
  const server = await createServer({server:{port:0,strictPort:false,proxy:{}},plugins:[{
    name:'layout-fixture-api',configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        if (req.url === '/oversized') {
          res.setHeader('Content-Type','text/html');
          res.end(`<style>.page{width:810px;height:1440px;display:flex;flex-direction:column;padding:40px;box-sizing:border-box}.compact-page-content,footer,.push{flex-shrink:0}.push{flex:1;min-height:30px}p{font-size:28px}</style><main id="root">${Array.from({length:4},()=>`<section class="page" data-slide><header>Marca</header><div class="compact-page-content"><p>${'Texto excessivo para uma única página. '.repeat(150)}</p></div><div class="push"></div><footer>Rodapé</footer></section>`).join('')}</main><script type="module">import {fitCompactPages} from '/src/compact-layout.ts';fitCompactPages(document.querySelector('#root'));document.querySelector('#root').dataset.presentationReady='true';</script>`);
          return;
        }
        if (!req.url?.startsWith('/api/')) return next();
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify(req.url.includes('/auth/me')?{id:'qa',name:'QA',role:'renderer',mustChangePassword:false}:analysis));
      });
    },
  }]});
  const directory = await mkdtemp(join(tmpdir(),'gbp-layout-test-'));
  const browser = await chromium.launch({headless:true});
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls!.local[0]!;
    for (const item of [fixture(),fixture('Centro de Estética e Saúde Integrada da Região Metropolitana',4),fixture('Clínica Exemplo',5)]) {
      analysis = item;
      const page = await browser.newPage({viewport:{width:810,height:1440}});
      await page.emulateMedia({media:'print'});
      await page.goto(`${baseUrl}presentation/${item.id}?print=1&view=compact`);
      await page.waitForSelector('[data-presentation-ready="true"]');
      const pages = await page.locator('[data-slide]').evaluateAll(elements=>elements.map(element=>({
        overflow:element.scrollHeight-element.clientHeight,
        gap:element.querySelector('footer')!.getBoundingClientRect().top-element.querySelector('.compact-page-content')!.getBoundingClientRect().bottom,
        zoom:Number(getComputedStyle(element.querySelector('.compact-page-content')!).zoom),
      })));
      assert.equal(pages.length,5);
      for (const result of pages) { assert.ok(result.overflow<=2,JSON.stringify(result));assert.ok(result.gap>=12,JSON.stringify(result));assert.ok(result.zoom>=0.86); }
      assert.match(await page.locator('[data-slide="2"]').innerText(),/12 avaliações|12 das 12/);
      const pdf = await exportAnalysisPdf({analysisId:item.id,compact:true,baseUrl,outputPath:join(directory,'fixture.pdf'),expectedSlideCount:5});
      assert.ok(pdf.bytes>10000);
      await page.emulateMedia({media:'screen'});
      await page.setViewportSize({width:390,height:844});
      await page.waitForTimeout(100);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
      for (const overflow of await page.locator('[data-slide]').evaluateAll(elements=>elements.map(el=>el.scrollHeight-el.clientHeight))) assert.ok(overflow<=2);
      await page.close();
    }
    // Pathological input must still fail safely instead of disappearing in a PDF.
    await assert.rejects(exportPresentationPdf({presentationUrl:`${baseUrl}oversized`,format:'mobile',outputPath:join(directory,'invalid.pdf')}),/cortado|sobreposto/);
  } finally {
    await browser.close();await server.close();await rm(directory,{recursive:true,force:true});
  }
});
