# Script para verificar que no hay archivos sensibles antes de push a main
# Uso en PowerShell: .\pre-deploy-check-simple.ps1

Write-Host "[PRE-DEPLOY CHECK] Verificando cambios antes de deploy..." -ForegroundColor Cyan
Write-Host ""

$FAILED = 0

# 1. Verificar que no hay cambios en .env
Write-Host "[1/4] Verificando archivos .env..."
$envFiles = git diff --cached --name-only 2>$null | Select-String -Pattern '\.env'

if ($envFiles) {
    Write-Host "ERROR: Hay cambios en archivos .env" -ForegroundColor Red
    Write-Host "   Estos archivos NO deben estar en git" -ForegroundColor Red
    $envFiles | Write-Host
    $FAILED = 1
} else {
    Write-Host "OK: Sin cambios en .env" -ForegroundColor Green
}
Write-Host ""

# 2. Verificar .gitignore
Write-Host "[2/4] Verificando .gitignore..."
if (-Not (Test-Path ".gitignore")) {
    Write-Host "ERROR: .gitignore no existe" -ForegroundColor Red
    $FAILED = 1
} else {
    Write-Host "OK: .gitignore existe" -ForegroundColor Green
}
Write-Host ""

# 3. Verificar node_modules
Write-Host "[3/4] Verificando que node_modules no esta tracked..."
$nodeModules = git diff --cached --name-only 2>$null | Select-String -Pattern 'node_modules'

if ($nodeModules) {
    Write-Host "ERROR: node_modules esta en cambios" -ForegroundColor Red
    $FAILED = 1
} else {
    Write-Host "OK: node_modules no esta tracked" -ForegroundColor Green
}
Write-Host ""

# 4. Resumen de cambios
Write-Host "[4/4] Resumen de cambios..."
Write-Host "Files a ser committed:" -ForegroundColor Cyan

$files = git diff --cached --name-only 2>$null
if ($files) {
    if ($files -is [array]) {
        $files | Select-Object -First 20 | Write-Host
        if ($files.Count -gt 20) {
            Write-Host "... y $($files.Count - 20) mas"
        }
    } else {
        Write-Host $files
    }
} else {
    Write-Host "Sin cambios staged"
}
Write-Host ""

# Resultado final
Write-Host "===================================================" -ForegroundColor Cyan

if ($FAILED -eq 0) {
    Write-Host "OK: PRE-DEPLOY CHECK APROBADO" -ForegroundColor Green
    Write-Host ""
    Write-Host "Seguro hacer: git push origin tu-rama" -ForegroundColor Green
    Write-Host "Seguro hacer: git merge a main y push" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "ERROR: PRE-DEPLOY CHECK FALLIDO" -ForegroundColor Red
    Write-Host ""
    Write-Host "NO hacer push hasta corregir los errores" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "===================================================" -ForegroundColor Cyan
