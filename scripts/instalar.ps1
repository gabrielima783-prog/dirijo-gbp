$ErrorActionPreference = "Stop"

function Get-NodeVersion {
  try {
    return (node --version 2>$null)
  } catch {
    return $null
  }
}

$nodeVersion = Get-NodeVersion
if (-not $nodeVersion) {
  Write-Host "Node.js não foi encontrado. Tentando instalar automaticamente..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
  } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    choco install nodejs-lts -y
  } elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
    scoop install nodejs-lts
  } else {
    Write-Error "Não encontrei winget, Chocolatey ou Scoop. Instale Node.js em https://nodejs.org/ e rode este script novamente."
  }

  $env:Path = "$env:ProgramFiles\nodejs;$env:Path"
  $nodeVersion = Get-NodeVersion
}

if (-not $nodeVersion) {
  Write-Error "A instalação automática não encontrou o Node.js nesta sessão. Feche e abra o PowerShell e rode o instalador novamente."
}

$nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 24 -or $nodeMajor -ge 27) {
  Write-Error "Versão encontrada: $nodeVersion. Este projeto aceita Node.js 24, 25 ou 26."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm não foi encontrado. Reinstale o Node.js incluindo o npm."
}

Write-Host "Instalando dependências..."
npm ci

Write-Host "Instalando o Chromium usado nas capturas e PDFs..."
npx playwright install chromium

New-Item -ItemType Directory -Force -Path "data/assets", "data/uploads", "data/exports" | Out-Null

Write-Host "Gerando o painel..."
npm run build

Write-Host ""
Write-Host "Instalação concluída. Inicie com: npm start"
Write-Host "Depois abra: http://127.0.0.1:8787"
