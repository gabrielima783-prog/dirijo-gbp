# Dirijo GBP

## O que é
Produto local da Dirijo para gerar diagnósticos personalizados de presença digital a partir do Perfil da Empresa no Google, site e Instagram público.

## Tipo
Produto próprio.

## Escopo
- Coleta pública via Apify.
- Coleta automática do Instagram por link, com observações manuais opcionais.
- Diagnóstico baseado em evidências.
- Narrativa comercial simples: problema observado, possível perda de oportunidade, cenário correto e direção.
- Material nasce pronto e aprovado; o editor fica disponível para correções opcionais.
- Apresentação e PDF personalizados em 16:9 e mobile 9:16.
- Histórico local em SQLite.

## Contexto
Uso individual e local. Sem deploy, autenticação, CRM, DataForSEO ou consulta automática a bibliotecas de anúncios na primeira versão.

## Regras específicas
- Toda afirmação factual precisa referenciar evidência.
- Não expor dados pessoais de avaliadores.
- Não prometer posição exata no Google.
- Não tratar pixel ou tag visível como prova de anúncio ativo.
- Não inventar valor financeiro perdido sem dados da operação.
- Aplicar a identidade oficial da Dirijo.
- A distribuição para outras máquinas não pode carregar banco, PDFs, imagens coletadas, uploads, chaves ou arquivos de segredo.
- A configuração compartilhada deve funcionar somente com `.env.example` e pela aba Configurações.
