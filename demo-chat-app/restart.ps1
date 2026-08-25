[CmdletBinding()]
param(
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$PidFile = Join-Path $ProjectRoot '.demo-dev.pid.json'
$LogDirectory = Join-Path $ProjectRoot 'logs'
$StdoutLog = Join-Path $LogDirectory 'dev.out.log'
$StderrLog = Join-Path $LogDirectory 'dev.err.log'
$BackendPort = 3101
$BackendEnvFile = Join-Path $ProjectRoot 'backend\.env'
if (Test-Path -LiteralPath $BackendEnvFile) {
    foreach ($line in Get-Content -LiteralPath $BackendEnvFile) {
        if ($line -match '^\s*PORT\s*=\s*["'']?(\d+)') {
            $BackendPort = [int]$Matches[1]
            break
        }
    }
}
$BackendUrl = "http://localhost:$BackendPort/health"
$FrontendUrl = 'http://localhost:5174'

function Stop-TrackedProcessTree {
    if (-not (Test-Path -LiteralPath $PidFile)) {
        return
    }

    try {
        $record = Get-Content -LiteralPath $PidFile -Raw | ConvertFrom-Json
        if ($record.projectRoot -ne $ProjectRoot) {
            Write-Warning 'PID 文件不属于当前 Demo，已跳过停止操作。'
            return
        }

        $rootProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)" -ErrorAction SilentlyContinue
        if (-not $rootProcess) {
            return
        }

        if ($rootProcess.CommandLine -notmatch 'npm' -or $rootProcess.CommandLine -notmatch 'run\s+dev') {
            Write-Warning "PID $($record.pid) 已被其他程序使用，已跳过停止操作。"
            return
        }

        Write-Host "正在停止旧的 Demo 进程树（PID $($record.pid)）..."
        $allProcesses = Get-CimInstance Win32_Process
        $childrenByParent = $allProcesses | Group-Object ParentProcessId -AsHashTable -AsString
        $queue = [System.Collections.Generic.Queue[object]]::new()
        $visited = [System.Collections.Generic.HashSet[int]]::new()
        $processTree = [System.Collections.Generic.List[object]]::new()
        $queue.Enqueue($rootProcess)

        while ($queue.Count -gt 0) {
            $current = $queue.Dequeue()
            $currentId = [int]$current.ProcessId
            if (-not $visited.Add($currentId)) {
                continue
            }

            $processTree.Add($current)
            foreach ($child in @($childrenByParent["$currentId"])) {
                # Parent PIDs may be reused on Windows. A real child cannot be older than its parent.
                if ($child.CreationDate -ge $current.CreationDate) {
                    $queue.Enqueue($child)
                }
            }
        }

        for ($index = $processTree.Count - 1; $index -ge 0; $index--) {
            Stop-Process -Id ([int]$processTree[$index].ProcessId) -Force -ErrorAction SilentlyContinue
        }
    }
    finally {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Test-Url([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

Stop-TrackedProcessTree

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
Set-Content -LiteralPath $StdoutLog -Value ''
Set-Content -LiteralPath $StderrLog -Value ''

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$process = Start-Process `
    -FilePath $npm `
    -ArgumentList @('run', 'dev') `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -WindowStyle Hidden `
    -PassThru

@{
    pid = $process.Id
    projectRoot = $ProjectRoot
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $PidFile

Write-Host "已启动 Demo（PID $($process.Id)），正在等待服务就绪..."
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

do {
    if ($process.HasExited) {
        $details = Get-Content -LiteralPath $StderrLog -Tail 20 -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        throw "Demo 启动进程已退出。`n$($details -join "`n")"
    }

    if ((Test-Url $BackendUrl) -and (Test-Url $FrontendUrl)) {
        Write-Host 'Demo 重启成功：' -ForegroundColor Green
        Write-Host "  前端：$FrontendUrl"
        Write-Host "  后端：$BackendUrl"
        Write-Host "  日志：$LogDirectory"
        exit 0
    }

    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

$stderrTail = Get-Content -LiteralPath $StderrLog -Tail 20 -ErrorAction SilentlyContinue
Stop-TrackedProcessTree
throw "等待本地服务就绪超时。请检查 $StderrLog。`n$($stderrTail -join "`n")"
