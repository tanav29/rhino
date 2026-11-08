# Dot-source from $PROFILE, after configuring your prompt. Requires PSReadLine.
if (-not $global:__RhinoOriginalPrompt) {
    Import-Module PSReadLine -ErrorAction SilentlyContinue
    if (-not (Test-Path Function:\PSConsoleHostReadLine)) { return }
    $global:__RhinoOriginalPrompt = $function:prompt
    $global:__RhinoOriginalReadLine = $function:PSConsoleHostReadLine
    $global:__RhinoRunning = $false
    function global:PSConsoleHostReadLine {
        $line = & $global:__RhinoOriginalReadLine
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            [Console]::Write("$([char]27)]133;C$([char]7)")
            $global:__RhinoRunning = $true
        }
        return $line
    }
    function global:prompt {
        $succeeded = $?
        $code = if ($succeeded) { 0 } elseif ($global:LASTEXITCODE) { $global:LASTEXITCODE } else { 1 }
        $esc = [char]27
        $bell = [char]7
        if ($global:__RhinoRunning) {
            [Console]::Write("$esc]133;D;$code$bell")
            $global:__RhinoRunning = $false
        }
        if ((Get-Location).Provider.Name -eq 'FileSystem') {
            $uri = ([Uri]::new((Get-Location).ProviderPath + [IO.Path]::DirectorySeparatorChar)).AbsoluteUri
            [Console]::Write("$esc]7;$uri$bell")
        }
        return "$esc]133;A$bell$(& $global:__RhinoOriginalPrompt)$esc]133;B$bell"
    }
}
