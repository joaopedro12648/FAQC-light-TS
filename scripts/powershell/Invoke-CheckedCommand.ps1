<#
  PowerShell command wrapper (ASCII-only; UTF-8 without BOM).
  - Executes the given command and arguments as-is (no shell magic).
  - Always prints full STDOUT/STDERR followed by "EXIT_CODE:<n>".
  - On failure (exit!=0): prints a brief summary with command/exit and then full STDERR/STDOUT.
  - On wrapper failure, prints "WRAPPER_ERROR: <message>" and exits non-zero.
#>
param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]] $RawArgs
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

# Capture outputs to temp files for reliable post-processing
$tmpDir = [System.IO.Path]::GetTempPath()
$tmpOut = Join-Path $tmpDir ("invoke_wr_out_" + [System.Guid]::NewGuid().ToString("N") + ".log")
$tmpErr = Join-Path $tmpDir ("invoke_wr_err_" + [System.Guid]::NewGuid().ToString("N") + ".log")

try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Command
    $psi.Arguments = [string]::Join(' ', $CommandArgs)
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    if (-not $proc.Start()) {
        throw "Failed to start process."
    }
    $stdOutAsync = $proc.StandardOutput.ReadToEndAsync()
    $stdErrAsync = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()
    $stdout = $stdOutAsync.GetAwaiter().GetResult()
    $stderr = $stdErrAsync.GetAwaiter().GetResult()

    # Normalize to UTF-8 without BOM on write
    [System.IO.File]::WriteAllText($tmpOut, $stdout, $utf8NoBom)
    [System.IO.File]::WriteAllText($tmpErr, $stderr, $utf8NoBom)

    $exitCode = [int]$proc.ExitCode

    if ($exitCode -eq 0) {
        if ($stdout) { Write-Output $stdout }
        if ($stderr) { Write-Output $stderr }
    } else {
        Write-Output ("CMD: {0} {1}" -f $Command, ($psi.Arguments))
        Write-Output ("EXIT: {0}" -f $exitCode)
        if ($stderr) {
            Write-Output "STDERR:"
            Write-Output $stderr
        }
        if ($stdout) {
            Write-Output "STDOUT:"
            Write-Output $stdout
        }
    }
}
catch {
    $exitCode = 1
    Write-Output ("WRAPPER_ERROR: {0}" -f $_.ToString())
}
finally {
    # Best-effort cleanup
    try { if (Test-Path $tmpOut) { Remove-Item -Force $tmpOut } } catch {}
    try { if (Test-Path $tmpErr) { Remove-Item -Force $tmpErr } } catch {}
}

Write-Output ("EXIT_CODE:{0}" -f $exitCode)
exit $exitCode


