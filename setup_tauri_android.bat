@echo off
setlocal

REM Set JAVA_HOME to our copied JDK
set JAVA_HOME=C:\jdk11
set PATH=%JAVA_HOME%\bin;%PATH%

REM Add Android platform-tools to PATH
set ANDROID_PLATFORM_TOOLS=C:\Users\jagadeesh\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools
set PATH=%ANDROID_PLATFORM_TOOLS%;%PATH%

REM Uncomment and set if we find Android Studio SDK later
REM set ANDROID_HOME=C:\path\to\android\sdk
REM set PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%

echo JAVA_HOME=%JAVA_HOME%
echo PATH=%PATH%
echo.
echo Testing Java:
%JAVA_HOME%\bin\java.exe -version
echo.
echo Testing ADB:
%ANDROID_PLATFORM_TOOLS%\adb.exe version
echo.
echo Running Tauri Android Init:
npx tauri android init
endlocal
