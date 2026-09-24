#!/usr/bin/env bash
set -euo pipefail

required_major=24

run_system() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_node_if_missing() {
  echo "Node.js não foi encontrado. Tentando instalar automaticamente..."

  if command -v brew >/dev/null 2>&1; then
    brew install node@24 || brew install node
    local node24_prefix
    node24_prefix="$(brew --prefix node@24 2>/dev/null || true)"
    if [[ -n "${node24_prefix}" ]]; then
      export PATH="${node24_prefix}/bin:${PATH}"
    fi
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    run_system apt-get update
    run_system apt-get install -y nodejs npm
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    run_system dnf install -y nodejs npm
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    run_system pacman -Sy --noconfirm nodejs npm
    return
  fi

  echo "Não encontrei Homebrew, apt, dnf ou pacman para instalar o Node.js."
}

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"

if [[ -z "${node_major}" ]]; then
  install_node_if_missing
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
fi

if [[ -z "${node_major}" ]]; then
  echo "Node.js 24, 25 ou 26 é obrigatório. Instale em https://nodejs.org/ e rode este script novamente."
  exit 1
fi

if (( node_major < required_major || node_major >= 27 )); then
  echo "Versão encontrada: Node.js $(node --version). Este projeto aceita Node.js 24, 25 ou 26."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm não foi encontrado. Reinstale o Node.js incluindo o npm."
  exit 1
fi

echo "Instalando dependências..."
npm ci

echo "Instalando o Chromium usado nas capturas e PDFs..."
npx playwright install chromium

mkdir -p data/assets data/uploads data/exports

echo "Gerando o painel..."
npm run build

echo
echo "Instalação concluída. Inicie com: npm start"
echo "Depois abra: http://127.0.0.1:8787"
