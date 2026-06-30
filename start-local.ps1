# ============================================================
# DIASPO'ACTIF — Démarrage serveur local
# Usage : ./start-local.ps1
# ============================================================

Write-Host "🚀 Démarrage Diaspo'Actif en local..." -ForegroundColor Cyan

# Charger les variables d'environnement depuis .env
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.+)$") {
            $name = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "✅ Variables d'environnement chargées" -ForegroundColor Green
} else {
    Write-Host "❌ Fichier .env introuvable" -ForegroundColor Red
    exit 1
}

# Vérifier les dépendances
if (-not (Test-Path "server/node_modules/pg")) {
    Write-Host "📦 Installation des dépendances..." -ForegroundColor Yellow
    Set-Location server
    npm install
    Set-Location ..
}

Write-Host "🌐 Serveur démarré sur http://localhost:3000" -ForegroundColor Green
Write-Host "   Ctrl+C pour arrêter`n" -ForegroundColor Gray

node server/index.js
