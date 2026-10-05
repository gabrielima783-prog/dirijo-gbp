# Dirijo GBP na VPS

Stack exclusiva `dirijo-gbp-production`, root `/srv/dirijo-gbp`, alias SSH `central-ops-ovh`. Node 24.14.0, Playwright 1.63.0 com Chromium instalado pelo próprio pacote. Aplicação não privilegiada com 2 GB/1 CPU e acesso somente `127.0.0.1:3006`; Tunnel dedicado serve `https://gbp.viradadonutri.com.br` apontando para `http://app:8787` na rede Compose.

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
