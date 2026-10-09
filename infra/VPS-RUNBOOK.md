# Dirijo GBP na VPS

Stack exclusiva `dirijo-gbp-production`, root `/srv/dirijo-gbp`, alias SSH `central-ops-ovh`. Node 24.14.0, Playwright 1.63.0 com Chromium instalado pelo próprio pacote. Aplicação não privilegiada com 2 GB/1 CPU e acesso local. Desde 08/10/2026, o ciclo oficial de migração atende `https://gbp.dirijobr.com` e preserva `https://gbp.viradadonutri.com.br` na mesma aplicação autenticada. O container ativo usa `127.0.0.1:5006`; a porta de candidatos futuros é determinada pelo executor, sem depender do endereço legado `3006`.

## Provisionamento privado

Antes da primeira publicação, criar `data/` e `backups/` com UID/GID 1000 e permissão 700. Migrar o histórico com SQLite Online Backup API, preservando `assets/`, `exports/`, `settings.enc` e `settings.key`. Não transferir banco com WAL aberto por cópia direta.

`state/production/secrets/` contém arquivos individuais `apify-token`, `openai-api-key`, `pagespeed-api-key` (pode estar vazio), `tunnel-token` e `r2-backup.json`. Somente as três credenciais dos provedores são montadas na aplicação. Tunnel e backup recebem suas próprias credenciais. Arquivos com permissão 600 precisam ser legíveis pelo UID 1000; root do diretório permanece privado para ubuntu. Não imprimir conteúdo, usar argumentos ou versionar segredos.

Formato privado do R2: JSON com `endpoint` (URL HTTPS do Worker privado de backup), `token` (bearer exclusivo), `backupEncryptionKey` (64 caracteres hexadecimais aleatórios). Guardar cópia privada da chave de backup separadamente da VPS. Bucket exclusivo e privado vinculado apenas ao Worker autenticado; limpeza diária do Worker expira snapshots após 30 dias. Não há URL pública de backup.

## Publicação

Usar executor canônico `ferramentas/vps-deploy/vps_ops.py`, operações `plan` e `run` com confirmação do SHA completo de `origin/main`, conforme ajuda do executor. Uma execução `npm run check` inclui build e testes. Manifesto exige no mínimo 10240 MiB, 15% disco e 15% inodes livres: o servidor tinha 20472 MiB livres antes da primeira imagem. Não realizar limpeza de outros projetos para publicar.

O adaptador constrói a imagem exata, sobe app e Tunnel, confere health interno e registra timer de backup exclusivo. Executor confere endpoint HTTPS e vizinhos, preserva current/previous em `state/production/`. Health básico público: `/api/health`. Login protege dados e exportações. API opera com `AUTH_ENABLED=true`.

## Backup e recuperação

Timer executa diariamente às 03h10 de São Paulo (06h10 UTC), com até 5 minutos de variação. `systemctl status dirijo-gbp-backup.timer` e `journalctl -u dirijo-gbp-backup.service` mostram sucesso/falha sem credenciais. Rodar manualmente `sudo systemctl start dirijo-gbp-backup.service` após a primeira publicação.

Helper usa SQLite Online Backup, copia os arquivos e as configurações cifradas, valida integridade, compacta e cifra o conjunto com AES-256-GCM antes do upload autenticado pelo Worker ao R2. Preserva as 7 cópias locais mais recentes somente após upload bem sucedido. Worker preserva 30 dias e realiza expiração diária. Falha de backup não remove dados nem versões anteriores e permanece visível no serviço.

Para testar recuperação, montar a mesma imagem com `backups/` e o secret R2 e executar `node infra/backup.mjs decrypt /backups/<arquivo>.enc /backups/restauracao.tar.gz`. Extrair somente em diretório temporário, abrir SQLite readOnly, validar integridade e contagem. Apagar o arquivo de recuperação descriptografado após a conferência. Para restauração efetiva, parar apenas app da stack GBP, preservar os dados correntes, substituir dados pelo snapshot e reiniciar.

Atualizações preservam backup antes da promoção; rollback binário usa exclusivamente executor e previous. No primeiro deploy, sem previous, retirar somente a nova publicação e preservar dados e backups; versão local continua acessível. Não usar prune, apagar volume ou limpar serviços vizinhos.

## Escopo de coleta vigente, 05/10/2026

A coleta analisa somente a empresa informada: Google e avaliações pelo link, site/PageSpeed quando disponíveis e Instagram. Concorrentes e Cenário local foram removidos. Preservar custos/dados históricos; eles ficam fora das leituras atuais e da síntese. Não executar nova coleta de concorrentes para recuperar diagnósticos antigos.

## Validação do diagnóstico após publicação, 07/10/2026

O adaptador `verify` executa `infra/verify-diagnostic.mjs` dentro da aplicação. Usa uma análise finalizada existente, com uma sessão de renderização limitada a esse registro, e exporta o PDF comercial servido pela nova release. Confere quatro a seis páginas, dimensões, ausência de cortes/sobreposição e cobertura do Instagram quando avaliado. Revoga a sessão e remove o PDF temporário ao terminar. Não dispara coleta, síntese paga, regeneração ou envio ao prospect. Se não houver análise finalizada, registra a ausência de amostra.

O formulário registra ausências confirmadas com método, data e referência. Dados antigos sem essa confirmação permanecem a confirmar. O PDF comercial é montado a partir das evidências preservadas a cada abertura/exportação; não é necessário refazer a coleta de diagnósticos históricos para aplicar a nova apresentação.

O backup criptografado usa multipart no R2 acima de 50 MiB, com partes limitadas a 50 MiB e confirmação do tamanho final. O Worker mantém o GET do arquivo inteiro e o formato AES-256-GCM. Antes de trocar a aplicação, o executor usa o helper de backup da release candidata sobre a imagem vigente, preservando o snapshot consistente e o gate remoto. Se o envio falhar, a aplicação vigente permanece ativa e o arquivo criptografado local é preservado.

## Migração de domínio sem interrupção, 08/10/2026

Origem canônica: `https://gbp.dirijobr.com`. `ADDITIONAL_PUBLIC_ORIGINS` mantém `https://gbp.viradadonutri.com.br` durante a coexistência. Cookies continuam restritos ao host e os dois endereços exigem autenticação própria. Não há callback Google OAuth neste produto.

O adaptador singleton anterior (`compose up -d`) não pode ser usado para esta promoção enquanto a continuidade total for obrigatória. O executor deve iniciar um candidato HTTP saudável antes de trocar ingress, com `BACKGROUND_JOBS_ENABLED=false`, `ACTIVE_BACKEND_URL` interno apontando para a aplicação anterior, `ACTIVE_BACKEND_PUBLIC_URL` igual à origem anterior e `BACKGROUND_JOBS_ENABLE_FILE` apontando para um marcador externo montado em diretório somente leitura. O candidato exige um SQLite existente e abre a conexão sem criar banco, executar migrations ou DDL, incluindo as tabelas de autenticação. Não recupera execuções nem inicia trabalho próprio; encaminha todas as requisições ao dono anterior, exceto `/api/health`. Valida Origin explicitamente antes de reescrevê-lo para o backend anterior; preserva sessão, corpo, headers e resposta.

Barreira de promoção: enviar SIGUSR2 sem marcador para colocar as novas requisições em espera, sem retornar erro. Aguardar `proxyInFlight=0`, `sourceRunsRunning=0` e `analysesCollecting=0` no health, drenar e parar o dono antigo. Criar o marcador e enviar SIGUSR2 novamente. A aplicação valida as três contagens novamente, ativa seu processamento local e libera as requisições que aguardavam. Ativação é idempotente. O marcador preservado tem prioridade no próximo boot e mantém a aplicação ativa localmente, sem voltar ao backend aposentado. Antes da ativação, SIGHUP retoma o proxy para o backend anterior em caso de cancelamento; o backend anterior precisa estar saudável. Nenhum SIGUSR1 é usado. O executor deve verificar os dois hosts e os vizinhos após a troca.

A preparação deste código não comprova publicação. SHA, checksum, health e rollback devem ser registrados no STATUS após o executor confirmar a promoção.


## Operação após a migração de 08/10/2026

A aplicação está no ciclo oficial `domain_migration.py`, com ponteiro ativo persistente. `vps_ops.py status/plan` reconhece esse ciclo; `run` prepara outro candidato HTTP paralelo e não é uma promoção concluída. Não executar o adaptador Compose diretamente, não remover os ponteiros nem reiniciar o container antigo para tentar recuperar serviço.

Para publicação futura, partir de checkout limpo na origin/main exata, manter `PUBLIC_URL=https://gbp.dirijobr.com` e `ADDITIONAL_PUBLIC_ORIGINS=https://gbp.viradadonutri.com.br` enquanto houver coexistência. Preparar candidato pelo executor oficial, revisar health e autenticação, trocar ambos os destinos Tunnel para o candidato e só então fornecer prova fresca ao `activate`. O helper drena HTTP, recusa trabalhos/conexões em execução, encerra somente a fonte, instala marcador root0444 e ativa o backend local. A variável inicial `BACKGROUND_JOBS_ENABLED=false` continua no container: após promoção, o marcador persistente controla a ativação, inclusive no reboot.

O retorno suportado é `stage-rollback` seguido da mesma revisão, roteamento e ativação com prova fresca. Current e previous finais têm o SHA `655bb7e18bb11eb2c074d63729f79e1835c3f9b4`, mas configurações distintas: current principal novo, previous principal antigo com domínio novo adicional. A seleção usa os snapshots e IDs reais de containers, não somente o SHA. O previous compatível foi preservado parado; a fonte anterior à compatibilidade não é um retorno direto permitido. Não alterar SQLite, backups, volumes, secrets nem remover containers protegidos.


## Login do administrador, 09/10/2026

O administrador Gabriel usa `adm@dirijobr.com`, com a senha existente. O e-mail é mantido em `auth_users` no SQLite compartilhado, separado do domínio público e de OAuth Google. Trocas devem preservar ID, hash de senha, papel, demais usuários e histórico, validar conflito de endereço e usar transação com conferência de integridade. O registro privado da troca de 09/10 permite reverter somente o e-mail por ID, sem restaurar o banco inteiro ou alterar a senha.


## Ajuste automático de páginas, 09/10/2026

A prévia comercial ajusta cada página somente após fontes e imagens carregarem. Recupera primeiro o espaço entre blocos e, quando necessário, reduz a escala do conteúdo até o piso de 86%, sem truncar texto. A apresentação marca `data-presentation-ready=true` somente depois desse ajuste; o exportador aguarda esse marcador antes de conferir dimensões, transbordamento e rodapé. O limite de legibilidade não substitui a rejeição de conteúdo excepcional que não cabe. Conferir PDF real e celular depois de mudanças no layout.
