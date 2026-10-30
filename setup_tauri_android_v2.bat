@echo off
setlocal

REM Set JAVA_HOME to our copied JDK
set JAVA_HOME=C:\jdk11
set PATH=%JAVA_HOME%\bin;%PATH%

REM Set Android SDK location - using where we have platform-tools
REM The full SDK should have platforms, build-tools, etc. directories
set ANDROID_HOME=C:\Users\jagadeesh\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe
set PATH=%ANDROID_HOME%\platform-tools;%PATH%

echo JAVA_HOME=%JAVA_HOME%
echo ANDROID_HOME=%ANDROID_HOME%
echo PATH=%PATH%
echo.
echo Testing Java:
%JAVA_HOME%\bin\java.exe -version
echo.
echo Testing ADB:
%ANDROID_HOME%\platform-tools\adb.exe version
echo.
echo Running Tauri Android Init:
npx tauri android init
endlocal
