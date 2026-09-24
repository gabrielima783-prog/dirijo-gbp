# Dirijo GBP

Painel local para transformar dados públicos do Perfil da Empresa no Google, site e Instagram em um diagnóstico comercial revisável, uma apresentação 16:9 e um PDF da Dirijo.

## O que a primeira versão entrega

- histórico local em SQLite, com duplicação e reabertura;
- coleta do Google Maps e avaliações pelo ator `compass/crawler-google-places` da Apify;
- retrato comparativo de até cinco negócios semelhantes, sem alegação de ranking;
- auditoria opcional do site, PageSpeed mobile e captura visual;
- coleta automática do perfil e das publicações recentes do Instagram pelo ator `apify/instagram-profile-scraper`;
- checklist e até quatro capturas opcionais para complementar a leitura automática do Instagram;
- diagnóstico com OpenAI Responses API, `store: false` e JSON Schema estrito;
- análise em duas etapas: uma chamada gera os achados e uma segunda chamada compacta confere evidências, exageros e linguagem;
- slides montados localmente a partir dos achados verificados, sem depender de identificadores inventados pela IA;
- narrativa comercial em linguagem simples: o que foi encontrado, por que pode custar oportunidades, como deveria estar e qual direção seguir;
- rascunho local de contingência quando a IA falhar;
- achados, slides e PDFs aprovados e finalizados automaticamente;
- editor opcional para corrigir, ocultar, reordenar ou regenerar somente quando necessário;
- apresentação limpa, modo apresentador sincronizado e PDF 16:9;
- registro de execução, tokens, custos e falhas por fonte.

Não usa DataForSEO, grid 5x5, posição exata, CRM, envio automático nem consulta automática a bibliotecas de anúncios. Tags e pixels públicos do site são identificados, mas não são tratados como prova de anúncio ativo.

## Requisitos

- Node.js 24 a 26;
- token da Apify;
- chave da OpenAI;
- Chromium do Playwright para capturas e PDF.

## Instalação

### Instalação recomendada para outra máquina

O projeto é um painel local. Não precisa de VPS, Docker ou aplicativo instalado no sistema.

Mac ou Linux:

```bash
git clone https://github.com/gabrielima783-prog/dirijo-gbp.git && cd dirijo-gbp && chmod +x scripts/instalar.sh && ./scripts/instalar.sh && npm start
```

Windows PowerShell:

```powershell
git clone https://github.com/gabrielima783-prog/dirijo-gbp.git; cd dirijo-gbp; powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1; npm start
```

Depois abra `http://127.0.0.1:8787`. O navegador é local e os dados ficam somente no computador que executou o projeto.

O instalador verifica Node.js 24, 25 ou 26, instala as dependências, baixa o Chromium do Playwright e gera o painel. Ele não cria, copia ou procura credenciais em outras pastas.

### Instalação manual

```bash
npm install
npx playwright install chromium
cp .env.example .env.local
```

Preencha as variáveis no `.env.local` ou, de preferência, use a aba **Configurações** do painel. O projeto lê somente o ambiente do processo e os arquivos `.env` e `.env.local` da própria pasta. Segredos nunca são exibidos no painel ou nos logs.

Depois de abrir o painel, também é possível configurar Apify, OpenAI e Google PageSpeed na aba **Configurações**. As credenciais são cifradas no próprio computador, aparecem apenas mascaradas e entram em uso assim que forem salvas. As variáveis de ambiente continuam funcionando como alternativa.

## Rodar localmente

```bash
npm run dev
```

- painel: `http://127.0.0.1:5173`;
- API: `http://127.0.0.1:8787`;
- diagnóstico de configuração: `http://127.0.0.1:8787/api/health`.

Para executar o build único, com painel e API no mesmo endereço:

```bash
npm run build
npm start
```

Abra `http://127.0.0.1:8787`.

## Fluxo de uso

1. Crie uma análise com o link do Maps e, quando houver, informe o site correto e o Instagram.
2. Confira a estimativa antes de iniciar a coleta.
3. Acompanhe cada fonte. Uma falha não remove resultados já coletados.
4. Abra diretamente a apresentação ou baixe o PDF 16:9 e o PDF para celular.
5. Se algo precisar de ajuste, use **Corrigir conteúdo**, salve e exporte novamente.

O limite padrão é US$ 1 por análise. Acima dele, a continuação exige confirmação explícita no painel.

São aceitos links completos do Google Maps, links curtos `maps.app.goo.gl` e links de compartilhamento `share.google`. Estes últimos são convertidos automaticamente em uma busca válida do Maps antes da coleta.

A apresentação usa de 8 a 10 páginas: base do Google, páginas opcionais de site e Instagram, prioridades específicas e um convite final para conversa com a Dirijo. Vermelho identifica correção confirmada, amarelo indica atenção ou oportunidade e verde destaca ponto forte.

## Validação

```bash
npm run check
npm run check:openai
```

O primeiro comando executa build, contratos visuais e testes de backend. O segundo faz uma chamada real e pequena à OpenAI para confirmar credencial, Structured Outputs e duração do roteiro.

Para visualizar um exemplo sem gastar Apify ou OpenAI:

```bash
DATABASE_FILE=./data/demo.sqlite npm run demo:seed
DATABASE_FILE=./data/demo.sqlite npm start
```

O guia operacional completo está em [GUIA-CONFIGURACAO-E-PERSONALIZACAO.md](GUIA-CONFIGURACAO-E-PERSONALIZACAO.md). Ele explica as APIs, as fontes de custo, o que pode ser alterado com ChatGPT ou Claude e os limites que não devem ser quebrados.

## Dados e privacidade

Tudo fica em `data/` no computador. A apresentação não leva nomes, avatares ou URLs pessoais de avaliadores. Imagens coletadas, capturas do site, logo e prints manuais são incorporados para continuarem disponíveis durante a apresentação mesmo sem internet.

O produto compara apenas a amostra consultada, registrando termo, local e data. Ele não afirma posição exata, não inventa perda financeira e não promete efeito causal sobre ranking. O texto traduz sinais técnicos para o impacto que uma pessoa leiga consegue entender.

## API local

- `POST /api/analyses`
- `POST /api/analyses/:id/collect`
- `PUT /api/analyses/:id/findings`
- `PUT /api/analyses/:id/slides`
- `POST /api/analyses/:id/slides/:slideId/regenerate`
- `POST /api/analyses/:id/finalize`
- `GET /api/analyses/:id/presentation`
- `GET /api/analyses/:id/versions`
- `GET /api/analyses/:id/pdf?format=desktop` exporta a apresentação 16:9
- `GET /api/analyses/:id/pdf?format=mobile` exporta a apresentação vertical 9:16 em 1080 × 1920
- `POST /api/analyses/:id/retry/:source`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/settings/test/:provider`
