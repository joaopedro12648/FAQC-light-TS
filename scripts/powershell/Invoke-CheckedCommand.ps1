<#
  PowerShell コマンドラッパ
  - 任意コマンドと引数を受け取り、そのまま実行する
  - stdout/stderr を統合して逐次出力する（追加整形は行わない）
  - 最後に EXIT_CODE:<n> 形式で終了コードを1行出力する
  - ラッパ内部の異常は WRAPPER_ERROR: プレフィックス付きで出力し、非0終了とする
  - ラッパの入出力（stdout/stderr/EXIT_CODE 行）は UTF-8 (BOM 無し) に固定する
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
    Write-Output "WRAPPER_ERROR: コマンドが指定されていません。"
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
            # PowerShell のエラーも文字列としてそのまま出力する
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


