# Dirijo GBP: estado operacional

Atualizado em 07/10/2026.

## Produção

Publicado em https://gbp.viradadonutri.com.br, na VPS `central-ops-ovh`, stack exclusiva `dirijo-gbp-production`. Entrada HTTPS por Tunnel dedicado da Cloudflare; aplicação vinculada somente à porta local 3006. Banco, arquivos, credenciais e backups separados dos demais projetos.

Release em produção: `c064927c5881595b2c1e95fa7701c5f77d70fbd9`, pacote SHA-256 `1dc5240e3f507f35bcf6331c3c4f1695f1bcc05271ad8064e313eb3e0d9c3430`. Publicação executada pelo manifesto `.deploy/vps.json` e executor canônico. `current` aponta para essa release; `previous` para `5c0c350040cc24ed5a4446fea29e373e1b629133`. Rollback binário disponível pelo executor. Limpeza automática preservou releases protegidas, banco, arquivos e backups.

Health interno e externo passaram. Dirijo Ops, Dirijo Flow, Dirijo Content e Assistente Pessoal continuaram retornando 200. Disco após conferência: 20% livre, 21.002.632 KiB disponíveis, 89% de inodes livres.

## Acesso e uso

Autenticação própria por e-mail/senha, sessões persistentes no SQLite e troca obrigatória da senha inicial. Gabriel possui perfil administrador; Iuri possui perfil operador. Identificadores e senhas de primeiro acesso ficam em arquivos individuais privados fora do Git. Nenhum convite ou e-mail foi enviado.

Operador pode criar, consultar, duplicar, gerar e editar diagnósticos e baixar PDFs do histórico compartilhado. Configurações, exclusão e autorização de exceder orçamento são restritas ao administrador. Coleta, nova tentativa, regeneração e exportação PDF possuem trava de uma operação pesada por vez. Execuções interrompidas por reinício ficam sinalizadas para revisão manual, sem repetição automática de chamadas pagas.

Os 32 diagnósticos locais foram migrados por snapshot consistente, junto dos arquivos e configurações cifradas. A base local original permanece preservada. Fonte/builds anteriores preservados em `/Users/gabriellima/Desktop/ClaudeCode/Code.IA-local-preserved-20261005/dirijo-gbp`; código compartilhado possui repositório próprio `gabrielima783-prog/dirijo-gbp`.

A listagem carrega somente resumos; detalhes, provas e imagens são carregados ao abrir o diagnóstico. Verificação com 33 registros: 17.271 bytes na listagem.

## Validação e backup

`npm run check` passou com build e 101 testes na release atual. Acesso de operador validado em navegador; consulta anônima bloqueada (401), configurações e exclusão bloqueadas para operador (403). Usuários/sessão persistiram na atualização entre releases.

Backup diário às 03h10 de São Paulo, com até cinco minutos de variação, por timer exclusivo ativo. Mantém sete snapshots cifrados locais e trinta dias no R2 privado. Chave de recuperação preservada separadamente da VPS. Download autenticado, verificação AES-256-GCM e recuperação em container temporário passaram: SQLite íntegro, 32 diagnósticos e dois usuários, `settings.enc` e `settings.key` presentes. Produção não foi restaurada nem alterada nessa conferência. Arquivos temporários descriptografados foram removidos.

Diagnóstico real de validação gerado pelo operador em 05/10: Homenz Vila Velha, registro `b2cfd32a-43ca-4fed-8dc0-2059b512cbd9`, finalizado com seis achados e dez slides detalhados, custo total US$ 0,051081. Google, avaliações, concorrência, Instagram e síntese concluídos; site e PageSpeed sinalizados como não aplicáveis por ausência de site. PDF comercial gerado na VPS: duas páginas 9:16 (810 × 1440 pt), 224.067 bytes. Apresentação autenticada conferida visualmente no navegador. A conta do operador foi devolvida à senha inicial com troca obrigatória após a conferência; sessões de validação revogadas. Histórico online final contém 33 registros, incluindo o exemplo.

Conferência final: administrador e operador autenticam com as senhas iniciais, ambos obrigados a trocar a senha antes de acessar o histórico. Backup manual adicional, após a geração e a revogação das sessões de validação, terminou com `Result=success`; timer permanece ativo.

Runbook: `infra/VPS-RUNBOOK.md`.


## Correção de leitura Apify preparada, 05/10/2026

- Diagnóstico Face Doctor Praia do Canto apresentou HTTP 502 ao ler o dataset do Cenário local. Demais fontes preservadas.
- Adaptador agora tenta até quatro leituras do mesmo dataset para HTTP 429/5xx, falhas de conexão e resposta inválida, com espera progressiva e timeout por tentativa. POST de criação do ator não é repetido pela recuperação da leitura.
- Build e git diff --check aprovados. Testes e publicação ainda não executados; aguardam autorização. Release de produção permanece `146ca31350504c66f39f968091ec4d273b62ecc0`.
- Diagnóstico existente ainda precisa ser recuperado, preferencialmente reutilizando o dataset já pago.


## Recuperação da leitura e localização publicada, 05/10/2026

- Publicado em produção o SHA `07ce088d5893f5698a395bdc812410c8c1f15e87`, PR 1 integrada, pacote SHA-256 `cc0aeb3a66553865d128703517acbb238f079cfb0e3bbb81751c888247d50736`. Build e 57 testes aprovados. Backup cifrado realizado antes da promoção; health da aplicação e vizinhos HTTP 200.
- Leituras de dataset transitórias repetem somente GET, até quatro tentativas. Consulta comparativa agora envia país e estado/cidade; resultados de outros países/cidades não entram na evidência e amostra vazia não é sucesso.
- Apify confirmou que a consulta anterior de Face Doctor usou apenas `Vitória` e retornou um negócio em Brighton, Victoria, Austrália. Resultado anterior não será reutilizado por incompatibilidade geográfica.
- Nenhuma nova coleta paga foi disparada após a publicação. Proprietário questionou a necessidade da comparação; aguardando decisão entre manter Cenário local ou retirar a coleta de concorrentes. Recuperação do diagnóstico continua pendente dessa decisão.
- Executor aplicou sua política automática de limpeza, preservando releases protegidas, dados e backups. Espaço após publicação: 20%, 20.443.880 KiB.


## Remoção da comparação local, publicada em 05/10/2026

- Proprietário determinou retirar concorrentes e publicar em produção. Coleta, estimativa de custo, opção de nova tentativa e linha Cenário local removidas do fluxo ativo.
- Evidências antigas de concorrentes e achados/slides vinculados ficam fora da leitura ativa e da síntese; armazenamento e custos históricos preservados. Não será disparada nova coleta paga para recuperar Face Doctor.

- Produção publicada no SHA `baff700e0c4b21361966f2f445ef3c2db06b3ce7` (PR 2), checksum `1418099154bfea21116f6806ba7a839443edc63578d7d8767e27bdf94ced7271`. Build e 56 testes passaram, incluindo bloqueio da coleta/nova tentativa e exclusão das evidências legadas da síntese.
- Backup cifrado realizado antes da promoção. Health interno, HTTPS público e vizinhos Ops, Flow, Threads e Assistente Pessoal aprovados. Status confirmou current/previous acima; 20% de disco livre, 20.338.996 KiB. Nenhuma nova chamada paga de coleta foi disparada.

## Revisão comercial aprovada e validada localmente, 07/10/2026

- Gabriel aprovou os três cenários e autorizou publicação em produção neste chat. Implementação preparada: PDF de quatro ou cinco páginas, até dois achados, conclusão visível do Instagram, consequências proporcionais, prioridades e CTA de 20 minutos sem custo e sem compromisso de contratação.
- Formulário distingue URL não informada de ausência confirmada, registrando método, data e referência. Google exige ausência confirmada e elegibilidade antes de recomendar criação. Site não vira oferta automática; registros antigos sem confirmação permanecem desconhecidos.
- Coleta do Instagram passa a preceder auditoria de seu destino externo. Bio/legendas reconhecem convites para avaliação; conteúdo manual persiste e participa da leitura. Auditoria do Linktree limita a navegação ao perfil informado. Não houve nova coleta paga durante a implementação/QA.
- Build e 75 testes passaram. QA local: caso real da Letícia (cinco páginas), três cenários confirmados, negócio sem elegibilidade Google, elegibilidade a confirmar, acesso restrito, checklist manual e presença forte. PDFs principais renderizados e conferidos; exportador rejeita corte e sobreposição do rodapé. Mobile 390 px validado.
- Runbook e verificação do adaptador atualizados: após promoção, exportar PDF de análise finalizada já existente com sessão temporária limitada e removê-lo ao terminar. Resultado da publicação será registrado abaixo.

## Diagnóstico comercial e cenários publicados, 07/10/2026

- Produção ativa no SHA `3fd4d97a7c5e9d192c20cdceb05bb4bd5556c991`, checksum `86b4084f9567a45ebd2dd788764b6970a65d3299e07a01780414cf2e5527586d`. Os três cenários e a conclusão do Instagram estão disponíveis; PDF comercial varia entre quatro e cinco páginas, com CTA gratuito de 20 minutos sem compromisso.
- `npm run check` passou com build e 78 testes. Smoke na VPS reutilizou análise finalizada, exportou PDF de cinco páginas (322.662 bytes), sem cortes ou sobreposição e sem pendência de revisão. Sessão limitada e arquivo temporário removidos. Nenhuma coleta paga executada.
- Dois candidatos anteriores falharam no envio único do backup, preservando o runtime anterior. Snapshot cifrado havia ultrapassado 100 MiB. Upload corrigido para multipart com partes de até 50 MiB, validação do tamanho final e abort em falha; Worker publicado na versão `c8b4b0c6-826e-4274-a9d2-84c44e32d706`. Chave, formato de recuperação e download integral preservados.
- Backup consistente cifrado foi enviado com sucesso antes da troca da aplicação. Timer diário permanece ativo. Atualização do helper e do procedimento documentada no runbook.
- Status confirmou `current=3fd4d97a7c5e9d192c20cdceb05bb4bd5556c991` e `previous=baff700e0c4b21361966f2f445ef3c2db06b3ce7`. Rollback binário disponível pelo executor. Health interno, público, Ops, Flow, Content e Assistente Pessoal passaram com HTTP 200.
- Limpeza segura automática do executor aplicada, preservando releases protegidas, dados e backups. Disco final: 21% livre, 21.290.324 KiB disponíveis, 89% de inodes livres. Nenhuma ação humana pendente para ativação.

## Revisão editorial da Inbelle publicada, 07/10/2026

- Gabriel aprovou a prévia local de cinco páginas e autorizou publicação. O gerador agora separa abertura, capítulos de Google e Instagram, prioridades e convite. Quantidade de páginas segue os assuntos: quatro a seis, sem comprimir canais em uma página por existir só um achado. Inbelle mantém cinco páginas; contato técnico adicional recebe capítulo próprio.
- Abertura personalizada com até dois pontos explicados; bio interpretada; site não aparece por regra genérica. Cobertura desconhecida fica na revisão interna. CTA de 20 minutos, sem custo e sem compromisso de contratação, com destino comercial preservado.
- Build e 83 testes passaram. QA local exportou Inbelle, Letícia, os três cenários, elegibilidade desconhecida/incompatível, revisão manual, presença forte e acesso restrito. Cinco páginas da Inbelle comparadas visualmente com a prévia aprovada. Mobile 390 px sem transbordamento horizontal.
- O candidato `358bae97175fd3d9b711099e338c3a5b7490f305` falhou no gate PDF e teve rollback automático. A diferença de quebra de linhas no Chromium Linux exigiu cortar repetição no capítulo Instagram. Revisão adicional executada dentro da imagem da VPS, em container isolado, sem coleta paga.
- Release ativa `84b9df7c070459136ca9f3e536ba109f9ef7fba3`, checksum `6459d8323905202a9f015af703b96010b895fb17f7f86f4684cf725b0e2003dd`. Backup cifrado concluído antes da promoção. Smoke na VPS exportou a Inbelle com cinco páginas, 225.821 bytes, sem cortes ou sobreposição, reviewRequired=false. Sessão e arquivo temporários removidos.
- Status confirmou current nessa release e previous=`3fd4d97a7c5e9d192c20cdceb05bb4bd5556c991`; rollback binário disponível. Health interno, público e vizinhos Ops, Flow, Content e Assistente Pessoal aprovados. Limpeza segura automática aplicada, preservando releases protegidas, dados e backups. Disco final 21% livre, 21.245.108 KiB disponíveis, 89% de inodes livres.
- Diagnósticos existentes usam a nova montagem ao abrir e baixar o PDF novamente. Não requer nova coleta nem regeneração de IA. Sem ação humana pendente para ativação.


## Correção da IA e recuperação publicada, 07/10/2026

- Nicole Romano concluiu Instagram, destino de contato e PageSpeed às 18:23 UTC. IA permaneceu em execução por mais de dez minutos. Auditoria confirmou gpt-5-mini, resumo de 5.765 bytes e somente dois assuntos, enquanto o formato exigia no mínimo quatro achados. Essa contradição foi eliminada: contagem e canais do formato agora seguem as evidências reais.
- Mantidas interpretação e checagem por IA; esforço explicitamente low para gpt-5-mini, espera limitada por chamada e registro das etapas de geração/checagem. Falha não produz diagnóstico automático substituto, preserva coleta e permite repetir apenas IA. Canais faltantes na resposta não recebem achados fabricados para preencher estrutura.
- Build e 86 testes passaram, incluindo recuperação somente da IA sem nova coleta. Publicação e recuperação da execução serão registradas após verificação.

- Primeira publicação da correção: `9f9b93b8ac151637eb1186bbcb0a6a411a17d388`, checksum `dc1d50f0b99eb6e22ca81f95b55d70fbea55cc7e304911647b302457245cdf2f`, health e smoke PDF aprovados. Nova tentativa exclusiva de IA respondeu, porém o rascunho foi rejeitado pela regra de texto antes da revisão. Ordem corrigida: revisão recebe o rascunho e validação obrigatória aprova somente o resultado final; sem remover proteção ou substituir IA por diagnóstico local.

- Segunda publicação `b913f85c647f9d1451712ad3ac45f1e63ec9dc23`, checksum `9df02f86f3e19e73df99f74d7302a09f0841c1593a0a6ffefd75a158f8124561`, passou 87 testes e smoke PDF. Leitura manual das evidências identificou promoções do Linktree junto dos botões da empresa. Brief de IA agora exclui esses links de plataforma e limpa o sufixo de compartilhamento, preservando o CTA real de avaliação/WhatsApp e a evidência original.

- Publicação final ativa `5c0c350040cc24ed5a4446fea29e373e1b629133`, checksum `2ed03f65afaf5397aff57f851406ba69d886b644449608e282961f0f6cfcd01e`. Build e 88 testes aprovados. Backup cifrado anterior à promoção, smoke PDF e health interno, público e vizinhos HTTP 200. Current confirmado nessa release, previous `b913f85c647f9d1451712ad3ac45f1e63ec9dc23`; rollback binário disponível. Limpeza segura automática preservou dados, backups e releases protegidas. Disco final 20% livre, 21.029.940 KiB, 89% dos inodes livres.
- Nicole recuperada somente pela nova tentativa de IA sobre evidências preservadas, sem novo actor/coleta. Duas chamadas reais de gpt-5-mini, verificação aplicada, 12.262 tokens de entrada e 1.754 de saída. Síntese finalizada em 22 segundos, dois achados sustentados. PDF comercial de cinco páginas, 258.286 bytes, exportado pela aplicação e conferido visualmente sem corte ou sobreposição. Consulta final confirmou 46 análises finalizadas, nenhuma fonte em execução e nenhum processo Chromium remanescente. Sessão operacional temporária revogada.
- No mesmo pedido, telefone da confirmação após “Quer o material” no Dirijo Flow alterado para +55 27 99690-3948 e publicado na release `4beb3f3d1dd4997828e8fe3feb9d2c20300136df`, com 134 testes aprovados e health saudável. Registro canônico dessa publicação em `../dirijo-flow/STATUS.md`. Nenhuma mensagem enviada ao prospect durante as verificações.

## Google ausente e leitura objetiva do Instagram, 07/10/2026

- Correção autorizada: ausência confirmada do Google conduz abertura, capítulo próprio, prioridades e propósito da conversa. Instagram continua com capítulo separado. Modalidade desconhecida condiciona a implantação; inelegibilidade e ausência sem confirmação não prescrevem criação.
- Instagram comercial e instruções da IA passam a concentrar frequência, clareza/estrutura da bio e convite da própria bio. Referência aprovada: 12 publicações em 30 dias. Datas da observação e limites da amostra ficam explícitos; legendas não substituem CTA da bio. Removidos pedidos de conferência de link ao prospect e conclusões genéricas.
- Build e 101 testes passaram. Dez cenários de PDF locais e viewport mobile de 390 px passaram; Nicole com cinco páginas também passou no renderer Linux isolado, sem coleta ou chamada de IA.
- Correção do PDF existente da Nicole autorizada, preservando evidências reais e análise concluída. Ella foi consultada somente para validar a regra, sem nova exportação ou alteração dos dados. Publicação e exportação final concluídas e conferidas.
- Publicado o SHA `c064927c5881595b2c1e95fa7701c5f77d70fbd9`, checksum `1dc5240e3f507f35bcf6331c3c4f1695f1bcc05271ad8064e313eb3e0d9c3430`. Backup cifrado concluído antes da promoção. Smoke real da aplicação passou com cinco páginas, 214.575 bytes e sem pendência de revisão. Health interno, público e vizinhos HTTP 200; current/previous confirmados pelo executor.
- PDF existente da Nicole substituído pela exportação autenticada da aplicação: cinco páginas, 212.422 bytes. Ordem conferida: abertura sobre Google, Google, Instagram, prioridades e CTA. Todas as páginas renderizadas e verificadas visualmente. Referência de frequência em 30 dias; bio/CTA próprios; conversa sobre Google com 20 minutos, sem custo e sem compromisso. Evidências e resultados da IA preservados, sem nova coleta ou chamada paga. Sessões temporárias revogadas. Arquivo local final: `output/nicole-romano-corrigida-2026-10-07.pdf`.
