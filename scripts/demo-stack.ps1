<#
  Start the demo stack for one journey, stopping whichever journey was running. Takes a few seconds.

    scripts\demo-stack.ps1 water        # the water board, on clicker_demo   (API :8200, app :5273)
    scripts\demo-stack.ps1 clearance    # the clearing agency, on clicker_port (API :8201, app :5274)

  Needs, in the repo's .env: DEMO_DATABASE_SERVER (for example postgresql://postgres@127.0.0.1:5433).
  The two journeys never share a database: each is its own, and the backend exposes only that
  journey's models and roles (CLICKER_JOURNEY).
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('water', 'clearance')][string]$Journey
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$server = $null
foreach ($line in Get-Content (Join-Path $root '.env')) {
    if ($line -match '^DEMO_DATABASE_SERVER=(.+)$') { $server = $Matches[1].Trim() }
}
if (-not $server) { throw 'Set DEMO_DATABASE_SERVER in .env (see .env.example).' }

$plan = @{
    water     = @{ Database = 'clicker_demo'; Api = 8200; Web = 5273 }
    clearance = @{ Database = 'clicker_port'; Api = 8201; Web = 5274 }
}[$Journey]

# Whatever is listening on either journey's ports goes first.
foreach ($port in 8200, 8201, 5273, 5274) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

$env:DATABASE_URL = "$server/$($plan.Database)"
$env:CLICKER_JOURNEY = $Journey
$env:CORS_ALLOWED_ORIGINS = "http://localhost:$($plan.Web),http://127.0.0.1:$($plan.Web)"
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
Start-Process -FilePath $python -ArgumentList @('backend\manage.py', 'runserver', "0.0.0.0:$($plan.Api)") `
    -WorkingDirectory $root -WindowStyle Minimized

$env:VITE_API_URL = "http://localhost:$($plan.Api)/api"
Start-Process -FilePath 'npm.cmd' -ArgumentList @('--prefix', 'frontend', 'run', 'dev', '--', '--port', "$($plan.Web)", '--strictPort') `
    -WorkingDirectory $root -WindowStyle Minimized

Write-Host "Starting $Journey on $($plan.Database): open http://localhost:$($plan.Web)"
