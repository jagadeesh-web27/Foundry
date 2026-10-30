# ADB device check and app diagnostics
$env:ADB_DEVICE = "192.168.5.178:5555"

# Ensure connection
adb connect $env:ADB_DEVICE 2>&1
Start-Sleep -Seconds 2

# Check device
Write-Host "=== DEVICES ==="
adb devices 2>&1

# Check app
Write-Host "`n=== APP PACKAGE ==="
adb shell "pm list packages | grep foundry" 2>&1

# Launch app
Write-Host "`n=== LAUNCHING APP ==="
adb shell "am start -n com.foundry.app.debug/com.foundry.app.MainActivity" 2>&1
Start-Sleep -Seconds 3

# Get PID
Write-Host "`n=== APP PID ==="
$pid = adb shell "pidof com.foundry.app.debug" 2>&1
Write-Host "PID: $pid"

# Check model files
Write-Host "`n=== MODEL FILES ==="
adb shell "ls -la /data/data/com.foundry.app.debug/files/foundry-models/ 2>/dev/null || echo NO_MODEL_DIR" 2>&1
adb shell "ls -la /sdcard/foundry-model.* 2>/dev/null" 2>&1

# Check test data
Write-Host "`n=== TEST DATA ==="
adb shell "ls -la /sdcard/FoundryTestData/ 2>/dev/null || echo NO_TEST_DATA" 2>&1

# Get recent Foundry logs
Write-Host "`n=== RECENT FOUNDRY LOGS ==="
adb logcat -d -t 50 2>&1 | Select-String -Pattern "FoundryA" 2>&1
