#!/bin/bash

# Script para verificar que no hay archivos sensibles antes de push a main
# Uso: bash pre-deploy-check.sh

echo "Verificando cambios antes de deploy..."
echo ""

# Variables
FAILED=0
WARNINGS=0

# 1. Verificar que no hay cambios en .env
echo "[1/7] Verificando archivos .env..."
if git status | grep -E '\.env|\.env.*local' > /dev/null; then
  echo "ERROR: Hay cambios en archivos .env"
  echo "   Estos archivos NO deben estar en git"
  git status | grep -E '\.env|\.env.*local'
  FAILED=1
else
  echo "OK: Sin cambios en .env"
fi
echo ""

# 2. Verificar que .gitignore existe
echo "[2/7] Verificando .gitignore..."
if [ ! -f ".gitignore" ]; then
  echo "ERROR: .gitignore no existe"
  FAILED=1
else
  if grep -q '^.env' .gitignore && grep -q 'node_modules' .gitignore; then
    echo "OK: .gitignore configurado correctamente"
  else
    echo "WARNING: .gitignore podría estar incompleto"
    WARNINGS=1
  fi
fi
echo ""

# 3. Verificar cambios en archivos sensibles
echo "[3/7] Verificando archivos sensibles..."
FOUND_SENSITIVE=0
for file in ".env" "app/backend/.env" "app/frontend/.env" "app/backend/prisma/prod.db"; do
  if git diff --cached --name-only | grep -E "^$file" > /dev/null; then
    echo "ERROR: Cambio en archivo sensible: $file"
    FOUND_SENSITIVE=1
    FAILED=1
  fi
done

if [ $FOUND_SENSITIVE -eq 0 ]; then
  echo "OK: Sin cambios en archivos sensibles"
fi
echo ""

# 4. Verificar node_modules no está en cambios
echo "[4/7] Verificando que node_modules no está tracked..."
if git diff --cached --name-only | grep -E 'node_modules' > /dev/null; then
  echo "ERROR: node_modules está en cambios"
  FAILED=1
else
  echo "OK: node_modules no está tracked"
fi
echo ""

# 5. Resumen de cambios
echo "[5/7] Resumen de cambios..."
echo "Files a ser committed:"
echo ""
git diff --cached --name-only | head -20
echo ""

# 6. Verificar rama actual
echo "[6/7] Verificando rama actual..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Rama actual: $CURRENT_BRANCH"
echo ""

# 7. Confirmación final
echo "[7/7] Confirmacion final..."
echo ""

if [ $FAILED -eq 0 ]; then
  echo "PRE-DEPLOY CHECK: APROBADO"
  echo ""
  echo "Seguro hacer: git push origin $CURRENT_BRANCH"
  if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Seguro hacer: git checkout main && git merge $CURRENT_BRANCH && git push origin main"
  fi
else
  echo "PRE-DEPLOY CHECK: FALLIDO"
  echo ""
  echo "NO hacer push hasta corregir los errores arriba"
  exit 1
fi
