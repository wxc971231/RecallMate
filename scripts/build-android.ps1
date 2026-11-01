param([switch]$DebugBuild, [string]$Proxy = $env:RECALLMATE_BUILD_PROXY, [switch]$SkipWeb)
$ErrorActionPreference = 'Stop'
$recallRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
Set-Location -LiteralPath $recallRoot
foreach ($recallName in @('JAVA_HOME','ANDROID_HOME')) {
    if (-not [Environment]::GetEnvironmentVariable($recallName,'Process')) {
        $recallValue = [Environment]::GetEnvironmentVariable($recallName,'User')
        if (-not $recallValue) { $recallValue = [Environment]::GetEnvironmentVariable($recallName,'Machine') }
        if ($recallValue) { [Environment]::SetEnvironmentVariable($recallName,$recallValue,'Process') }
    }
}
$env:Path = [Environment]::ExpandEnvironmentVariables([Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')) + ';' + $env:Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js was not found in PATH.' }
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) { throw 'Set JAVA_HOME to an installed JDK 21.' }
$recallJavaVersion = & (Join-Path $env:JAVA_HOME 'bin\java.exe') --version
if ($LASTEXITCODE -ne 0 -or ($recallJavaVersion -join ' ') -notmatch '\b21\.') { throw 'This Android project requires JDK 21.' }
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'))) { throw 'Set ANDROID_HOME and install Android SDK Platform 36.' }
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = Join-Path $recallRoot '.cache\gradle' }
[System.IO.File]::WriteAllText((Join-Path $recallRoot 'android\local.properties'),('sdk.dir=' + $env:ANDROID_HOME.Replace('\','/') + [Environment]::NewLine),[System.Text.UTF8Encoding]::new($false))
$recallGradleLocal = Join-Path $recallRoot 'android\.gradle'
[System.IO.Directory]::CreateDirectory($recallGradleLocal) | Out-Null
[System.IO.File]::WriteAllText((Join-Path $recallGradleLocal 'config.properties'),('java.home=' + $env:JAVA_HOME.Replace('\','/') + [Environment]::NewLine),[System.Text.UTF8Encoding]::new($false))
$recallOriginalJavaOptions = $env:JAVA_TOOL_OPTIONS
try {
    if ($Proxy) {
        $recallProxy = [Uri]$Proxy
        if ($recallProxy.Scheme -notin @('http','https') -or -not $recallProxy.Host -or $recallProxy.UserInfo) { throw 'Use an HTTP proxy URL without embedded credentials.' }
        $recallProxyHost = $recallProxy.Host
        if ($recallProxyHost -eq 'localhost') { $recallProxyHost = '127.0.0.1' }
        $env:JAVA_TOOL_OPTIONS = ($recallOriginalJavaOptions + ' -Dhttp.proxyHost=' + $recallProxyHost + ' -Dhttp.proxyPort=' + $recallProxy.Port + ' -Dhttps.proxyHost=' + $recallProxyHost + ' -Dhttps.proxyPort=' + $recallProxy.Port).Trim()
    }
    if (-not $SkipWeb) {
        & npm.cmd run android:sync
        if ($LASTEXITCODE) { throw 'Android web build/sync failed.' }
    }
    if (-not $DebugBuild) {
        $recallSigningDir = Join-Path $recallRoot '.local\android-signing'
        [System.IO.Directory]::CreateDirectory($recallSigningDir) | Out-Null
        $recallSigningConfig = Join-Path $recallSigningDir 'signing.json'
        $recallKeystore = Join-Path $recallSigningDir 'recallmate-release.jks'
        $recallNewSigning = $false
        if (-not (Test-Path -LiteralPath $recallSigningConfig)) {
            if (Test-Path -LiteralPath $recallKeystore) { throw 'Existing signing key found without its configuration. Restore signing.json; do not replace the key.' }
            $recallRandom = [byte[]]::new(32)
            $recallRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            try { $recallRng.GetBytes($recallRandom) } finally { $recallRng.Dispose() }
            $recallPassword = [Convert]::ToBase64String($recallRandom)
            [System.IO.File]::WriteAllText($recallSigningConfig,(@{password=$recallPassword} | ConvertTo-Json),[System.Text.UTF8Encoding]::new($false))
            $recallNewSigning = $true
        }
        $env:RECALLMATE_STORE_PASSWORD = (Get-Content -LiteralPath $recallSigningConfig -Raw | ConvertFrom-Json).password
        $env:RECALLMATE_KEYSTORE = $recallKeystore
        if (-not (Test-Path -LiteralPath $recallKeystore)) {
            if (-not $recallNewSigning) { throw 'Signing key is missing. Restore the existing key; do not generate a replacement for an already published app.' }
            & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $recallKeystore -storepass:env RECALLMATE_STORE_PASSWORD -keypass:env RECALLMATE_STORE_PASSWORD -alias recallmate -dname 'CN=RecallMate, OU=Mobile, O=RecallMate' -keyalg RSA -keysize 3072 -validity 10000 -storetype JKS
            if ($LASTEXITCODE) { throw 'Signing key generation failed.' }
        }
    }
    $recallTask = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
    & (Join-Path $recallRoot 'android\gradlew.bat') -p android --no-daemon $recallTask
    if ($LASTEXITCODE) { throw 'Gradle build failed.' }
    if (-not $DebugBuild) { & node scripts/package-android.cjs; if ($LASTEXITCODE) { throw 'Android packaging failed.' } }
} finally {
    $env:JAVA_TOOL_OPTIONS = $recallOriginalJavaOptions
    Remove-Item Env:RECALLMATE_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:RECALLMATE_KEYSTORE -ErrorAction SilentlyContinue
}
