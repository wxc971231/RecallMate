param([string]$PortableFolder)
$ErrorActionPreference = 'Stop'
$recallWorkspace = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (-not $PortableFolder) {
    $recallVersion = (Get-Content -LiteralPath (Join-Path $recallWorkspace 'package.json') -Raw | ConvertFrom-Json).version
    $PortableFolder = Join-Path $recallWorkspace ('release\RecallMate-' + $recallVersion + '-Portable')
}
$recallSource = (Resolve-Path -LiteralPath $PortableFolder).Path
$recallTestRoot = Join-Path $recallWorkspace ('artifacts\portable-process-' + [Guid]::NewGuid().ToString())
$recallFirst = Join-Path $recallTestRoot '位置 A'
$recallSecond = Join-Path $recallTestRoot '移动后的 B'
[System.IO.Directory]::CreateDirectory($recallTestRoot) | Out-Null
Copy-Item -LiteralPath $recallSource -Destination $recallFirst -Recurse
if (Get-ChildItem -LiteralPath (Join-Path $recallFirst 'data\banks') -File) { throw 'Process test requires the clean distribution, not a folder containing personal banks.' }
$recallBankId = [Guid]::NewGuid().ToString()
$recallQuestionId = [Guid]::NewGuid().ToString()
$recallTime = [DateTime]::UtcNow.ToString('o')
$recallSeed = @{
    schemaVersion = 1
    bank = @{
        schemaVersion=1; id=$recallBankId; name='便携目录验证'; createdAt=$recallTime; updatedAt=$recallTime
        questions=@(@{id=$recallQuestionId;sourceText='测试{{甲}}';createdAt=$recallTime;updatedAt=$recallTime})
        stats=@{$recallQuestionId=@{attemptCount=0;wrongAttemptCount=0;helpAttemptCount=0;independentCorrectCount=0;inWrongBook=$false}}
    }
}
$recallSeedPath = Join-Path $recallFirst ('data\banks\' + $recallBankId + '.json')
[System.IO.File]::WriteAllText($recallSeedPath,($recallSeed | ConvertTo-Json -Depth 15),[System.Text.UTF8Encoding]::new($false))
$recallSeedHash = (Get-FileHash -LiteralPath $recallSeedPath -Algorithm SHA256).Hash
$recallSettingsPath = Join-Path $recallFirst 'data\app-settings.json'
[System.IO.File]::WriteAllText($recallSettingsPath,'{"schemaVersion":1,"uiFontSize":20,"practiceFontSize":40}',[System.Text.UTF8Encoding]::new($false))
$recallSettingsHash = (Get-FileHash -LiteralPath $recallSettingsPath -Algorithm SHA256).Hash
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RecallMatePortableTestWindows {
    private delegate bool WindowCallback(IntPtr handle, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern bool GetExitCodeProcess(IntPtr handle, out uint exitCode);
    public static uint ReadExitCode(IntPtr handle) {
        uint code; if (!GetExitCodeProcess(handle, out code)) throw new InvalidOperationException("Cannot read test process exit code.");
        return code;
    }
    public static int CloseOwnedWindows(int ownedProcessId) {
        int count = 0;
        EnumWindows((handle, state) => {
            uint owner; GetWindowThreadProcessId(handle, out owner);
            if (owner == ownedProcessId) { PostMessage(handle, 0x0010, IntPtr.Zero, IntPtr.Zero); count++; }
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
'@
$recallChecks = [System.Collections.Generic.List[string]]::new()
$recallOriginalTest = $env:RECALLMATE_TEST
$recallOriginalData = $env:RECALLMATE_DATA_DIR
$recallOriginalNode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:RECALLMATE_TEST = '1'
    $env:RECALLMATE_DATA_DIR = Join-Path $recallTestRoot 'must-not-be-used'
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    foreach ($recallFolder in @($recallFirst,$recallSecond)) {
        if ($recallFolder -eq $recallSecond) {
            # Verify both absolute move targets remain inside this test's own workspace directory.
            $recallMoveSource = [System.IO.Path]::GetFullPath($recallFirst)
            $recallMoveDestination = [System.IO.Path]::GetFullPath($recallSecond)
            $recallMoveBoundary = [System.IO.Path]::GetFullPath($recallTestRoot) + [System.IO.Path]::DirectorySeparatorChar
            if (-not $recallMoveSource.StartsWith($recallMoveBoundary) -or -not $recallMoveDestination.StartsWith($recallMoveBoundary)) { throw 'Refusing unexpected test-folder move.' }
            Move-Item -LiteralPath $recallMoveSource -Destination $recallMoveDestination
        }
        $recallLogRoot = Join-Path $recallFolder 'data\logs'
        $recallProcess = Start-Process -FilePath (Join-Path $recallFolder 'RecallMate.exe') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $recallLogRoot 'process-test.stdout.log') -RedirectStandardError (Join-Path $recallLogRoot 'process-test.stderr.log')
        $recallProcessHandle = $recallProcess.Handle
        try {
            $recallDeadline = [DateTime]::UtcNow.AddSeconds(20)
            while (-not (Test-Path -LiteralPath (Join-Path $recallFolder 'data\runtime\Cache'))) {
                $recallProcess.Refresh()
                if ($recallProcess.HasExited) { throw ('Packaged executable exited early: ' + $recallProcess.ExitCode) }
                if ([DateTime]::UtcNow -gt $recallDeadline) { throw 'Packaged executable did not create its local runtime cache.' }
                Start-Sleep -Milliseconds 100
            }
            Start-Sleep -Milliseconds 600
            if ([RecallMatePortableTestWindows]::CloseOwnedWindows($recallProcess.Id) -eq 0) { throw 'Cannot locate the hidden test window for graceful shutdown.' }
            if (-not $recallProcess.WaitForExit(10000)) { throw 'Graceful shutdown timed out.' }
            $recallExitCode = [RecallMatePortableTestWindows]::ReadExitCode($recallProcessHandle)
            if ($recallExitCode -ne 0) { throw ('Packaged executable exit code: ' + $recallExitCode) }
        } finally {
            $recallProcess.Refresh()
            if (-not $recallProcess.HasExited) { Stop-Process -Id $recallProcess.Id -Force }
        }
        $recallActualHash = (Get-FileHash -LiteralPath (Join-Path $recallFolder ('data\banks\' + $recallBankId + '.json')) -Algorithm SHA256).Hash
        if ($recallActualHash -ne $recallSeedHash) { throw 'Existing bank changed during startup.' }
        if ((Get-FileHash -LiteralPath (Join-Path $recallFolder 'data\app-settings.json') -Algorithm SHA256).Hash -ne $recallSettingsHash) { throw 'Existing font preferences changed during startup or relocation.' }
        if (Test-Path -LiteralPath $env:RECALLMATE_DATA_DIR) { throw 'Packaged app used an external environment data override.' }
        $recallChecks.Add('Real packaged EXE starts and closes with local cache and preserved bank: ' + [System.IO.Path]::GetFileName($recallFolder))
    }
    if (Test-Path -LiteralPath $recallFirst) { throw 'The relocated application recreated its old absolute directory.' }
    $recallChecks.Add('Moved folder uses its new location without recreating the old one')
    $recallChecks.Add('Packaged EXE ignores external data overrides')
    $recallChecks.Add('Font preferences survive startup and folder relocation')
    $recallChecks | ForEach-Object { Write-Output ('PASS ' + $_) }
    @{passed=$true;checks=@($recallChecks);directory=$recallTestRoot} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $recallWorkspace 'artifacts\portable-process-result.json') -Encoding UTF8
} finally {
    foreach ($recallPair in @(@('RECALLMATE_TEST',$recallOriginalTest),@('RECALLMATE_DATA_DIR',$recallOriginalData),@('ELECTRON_RUN_AS_NODE',$recallOriginalNode))) {
        if ($null -eq $recallPair[1]) { Remove-Item -LiteralPath ('Env:' + $recallPair[0]) -ErrorAction SilentlyContinue }
        else { Set-Item -LiteralPath ('Env:' + $recallPair[0]) -Value $recallPair[1] }
    }
}
