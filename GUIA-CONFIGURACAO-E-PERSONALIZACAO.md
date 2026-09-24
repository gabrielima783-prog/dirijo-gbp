# Guia de configuração e personalização do Dirijo GBP

Este arquivo é para quem vai instalar o painel em outra máquina ou pedir alterações para ChatGPT, Claude ou outra IA de programação.

## O que é entregue

O Dirijo GBP roda localmente em `127.0.0.1`. A pessoa clona o repositório, instala as dependências, coloca as próprias chaves e abre o painel no navegador. Não há login, hospedagem, VPS, banco remoto ou envio automático para clientes.

Cada computador cria os próprios arquivos em `data/`. O banco, as imagens coletadas, os PDFs exportados e as chaves salvas no painel não entram no repositório.

## Pré-requisitos

- Node.js 24, 25 ou 26;
- Git;
- acesso à internet durante a instalação e as coletas;
- uma conta da Apify para Maps e Instagram;
- uma chave da OpenAI para o diagnóstico em linguagem natural;
- uma chave do Google PageSpeed apenas quando quiser medir o site com a API do PageSpeed.

## Instalação

### Mac ou Linux

O instalador verifica o Node.js. Se ele não existir, tenta instalar automaticamente usando Homebrew, `apt`, `dnf` ou `pacman`. Se o computador não tiver um desses gerenciadores, ele informa o endereço oficial para instalação.

```bash
git clone https://github.com/gabrielima783-prog/dirijo-gbp.git
cd dirijo-gbp
chmod +x scripts/instalar.sh
./scripts/instalar.sh
npm start
```

Abra `http://127.0.0.1:8787`.

### Windows PowerShell

O instalador verifica o Node.js. Se ele não existir, tenta instalar automaticamente usando `winget`, Chocolatey ou Scoop. Em alguns computadores o Windows atualiza o PATH somente depois de fechar e abrir o PowerShell novamente.

```powershell
git clone https://github.com/gabrielima783-prog/dirijo-gbp.git
cd dirijo-gbp
powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
npm start
```

Para encerrar, use `Ctrl+C`. Para atualizar uma instalação existente:

```bash
git pull
npm ci
npm run build
npm start
```

O Git ainda precisa existir antes do primeiro `git clone`, porque é ele que baixa o projeto. No Windows, pode ser instalado com `winget install --id Git.Git --exact`; no Mac, o macOS normalmente oferece as ferramentas de desenvolvimento quando o comando `git` é usado pela primeira vez.

## Chaves e serviços

O painel usa três integrações:

| Serviço | Uso | Obrigatória? | Onde configurar |
| --- | --- | --- | --- |
| Apify | Perfil do Google Maps, avaliações, comparação local e perfil público do Instagram | Sim para coleta completa | Configurações ou `APIFY_TOKEN` |
| OpenAI | Achados, explicações, roteiro e revisão automática da linguagem | Sim para diagnóstico com IA | Configurações ou `OPENAI_API_KEY` |
| Google PageSpeed | Medição mobile do site informado | Opcional | Configurações ou `PAGESPEED_API_KEY` |

Os atores padrão são `compass/crawler-google-places` e `apify/instagram-profile-scraper`. Eles podem ser trocados na aba Configurações por uma pessoa que saiba exatamente o formato de saída esperado pelo projeto.

### Pela aba Configurações

1. Abra o painel.
2. Entre em **Configurações**.
3. Cole o token da Apify, a chave da OpenAI e, se quiser PageSpeed, a chave do Google.
4. Salve e use o botão de teste de cada serviço.

As chaves salvas pelo painel são cifradas em `data/settings.enc` e a chave local fica em `data/settings.key`. Esses arquivos nunca devem ser enviados ao GitHub.

### Por arquivo `.env.local`

Copie o modelo:

```bash
cp .env.example .env.local
```

Preencha:

```dotenv
HOST=127.0.0.1
PORT=8787
APIFY_TOKEN=cole_o_token_da_apify
OPENAI_API_KEY=sk-cole_a_chave_da_openai
OPENAI_MODEL=gpt-5-mini
PAGESPEED_API_KEY=cole_a_chave_google_se_for_usar
ANALYSIS_COST_LIMIT_USD=1
```

O carregador lê apenas variáveis do processo e `.env` ou `.env.local` da própria pasta do projeto. Ele não reaproveita chaves de `mape-ia`, `motor-prospeccao` ou qualquer projeto vizinho.

## Como o diagnóstico é gerado

1. O operador informa o Maps e, se existir, o site e o Instagram.
2. A Apify coleta fatos públicos e o site é auditado localmente.
3. O sistema salva as evidências no SQLite antes de pedir interpretação.
4. A aplicação envia para a OpenAI um resumo enxuto dos fatos, exemplos de avaliações sem identidade e os IDs das evidências.
5. A primeira chamada monta os achados. A segunda confere evidências, exageros e linguagem.
6. As regras locais eliminam identificadores inválidos, termos técnicos e afirmações sem suporte.
7. Os slides e o PDF são montados no próprio computador. A apresentação já nasce aprovada, mas pode ser corrigida no editor.

A OpenAI não recebe o banco inteiro nem precisa guardar a conversa. O código usa `store: false`. A chave é usada apenas na máquina que executa o painel.

## O que pode ser personalizado com uma IA

Peça à IA para trabalhar somente no repositório clonado e para não abrir, copiar ou imprimir arquivos dentro de `data/`, `.env`, `.env.local`, `data/settings.key` ou `data/settings.enc`.

### Marca, cores e tipografia

Arquivos principais:

- `src/core/slides.ts`: estrutura e textos dos slides;
- `src/core/tone.ts`: regra de vermelho, amarelo, verde e neutro;
- `src/web/src/styles.css`: identidade visual do painel;
- `src/web/src/editor.css`: editor;
- `public/dirijo-simbolo.svg`: símbolo;
- `public/fonts/`: fontes locais.

Pedido de exemplo:

> Altere somente a identidade visual do Dirijo GBP. Preserve rotas, contratos da API, regras de evidência e o formato dos PDFs. Use a cor principal `#23C5C9`, destaque `#FFB52B`, fundo `#091016`, fonte Manrope nos títulos e Inter nos textos. Rode `npm run check` no final e liste os arquivos alterados.

### Texto e tom da análise

Arquivos principais:

- `src/server/adapters/openai.ts`: instruções enviadas à OpenAI e schema de saída;
- `src/core/content.ts`: tradução de termos técnicos e regras de linguagem;
- `src/core/diagnostic.ts`: observação, impacto, cenário correto e direção;
- `src/core/ai-brief.ts`: quais fatos entram no resumo enviado à IA.

Pedido de exemplo:

> Revise a linguagem do Dirijo GBP para uma pessoa leiga no Brasil. Mostre sempre: o que foi observado, por que isso pode atrapalhar contatos ou agendamentos, como deveria aparecer para o cliente e qual direção faz sentido. Não invente perda financeira, ranking ou causalidade. Não use nomes internos de campos, siglas ou termos de programação. Atualize os testes de linguagem e execute `npm run check`.

### Slides e roteiro

Arquivos principais:

- `src/core/slides.ts`: quantidade, ordem, títulos, corpo, imagens e roteiro;
- `src/server/pdf.ts`: exportação 16:9 e 9:16;
- `src/web/src/App.tsx`: histórico, coleta, edição e apresentação;
- `src/web/src/mobile-presentation.css`: apresentação para celular.

Pedido de exemplo:

> Mude apenas a ordem dos slides para abrir com contexto da análise, depois Google, reputação, site, Instagram, prioridades e chamada para reunião. Preserve os layouts existentes, as fontes das evidências e a duração total entre 4 e 6 minutos. Atualize os testes que validam a quantidade e a ordem.

### Regras de coleta

Arquivos principais:

- `src/server/service.ts`: orquestração, etapas, custos e falhas isoladas;
- `src/server/adapters/apify.ts`: Maps, concorrentes e Instagram;
- `src/server/adapters/website.ts`: site, capturas e PageSpeed;
- `src/shared/types.ts`: contratos dos dados.

Pedido de exemplo:

> Adicione um novo campo de evidência para [campo]. Não mude o formato dos achados sem atualizar `src/core/ai-brief.ts`, a validação, os testes e o PDF. Preserve a anonimização dos avaliadores e faça a falha dessa fonte manter o rascunho parcial.

## O que uma IA não deve alterar sem revisão

- não colocar tokens ou chaves no código;
- não remover `store: false` da chamada da OpenAI;
- não enviar nomes, fotos, perfis ou URLs pessoais de avaliadores;
- não transformar pixel, tag ou rastreador em prova de anúncio ativo;
- não prometer posição no Google, receita ou crescimento garantido;
- não trocar o ator da Apify sem validar o formato de saída;
- não apagar migrações, banco ou arquivos de dados para “resolver” um teste;
- não alterar limites de custo sem deixar a mudança visível na documentação;
- não publicar `data/`, `.env.local`, PDFs ou capturas de clientes.

## Validação depois de qualquer alteração

```bash
npm run check
```

Para testar apenas a conectividade da OpenAI:

```bash
npm run check:openai
```

Para conferir o estado da API local:

```bash
curl http://127.0.0.1:8787/api/health
```

Antes de enviar para o GitHub, confira o que será versionado:

```bash
git status --short --ignored
git check-ignore -v .env.local data/dirijo-gbp.sqlite output/ tmp/
```

## Criar o repositório no GitHub

O repositório pode ser público se o código puder ser compartilhado, ou privado se somente pessoas autorizadas forem instalar. As chaves nunca são colocadas no GitHub em nenhuma das duas opções.

Para criar primeiro uma cópia limpa, sem os dados desta máquina, rode na pasta original:

```bash
npm run export:distribution -- ../dirijo-gbp-distribuicao
cd ../dirijo-gbp-distribuicao
```

O comando falha se o destino já existir com arquivos, para não apagar uma cópia anterior. A cópia exclui banco, PDFs, imagens coletadas, uploads, `node_modules`, builds, temporários, `.env` e configurações locais.

Dentro da cópia limpa:

```bash
git init
git add .
git commit -m "chore: primeira versão distribuível do Dirijo GBP"
git branch -M main
git remote add origin https://github.com/gabrielima783-prog/dirijo-gbp.git
git push -u origin main
```

O repositório público já está configurado para este endereço.

## Comandos que podem ser entregues para quem instalar

Mac ou Linux:

```bash
git clone https://github.com/gabrielima783-prog/dirijo-gbp.git && cd dirijo-gbp && chmod +x scripts/instalar.sh && ./scripts/instalar.sh && npm start
```

Windows PowerShell:

```powershell
git clone https://github.com/gabrielima783-prog/dirijo-gbp.git; cd dirijo-gbp; powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1; npm start
```
