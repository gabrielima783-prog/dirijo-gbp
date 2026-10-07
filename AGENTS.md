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
- Entrega comercial padrão em quatro ou cinco páginas 9:16, baseada na lógica aprovada em 07/10/2026 e documentada em `docs/diagnosticos/LOGICA-DIAGNOSTICOS-V2.md`. Até dois achados sustentados, conclusão visível de cada canal avaliado, prioridades e conversa de 20 minutos, sem custo e sem compromisso de contratação. O material detalhado permanece disponível para revisão.
- Histórico local em SQLite.

## Contexto
Aplicação local preservada e versão compartilhada na VPS, com autenticação própria e perfis administrador/operador. A versão online usa histórico compartilhado, geração supervisionada e backups privados. Sem CRM, DataForSEO ou consulta automática a bibliotecas de anúncios. Estado operacional em STATUS.md; deploy pelo executor VPS e manifesto próprio.

## Regras específicas
- Toda afirmação factual precisa referenciar evidência.
- Não expor dados pessoais de avaliadores.
- Não prometer posição exata no Google.
- Não tratar pixel ou tag visível como prova de anúncio ativo.
- Não inventar valor financeiro perdido sem dados da operação.
- Aplicar a identidade oficial da Dirijo.
- A distribuição para outras máquinas não pode carregar banco, PDFs, imagens coletadas, uploads, chaves ou arquivos de segredo.
- A configuração compartilhada deve funcionar somente com `.env.example` e pela aba Configurações.

## Entrega comercial aprovada em 02/10/2026
- Usar a identidade oficial Dirijo, Manrope nos títulos e Inter no corpo, achados numerados e fechamento Ink com CTA Drive.
- Usar “diagnóstico” no material entregue ao prospect, sem terminologia interna de coleta.
- Objetivo: agendar uma conversa de 20 minutos sobre oportunidades de conquistar mais pacientes/clientes e aumentar faturamento, sem garantir resultados.
- Diferenciar problemas confirmados, oportunidades e dados desconhecidos. Não afirmar perdas financeiras nem problemas ocultos sem evidência.
- Pontos ainda não avaliados se referem a anúncios, rastreamento, dados e automações. Não oferecer atendimento, follow-up, agendamento ou fechamento comercial.
- Revisão aprovada: primeira página com abertura personalizada, até três achados em títulos e tópico de implicação em vermelho forte; sem métricas de reputação, introdução longa ou fontes visíveis. Segunda página sem subtítulo ou assinatura, com quatro frentes (Meta Ads/Google Ads, Perfil da Empresa no Google, site, dados e automações) e CTA compacto de 20 minutos.

- Revisão comercial de 02/10: implicação clara adaptada aos achados confirmados; quatro tópicos maiores sem descrições (anúncios online, descoberta no Google, site e otimização de resultados). CTA apresenta a reunião de 20 minutos como presente por aceitar o diagnóstico, com botão “Clique aqui para agendar um horário comigo”.

## Layout padrão aprovado em 05/10/2026
- Referência: `templates/diagnostico-layout-aprovado-2026-10-05.html`, substituindo as direções visuais de 02/10. Preservar escala tipográfica, cores, espaçamentos, consequências em duas colunas e CTA “VOCÊ GANHOU / Uma conversa sobre a sua clínica / 20 minutos · Sem custo / Agendar minha conversa”.
- Adaptar clínica/pacientes para empresa/clientes conforme o negócio. As consequências dependem dos achados confirmados exibidos, nunca copiar os problemas da Homenz para outras empresas.

## Escopo confirmado em 05/10/2026
- Analisar somente a empresa informada, pelo Perfil do Google, avaliações, site e Instagram. Coleta de concorrentes e Cenário local removidos por decisão do proprietário. Evidências históricas de concorrentes não entram na síntese nem nas entregas atuais.

## Lógica comercial aprovada em 07/10/2026
- Esta revisão substitui as direções comerciais de duas páginas de 02 e 05/10, mantidas acima como histórico.
- Google e Instagram sem site, somente Google e somente Instagram recebem leitura própria. Site não é uma oferta automática; explicar necessidades concretas de descoberta, confiança e contato. Google exige pertinência e elegibilidade antes de recomendar criação.
- URL vazia, perfil não localizado, acesso restrito e falha de coleta não comprovam ausência. Confirmar inexistência com método, data e referência; priorizar os canais realmente observados.
- Instagram avaliado sempre tem conclusão visível, incluindo pontos positivos. Bio, serviços, confiança, convites e destino de contato entram na leitura; frequência e contadores isolados não definem problema comercial.
- Sem achado sustentado, sinalizar revisão. Preservar escopo das amostras e fontes legíveis. CTA: “Quero definir minha prioridade”, com 20 minutos, sem custo e sem compromisso de contratação.
