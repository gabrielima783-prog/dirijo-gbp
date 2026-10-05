# Dirijo GBP: estado operacional

Atualizado em 05/10/2026.

## Produção

Publicado em https://gbp.viradadonutri.com.br, na VPS `central-ops-ovh`, stack exclusiva `dirijo-gbp-production`. Entrada HTTPS por Tunnel dedicado da Cloudflare; aplicação vinculada somente à porta local 3006. Banco, arquivos, credenciais e backups separados dos demais projetos.

Release em produção: `146ca31350504c66f39f968091ec4d273b62ecc0`, pacote SHA-256 `9f44e43ac293332d20d12e81cf870ecf546b29a288bc681456a0d7aaf60493c5`. Publicação executada pelo manifesto `.deploy/vps.json` e executor canônico. `current` aponta para essa release; `previous` para `0915d49dc5a3b1684db2a9b2d3831485eff3b08f`. Rollback binário disponível pelo executor. Nenhum prune ou limpeza de outras stacks foi executado.

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

Runbook: `infra/VPS-RUNBOOK.md`.
