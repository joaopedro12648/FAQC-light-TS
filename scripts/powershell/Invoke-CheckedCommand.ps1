<#
  PowerShell command wrapper (ASCII-only; UTF-8 without BOM).
  - Executes the given command and arguments as-is.
  - Streams stdout/stderr without extra formatting.
  - Prints a single line "EXIT_CODE:<n>" at the end.
  - On wrapper failure, prints "WRAPPER_ERROR: <message>" and exits non-zero.
#>
param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]
    $RawArgs
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$ErrorActionPreference = 'Stop'
$exitCode = 0

if (-not $RawArgs -or $RawArgs.Length -lt 1) {
    Write-Output "WRAPPER_ERROR: Command not specified."
    Write-Output "EXIT_CODE:1"
    exit 1
}

$Command = $RawArgs[0]
$CommandArgs = @()
if ($RawArgs.Length -gt 1) {
    $CommandArgs = $RawArgs[1..($RawArgs.Length - 1)]
}

try {
    & $Command @CommandArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            # Print PowerShell errors as strings
            Write-Output $_.ToString()
        }
        else {
            Write-Output $_
        }
    }

    if ($LASTEXITCODE -ne $null) {
        $exitCode = [int]$LASTEXITCODE
    }
    elseif ($?) {
        $exitCode = 0
    }
    else {
        $exitCode = 1
    }
}
catch {
    $exitCode = 1
    Write-Output ("WRAPPER_ERROR: {0}" -f $_.ToString())
}

Write-Output ("EXIT_CODE:{0}" -f $exitCode)
exit $exitCode


