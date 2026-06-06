# Script para verificar que no hay archivos sensibles antes de push a main
# Uso en PowerShell: .\pre-deploy-check.ps1

Write-Host "🔍 Verificando cambios antes de deploy...`n" -ForegroundColor Cyan

$FAILED = 0
$WARNINGS = 0

# 1. Verificar que no hay cambios en .env
Write-Host "[1/5] Verificando archivos .env..." -ForegroundColor Yellow
$envFiles = git diff --cached --name-only 2>$null | Select-String -Pattern '\.env'

if ($envFiles) {
    Write-Host "❌ ERROR: Hay cambios en archivos .env" -ForegroundColor Red
    Write-Host "   Estos archivos NO deben estar en git`n"
    $envFiles | Write-Host
    $FAILED = 1
} else {
    Write-Host "✅ OK: Sin cambios en .env`n" -ForegroundColor Green
}

# 2. Verificar que .gitignore existe
Write-Host "[2/5] Verificando .gitignore..." -ForegroundColor Yellow
if (-Not (Test-Path ".gitignore")) {
    Write-Host "❌ ERROR: .gitignore no existe`n" -ForegroundColor Red
    $FAILED = 1
} else {
    $gitignoreContent = Get-Content ".gitignore" -Raw
    if ($gitignoreContent -match '\.env' -and $gitignoreContent -match 'node_modules') {
        Write-Host "✅ OK: .gitignore configurado correctamente`n" -ForegroundColor Green
    } else {
        Write-Host "⚠️  WARNING: .gitignore podría estar incompleto`n" -ForegroundColor Yellow
        $WARNINGS = 1
    }
}

# 3. Verificar cambios en archivos sensibles
Write-Host "[3/5] Verificando archivos sensibles..." -ForegroundColor Yellow
$sensitivePatterns = @('\.env', 'app/backend/\.env', 'app/frontend/\.env', 'prod\.db', '\.db-journal')
$foundSensitive = 0

foreach ($pattern in $sensitivePatterns) {
    $match = git diff --cached --name-only 2>$null | Select-String -Pattern $pattern
    if ($match) {
        Write-Host "❌ ERROR: Cambio en archivo sensible: $pattern" -ForegroundColor Red
        $foundSensitive = 1
        $FAILED = 1
    }
}

if ($foundSensitive -eq 0) {
    Write-Host "✅ OK: Sin cambios en archivos sensibles`n" -ForegroundColor Green
}

# 4. Verificar node_modules no está en cambios
Write-Host "[4/5] Verificando que node_modules no está tracked..." -ForegroundColor Yellow
$nodeModules = git diff --cached --name-only 2>$null | Select-String -Pattern 'node_modules'

if ($nodeModules) {
    Write-Host "❌ ERROR: node_modules está en cambios" -ForegroundColor Red
    $FAILED = 1
} else {
    Write-Host "✅ OK: node_modules no está tracked`n" -ForegroundColor Green
}

# 5. Resumen de cambios
Write-Host "[5/5] Resumen de cambios..." -ForegroundColor Yellow
Write-Host "Files a ser committed:`n"

$files = git diff --cached --name-only 2>$null
if ($files) {
    $fileList = $files | Select-Object -First 20
    $fileList | Write-Host
    $totalFiles = ($files | Measure-Object).Count
    if ($totalFiles -gt 20) {
        Write-Host "... y $($totalFiles - 20) más`n"
    }
} else {
    Write-Host "Sin cambios staged`n"
}

# Resultado final
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan

if ($FAILED -eq 0) {
    Write-Host "✅ PRE-DEPLOY CHECK: APROBADO`n" -ForegroundColor Green
    if ($WARNINGS -gt 0) {
        Write-Host "⚠️  Pero revisa los warnings arriba`n" -ForegroundColor Yellow
    }
    Write-Host "✅ Seguro hacer: git push origin tu-rama"
    Write-Host "✅ Seguro hacer: git merge a main y push`n"
} else {
    Write-Host "❌ PRE-DEPLOY CHECK: FALLIDO`n" -ForegroundColor Red
    Write-Host "No hacer push hasta corregir los errores arriba`n"
    Write-Host "Comandos útiles:"
    Write-Host '  git reset HEAD <archivo>      # Sacar archivo del stage'
    Write-Host '  git checkout -- <archivo>     # Descartar cambios'
    exit 1
}

Write-Host "═══════════════════════════════════════════════`n" -ForegroundColor Cyan
