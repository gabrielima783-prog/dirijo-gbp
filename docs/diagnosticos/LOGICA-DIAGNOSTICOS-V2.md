# Lógica editorial dos diagnósticos comerciais

Revisão editorial aprovada em 7 de outubro de 2026, após comparação da Inbelle com a prévia local. Implementação e publicação registradas no STATUS.md.

O diagnóstico deve ajudar o responsável a reconhecer uma oportunidade real no próprio negócio, entender sua possível consequência e aceitar uma conversa com objetivo concreto. A percepção de personalização vem das evidências e da interpretação, além do nome e da identidade visual.

## Progressão da leitura

A sequência deve permitir que o leitor conclua: olharam meu negócio; esse ponto existe; entendi como ele pode afetar a experiência de quem me procura; existe uma direção razoável; conversar ajuda a escolher a prioridade.

A quantidade de páginas segue os assuntos observados. Abertura, prioridades e convite ocupam uma página cada. Google e Instagram têm capítulos separados; um problema técnico de contato recebe capítulo próprio. O material tem quatro a seis páginas: Google e Instagram produzem cinco mesmo com apenas uma oportunidade confirmada. Site só entra quando existe uma necessidade sustentada, sem oferta automática.

A abertura apresenta até dois pontos com uma explicação curta, ligada ao negócio. Cada capítulo contém evidência, importância e direção. A bio é interpretada, sem transcrição bruta. Cobertura desconhecida fica na revisão interna e não é amontoada na página de prioridades. Sem achado confiável, encaminhar para revisão, sem fabricar um problema.

## Cenários e cobertura dos canais

As páginas se adaptam aos canais realmente observados. Avaliar um canal e escolher um achado principal são decisões diferentes: todo canal analisado deve ter uma conclusão visível, mesmo quando o resultado for positivo ou não justificar uma página exclusiva.

O Instagram não é excluído para caber no limite de páginas. Se Google e Instagram estiverem disponíveis, os dois precisam aparecer com evidência e interpretação. Google e Instagram têm conclusões em capítulos separados. O destino compartilhado recebe uma página própria quando há um achado técnico sustentado.

| Cenário confirmado | O que analisar | Por que importa ao negócio | Organização de referência |
|---|---|---|---|
| Google e Instagram, sem site próprio | Informações e reputação no Google; identidade, serviços, localização, conteúdo e contato no Instagram; continuidade até WhatsApp, agenda ou agregador | Ajudar quem pesquisa a encontrar informações, conhecer o atendimento e avançar para o contato | Síntese; Google; Instagram e contato; prioridades e eventual página própria; convite |
| Somente Google, sem Instagram e sem site próprio | Informações comerciais, acesso ao contato, avaliações e respostas, fotos e apresentação dos serviços | O perfil reúne as informações públicas disponíveis para quem está escolhendo | Síntese; informações e contato; reputação e apresentação; prioridades e necessidade de outro canal; convite |
| Somente Instagram, sem Google e sem site próprio | Bio, serviços, localização pertinente, conteúdo observado, confiança e caminho de contato; adequação de uma presença local no Google | O Instagram apresenta o negócio; o Google pode complementar a descoberta de serviços locais quando pertinente | Síntese; Instagram e contato; descoberta local ou aprofundamento do Instagram; prioridades; convite |

Sem site próprio, avaliar o destino real utilizado, que pode ser WhatsApp, agenda externa ou Linktree. Um agregador de links é uma rota de contato, não comprovação de site próprio. Sua existência também não comprova que não exista outro site.

Sem confirmação da ausência de um canal, usar uma variação de cobertura parcial: por exemplo, Instagram avaliado e Google a confirmar. Não enquadrar automaticamente como somente Instagram.

O protótipo local executável e a matriz de cenários ficam em `prototipo-cenarios/`. A comparação visual fica em `../../output/revisao-local-2026-10-07/cenarios-diagnosticos.html`.

## Existência e coleta são estados diferentes

Registrar separadamente a existência do canal e o resultado de sua análise:

- `present_assessed`: canal correspondente ao negócio observado e avaliado.
- `present_unassessed`: canal identificado, mas ainda não avaliado.
- `absent_confirmed`: ausência confirmada, com responsável ou procedimento registrado, data e evidência.
- `not_provided`: endereço do canal não foi informado.
- `not_found`: pesquisa documentada não localizou o canal; não é prova de inexistência.
- `collection_failed`: a tentativa de leitura falhou.
- `restricted`: o perfil está privado ou o acesso foi restringido.

Um campo de URL vazio nunca deve produzir `absent_confirmed`. Os estados de execução `completed`, `failed` e `skipped` também não comprovam existência ou ausência.

## Quando explicar o valor de um canal ausente

O argumento deve responder qual necessidade ele atenderia naquele negócio. Não basta apresentar uma lista dos serviços que a Dirijo vende.

**Google:** quando a empresa atende presencialmente ou presta um serviço local compatível, explicar como um perfil pode reunir localização, horários, serviços, avaliações e contato para quem pesquisa. Antes de recomendar criação, confirmar a ausência, verificar possíveis perfis existentes e a elegibilidade. Se o negócio for exclusivamente online ou a modalidade não estiver esclarecida, não prescrever abertura de perfil. As condições seguem as [diretrizes oficiais de qualificação do Google](https://support.google.com/business/answer/13763036?hl=pt-BR), consultadas em 07/10/2026. Não garantir posição nem afirmar invisibilidade em toda a busca por ausência de um perfil.

**Instagram:** considerar quando mostrar serviços, ambiente, profissional e respostas às dúvidas pode ajudar a escolha, e houver condição de manter esse conteúdo. A ausência do Instagram não é uma falha automática. Não afirmar que todos os pacientes usam o canal ou que ele é obrigatório para vender.

**Site próprio:** considerar quando existe uma necessidade concreta de organizar serviços, explicar o atendimento, esclarecer dúvidas, receber tráfego de campanhas ou medir um caminho de contato. A existência de Google e Instagram não elimina essa possibilidade, mas a falta de site não comprova perda de pacientes. Se o destino atual resolve bem a tarefa e não há necessidade observada, preservar o que funciona e discutir a página como uma evolução eventual.

Um diagnóstico pode explicar a utilidade de um canal ausente sem torná-lo prioridade. Distinguir correção necessária, oportunidade de expansão e decisão dependente do responsável.

## Avaliação do Instagram

Avaliar estas dimensões quando houver evidências acessíveis:

| Dimensão | O que observar | Relação com a decisão do possível cliente |
|---|---|---|
| Identidade e atuação | Nome, bio, serviço apresentado e região quando pertinente | Entender quem atende, o que faz e se atende sua necessidade |
| Clareza dos serviços | Conteúdos que expliquem o atendimento e dúvidas de quem procura | Conseguir avaliar interesse antes de chamar |
| Confiança | Apresentação do profissional, ambiente e provas legítimas disponíveis | Reconhecer o negócio e formar confiança |
| Orientação para agir | Bio, legendas, botões e instruções efetivamente observados | Saber como pedir informações ou marcar uma avaliação |
| Destino do contato | URL específica, WhatsApp, agenda, agregador ou site | Conseguir continuar a partir do interesse |
| Atividade e coerência | Datas da amostra, informações atualizadas e consistência entre canais | Identificar informação útil e atual, sem impor frequência universal |

Cada dimensão recebe uma conclusão: ponto forte, oportunidade sustentada, informação insuficiente ou não aplicável. Registrar evidência, escopo e data; não calcular uma nota global fictícia.

O documento deve apresentar ao menos uma conclusão específica do Instagram quando ele for avaliado. Se estiver bem organizado, mostrar isso. Se falhar a coleta, registrar cobertura parcial e aprofundar os canais disponíveis sem emitir diagnóstico negativo do Instagram.

Até 12 publicações não equivalem ao histórico inteiro. Legendas e imagens observadas não cobrem automaticamente conteúdo falado de Reels, Stories, destaques, fixados, respostas por DM, alcance, resultados comerciais ou anúncios. Somente avaliar esses itens quando houver captura ou dado próprio para isso. Falta de observação não significa falta do recurso.

Chamadas como “Faça sua avaliação”, “Marque sua avaliação” e “Agendamentos pelo WhatsApp” precisam ser reconhecidas pelo contexto. Um contador por regex não basta para concluir que não existe CTA. Na Letícia, a leitura das legendas identifica várias chamadas embora o sinal automático registre uma; o número automático não deve orientar a copy comercial.

As afirmações de saúde publicadas pelo prospect não são endossadas pelo diagnóstico. O material pode observar que o perfil apresenta serviços, sem reproduzir promessas clínicas ou validar credenciais somente pela bio.

## Seleção das evidências

Antes de escrever, conferir empresa, unidade, cidade, data, origem e escopo de cada evidência. Dados de uma unidade ou de outro negócio não podem sustentar a conclusão sobre o prospect.

Preferir dados estruturados, capturas e observações verificadas às conclusões de textos gerados anteriormente. Uma conclusão histórica precisa continuar compatível com a evidência original.

Separar três classes:

| Classe | Como entra no diagnóstico | Exemplo |
|---|---|---|
| Fato observado | Afirmação direta com escopo e data | Nenhuma das 21 avaliações analisadas recebeu resposta pública |
| Possível consequência | Explicação condicional, proporcional ao fato | A espera pode dificultar a continuidade até o contato |
| Informação desconhecida | Pergunta ou verificação a realizar | Precisamos entender de onde chegam os contatos |

Uma falha de coleta não comprova ausência de perfil, site, botão, informação ou atividade. Zero somente pode aparecer quando a coleta realmente verificou aquele zero. Dados não observados permanecem desconhecidos.

No site, validar a URL específica analisada. Páginas institucionais do Linktree ou de outro fornecedor não representam a clínica. PageSpeed precisa corresponder ao destino público do negócio e à estratégia mobile quando esse for o argumento. Comparar somente o hostname é insuficiente em plataformas compartilhadas.

No Google, manter a diferença entre total de avaliações do perfil e tamanho da amostra analisada. Ausência de resposta deve estar verificada na amostra. Não expor nomes ou informações pessoais de avaliadores.

No Instagram, métricas automáticas de frequência, prova ou chamada para ação são sinais para revisão. Confirmar a leitura dos conteúdos antes de transformá-las em um problema comercial. Baixa frequência, sozinha, não comprova perda de clientes.

## Escolha e ordem dos achados

Escolher no máximo dois achados principais e um ponto forte útil à abertura. Os achados precisam acrescentar argumentos diferentes, sem dividir a mesma evidência em vários problemas.

A ordem considera, nesta sequência:

1. Solidez da evidência e correspondência com o negócio correto.
2. Proximidade com uma ação desejada do cliente, como descobrir, conhecer, confiar ou entrar em contato.
3. Relevância comercial observável e extensão do problema, distinguindo uma interrupção de uma oportunidade de melhoria.
4. Possibilidade de explicar o mecanismo e indicar um próximo passo executável.

Um problema confirmado de contato pode merecer prioridade sobre um ajuste de presença. Essa ordem não é fixa por canal: uma clínica sem Perfil da Empresa confirmado pode exigir começar pela descoberta. Se a experiência de contato funciona e a reputação é boa, o diagnóstico deve reconhecer esses pontos fortes.

Não usar pontuação inventada, classificação alarmista nem perda financeira estimada para tornar a análise mais intensa. Não supor que a empresa precisa contratar todos os serviços da Dirijo.

## Estrutura das páginas

| Página | Trabalho de comunicação | Conteúdo necessário |
|---|---|---|
| Abertura | Reconhecimento e motivo para continuar | Identificação do negócio, conclusão específica, um ponto forte sustentado e os achados selecionados |
| Primeiro achado | Entender o ponto de maior relevância | Evidência legível, fato, situação vivida pelo possível cliente, consequência possível e direção inicial |
| Segundo achado | Acrescentar um argumento distinto | Mesma cadeia de evidência, com intensidade proporcional ao achado |
| Prioridades | Mostrar critério e preparar a conversa | Primeiro, em seguida e o que depende do contexto do responsável |
| Convite | Explicar por que conversar e reduzir o compromisso percebido | Entrega da conversa, duração, custo, ausência de obrigação de contratar e uma ação |

O conteúdo de cada página deve avançar o raciocínio. A abertura não será uma capa isolada. A página de prioridades não deve apenas repetir os textos anteriores: ela explica ordem, dependência e decisão.

## Como escrever cada achado

Preparar internamente seis elementos, que podem ser combinados em poucos parágrafos no material:

- Fato: o que foi observado, em qual amostra ou página.
- Prova: dado, captura ou trecho que permite reconhecer o achado.
- Situação: em que momento da escolha ou do contato isso aparece.
- Mecanismo: por que isso pode ajudar ou dificultar o próximo passo.
- Consequência: o efeito possível, sem transformar hipótese em resultado medido.
- Direção: o que conferir ou ajustar primeiro, dentro do escopo da Dirijo.

Exemplo aplicado: o Google e o Instagram da Letícia levam ao mesmo Linktree; o teste mobile desse destino registrou 39/100 e LCP de 10 segundos. A abertura merece conferência porque a pessoa já demonstrou interesse e está tentando chegar ao contato. Testar a experiência real ajuda a decidir entre ajustar o destino atual e avaliar uma página mais leve.

LCP de 10 segundos não significa que o botão só pôde ser clicado após 10 segundos. Também não comprova desistência, ausência de agendamentos ou perda financeira. O material deve explicar o indicador em linguagem simples junto do dado.

No segundo achado da Letícia, as 21 avaliações positivas sustentam uma boa reputação. As zero respostas públicas representam uma oportunidade de valorizar essa base. Não apresentar a situação como reputação ruim ou abandono dos pacientes.

## Convite e entrega da conversa

O motivo do convite é conectar os achados públicos ao contexto que só o responsável pode informar: objetivos, serviços prioritários e origem dos interessados. A reunião deve permitir escolher uma prioridade e explicar uma direção inicial.

Entregas propostas para a conversa:

- Uma prioridade definida para o momento do negócio.
- Uma recomendação prática relacionada ao caminho até o contato.
- Clareza sobre como a Dirijo pode ajudar e qual seria o próximo passo.

O responsável pela reunião deve estar preparado para realizar essas entregas. Não prometer um plano completo, implementação gratuita ou resultado comercial durante os 20 minutos.

Texto obrigatório nesta versão: **20 minutos · Sem custo · Sem compromisso de contratação.** Sem custo e sem compromisso devem ser legíveis e próximos da ação principal.

CTA de referência: **Quero definir minha prioridade**. A mensagem preparada no WhatsApp deve citar o negócio e pedir a conversa de 20 minutos. Usar uma única ação principal, sem adicionar pedidos concorrentes de seguir, baixar outro material ou preencher outro diagnóstico.

O destinatário do CTA deve ser o canal comercial aprovado. Não inferir que o operador que gerou o diagnóstico será o responsável pela reunião. Neste protótipo, Gabriel conduz a conversa e o destino existente foi preservado.

A Dirijo pode diagnosticar, orientar e executar as frentes contratadas de aquisição e presença digital. Não prometer assumir atendimento, follow-up, agendamento ou fechamento comercial da clínica.

## Direção visual e leitura no celular

Manter Manrope, Inter e a paleta oficial Dirijo, com superfícies Stone para a análise e Ink no fechamento. Ciano/teal identificam dados e leitura; Drive destaca direção e ação.

O corpo principal deve ficar entre 27 e 30 px em uma página de 810 px de largura. Fontes pequenas ficam limitadas a datas, referências e notas de escopo. Quando faltar espaço, reduzir repetição antes de diminuir o texto.

Capturas devem mostrar o trecho pertinente em tamanho legível. Ampliar por enquadramento, preservando o arquivo original. Não reconstruir interfaces ou números e apresentá-los como captura real. Fotos e prints precisam ter função na demonstração, sem ocupar espaço apenas como decoração.

Dar destaque ao dado mais importante e à consequência, sem transformar a página em um bloco de texto. Fontes e notas devem ser discretas, mas limitações que mudem a leitura de uma métrica permanecem próximas dela.

Na revisão, conferir todas as páginas renderizadas do PDF, quantidade de páginas, transbordamentos, sobreposição com o rodapé, acentuação, legibilidade e destino do botão. Conferir também a prévia em largura de celular.

## Critérios antes de incorporar ao sistema

O modelo precisa estar aprovado visualmente e validado nos três cenários, incluindo presença forte, dificuldade de contato, oportunidade de descoberta, apenas um achado e coleta incompleta. A cobertura obrigatória do Instagram, quando avaliado, precisa ser preservada na seleção dos dois achados principais.

A mudança futura exige seleção dinâmica de achados, vínculo de cada afirmação à evidência, controle de cobertura e variação de páginas. O protótipo atual é uma montagem editorial local, não uma alteração dessas regras no código da aplicação.

Antes de integrar a lógica, corrigir as dependências identificadas no código existente:

- `src/server/service.ts`: falta de `mapsUrl` hoje cria evidência automática de ausência do Google; falta de site informado/encontrado vira achado negativo de alta confiança. Separar existência, entrada e execução da coleta.
- `src/shared/types.ts`: adicionar estado de presença, método/data de confirmação e cobertura; `SourceStatus` descreve somente a execução.
- `src/core/compact-diagnostic.ts`: a avaliação comercial do Instagram precisa cobrir as dimensões acima, além da frequência, e garantir conclusão visível para cada canal avaliado.
- `src/server/adapters/apify.ts`: revisar as heurísticas de CTA; validar contra legendas conhecidas e manter a observação semântica e visual como fonte da conclusão.
- `src/core/diagnostic.ts`: corrigir o fallback do Instagram que usa linguagem de imóveis e afirma ausência de posts mesmo com atividade observada. Validar ausência real, atividade, negócio de saúde e outros segmentos antes de reutilizá-lo.

Nenhuma dessas correções de aplicação foi publicada ou incorporada ao runtime por esta revisão documental e pelo protótipo local.

A eficácia comercial deve ser acompanhada por versão do material: contatos que receberam o diagnóstico, respostas depois do material e reuniões marcadas. Manter janela de observação e tratamento de follow-up comparáveis. Não atribuir diferenças somente ao número de páginas quando lista, abordagem, atendimento ou tempo de observação também mudarem.

## Arquivos da prévia

- HTML: `../../output/revisao-local-2026-10-07/leticia-bastos-diagnostico-5-paginas.html`
- PDF: `../../output/revisao-local-2026-10-07/leticia-bastos-diagnostico-5-paginas.pdf`
- Fontes e decisões editoriais: `../../output/revisao-local-2026-10-07/NOTAS-DA-PREVIA.md`
- Primeira versão preservada: `../../output/revisao-local-2026-10-07/versao-1/`

## Implementação autorizada em 07/10/2026

Gabriel aprovou a lógica e autorizou a publicação em produção neste chat. A aplicação agora monta o PDF comercial com quatro ou cinco páginas a partir das evidências, mantém conclusão de cada canal avaliado, separa presença e execução e registra a confirmação de ausência no formulário. Os registros históricos sem confirmação não sustentam ausência. Capturas e métricas se referem à URL específica usada pelo negócio; a auditoria do Linktree não navega para páginas institucionais do fornecedor.

A apresentação detalhada usa de quatro a dez páginas conforme os canais observados. A verificação da release inclui exportação de uma análise existente na VPS, sem nova coleta ou síntese paga. Estado final, SHA, checksum e rollback ficam exclusivamente no `../../STATUS.md`. O protótipo Python permanece como referência isolada; a lógica ativa é TypeScript em `src/core/compact-diagnostic.ts` e `src/core/channel-presence.ts`.

## Revisão após o primeiro diagnóstico publicado

Prévia da Inbelle aprovada no chat: abertura personalizada; Google e reputação; Instagram e WhatsApp; prioridades; CTA gratuito de 20 minutos sem compromisso. O gerador foi comparado visualmente com essa prévia, além dos testes técnicos. Layout preserva corpo 27–28 px em largura 810 px. As páginas do PDF da Inbelle foram conferidas integralmente; três cenários e casos de coleta parcial também foram exportados. Não houve nova coleta paga.
