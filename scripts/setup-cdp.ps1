# Set up CDP connection to Foundry app
adb connect 192.168.5.178:5555
Start-Sleep -Seconds 2

# Get PID
$rawPid = adb shell "pidof com.foundry.app.debug"
$pidStr = $rawPid.Trim()
Write-Host "App PID: $pidStr"

# Try common webview socket names
$socketNames = @(
    "webview_devtools_remote_$pidStr",
    "chrome_devtools_remote",
    "webview_devtools_remote"
)

foreach ($socket in $socketNames) {
    Write-Host "Trying socket: $socket"
    $result = adb forward tcp:9225 "localabstract:$socket" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS: Forwarded to $socket"
        break
    }
    Write-Host "Failed: $result"
}

# Verify connection
Start-Sleep -Seconds 1
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:9225/json" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "CDP Available! Pages:"
    Write-Host $response.Content
} catch {
    Write-Host "CDP not available: $($_.Exception.Message)"
}
