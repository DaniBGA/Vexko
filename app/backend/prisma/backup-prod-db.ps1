Param(
  [string]$DbPath = ".\\prisma\\prisma\\prod.db",
  [string]$BackupDir = ".\\backups"
)

if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
  Write-Error "sqlite3 not found in PATH"
  exit 2
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $BackupDir ("prod.db." + $timestamp)
& sqlite3 $DbPath ".backup '$backupPath'"
Write-Output ("Backup saved to " + $backupPath)
