# Windows - Guía rápida para deploy

## Para ejecutar el script de verificación en Windows:

### Opción 1: PowerShell (Recomendado)

```powershell
cd E:\Vexus\Desarrollo\Vexko
.\pre-deploy-check-simple.ps1
```

**Si ves un error de "no se reconoce", intenta:**

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
.\pre-deploy-check-simple.ps1
```

### Opción 2: PowerShell ISE

1. Haz clic derecho en `pre-deploy-check-simple.ps1`
2. Selecciona "Open with PowerShell ISE"
3. Presiona F5 para ejecutar

### Opción 3: Git Bash (si está instalado)

Abre Git Bash en la carpeta raíz del proyecto y ejecuta:

```bash
bash pre-deploy-check.sh
```

---

## Flujo de Deploy en Windows - Paso a paso

### 1. Abre PowerShell en la raíz del proyecto

```
cd E:\Vexus\Desarrollo\Vexko
```

### 2. Verifica que todo está limpio

```powershell
.\pre-deploy-check-simple.ps1
```

Espera hasta ver:
```
OK: PRE-DEPLOY CHECK APROBADO
```

### 3. Si ves errores:

- **ERROR: Hay cambios en archivos .env**
  - Solución: Asegúrate que `.env` no está staged
  - Ejecuta: `git reset HEAD .env`

- **ERROR: node_modules está en cambios**
  - Solución: Asegúrate que node_modules no está tracked
  - Verifica `.gitignore` contiene `node_modules/`

### 4. Agregar cambios

```powershell
git add .
git commit -m "feat: descripción del cambio"
```

### 5. Verificar nuevamente

```powershell
.\pre-deploy-check-simple.ps1
```

### 6. Pasar a main

```powershell
git checkout main
git pull origin main
git merge desarrollo
git push origin main
```

---

## Cuando hagas push exitosamente:

```
[main abc1234] feat: descripción del cambio
 X files changed, Y insertions(+), Z deletions(-)
```

Significa ✅ tu código está en `main`, listo para deploy en Hostinger.

---

## Referencia rápida

| Comando | Qué hace |
|---------|----------|
| `.\pre-deploy-check-simple.ps1` | Verifica que no hay archivos sensibles |
| `git status` | Ver cambios actuales |
| `git add .` | Agregar todos los cambios |
| `git commit -m "..."` | Guardar cambios con mensaje |
| `git push origin main` | Enviar a repositorio remoto |
| `git log --oneline -5` | Ver últimos 5 commits |

---

## Próximo paso

Una vez que hagas `git push origin main`, continúa con:
- [DEPLOY.md](DEPLOY.md) - Deploy en servidor Hostinger KVN2
