$ErrorActionPreference = "Stop"

function Test-NodeCandidate {
  param([string]$Candidate)

  if (-not $Candidate -or -not (Test-Path -LiteralPath $Candidate)) {
    return $false
  }

  try {
    & $Candidate -v *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Resolve-ProjectNode {
  $candidates = New-Object System.Collections.Generic.List[string]

  if ($env:AIVILIZATION_NODE) {
    $candidates.Add($env:AIVILIZATION_NODE)
  }

  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    $candidates.Add($command.Source)
  }

  $candidates.Add((Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"))
  $candidates.Add("C:\Program Files\nodejs\node.exe")
  $candidates.Add("C:\Program Files (x86)\nodejs\node.exe")

  foreach ($candidate in $candidates) {
    if (Test-NodeCandidate $candidate) {
      return $candidate
    }
  }

  throw "No runnable Node.js executable was found. Install Node.js or set AIVILIZATION_NODE to node.exe."
}

$node = Resolve-ProjectNode
Write-Host "Using Node: $node"
& $node @args
exit $LASTEXITCODE
