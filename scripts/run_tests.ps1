$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$projectPython = Join-Path $repositoryRoot '.venv\Scripts\python.exe'

Set-Location $repositoryRoot

if (Test-Path $projectPython) {
    & $projectPython -m unittest discover -s packages\api -p "test_*.py" -v
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -m unittest discover -s packages\api -p "test_*.py" -v
} else {
    & python -m unittest discover -s packages\api -p "test_*.py" -v
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    & node --check apps\web\static\app.js
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
