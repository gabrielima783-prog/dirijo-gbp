# Dirijo GBP: estado operacional

Atualizado em 05/10/2026.

## Produção

Publicado em https://gbp.viradadonutri.com.br, na VPS `central-ops-ovh`, stack exclusiva `dirijo-gbp-production`. Entrada HTTPS por Tunnel dedicado da Cloudflare; aplicação vinculada somente à porta local 3006. Banco, arquivos, credenciais e backups separados dos demais projetos.

Release em produção: `baff700e0c4b21361966f2f445ef3c2db06b3ce7`, pacote SHA-256 `1418099154bfea21116f6806ba7a839443edc63578d7d8767e27bdf94ced7271`. Publicação executada pelo manifesto `.deploy/vps.json` e executor canônico. `current` aponta para essa release; `previous` para `07ce088d5893f5698a395bdc812410c8c1f15e87`. Rollback binário disponível pelo executor. Limpeza automática do executor preservou releases protegidas, banco, arquivos e backups.

Health interno e externo passaram. Dirijo Ops, Dirijo Flow, Dirijo Content e Assistente Pessoal continuaram retornando 200 depois da publicação. Disco após deploy: 20% livre, 20.801.308 KiB disponíveis, 89% de inodes livres.

## Acesso e uso

Autenticação própria por e-mail/senha, sessões persistentes no SQLite e troca obrigatória da senha inicial. Gabriel possui perfil administrador; Iuri possui perfil operador. Identificadores e senhas de primeiro acesso ficam em arquivos individuais privados fora do Git. Nenhum convite ou e-mail foi enviado.

Operador pode criar, consultar, duplicar, gerar e editar diagnósticos e baixar PDFs do histórico compartilhado. Configurações, exclusão e autorização de exceder orçamento são restritas ao administrador. Coleta, nova tentativa, regeneração e exportação PDF possuem trava de uma operação pesada por vez. Execuções interrompidas por reinício ficam sinalizadas para revisão manual, sem repetição automática de chamadas pagas.

Os 32 diagnósticos locais foram migrados por snapshot consistente, junto dos arquivos e configurações cifradas. A base local original permanece preservada. Fonte/builds anteriores preservados em `/Users/gabriellima/Desktop/ClaudeCode/Code.IA-local-preserved-20261005/dirijo-gbp`; código compartilhado possui repositório próprio `gabrielima783-prog/dirijo-gbp`.

A listagem carrega somente resumos; detalhes, provas e imagens são carregados ao abrir o diagnóstico. Verificação com 33 registros: 17.271 bytes na listagem.

## Validação e backup

`npm run check` passou com build e 51 testes. Acesso de operador validado em navegador; consulta anônima bloqueada (401), configurações e exclusão bloqueadas para operador (403). Usuários/sessão persistiram na atualização entre releases.

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
