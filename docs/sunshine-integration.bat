@echo off
setlocal

:: Check if the correct number of arguments are provided
if "%~3"=="" (
    echo Usage: %0 [width] [height] [fps]
    exit /b 1
)

:: Assign arguments to variables
set WIDTH=%1
set HEIGHT=%2
set FPS=%3

:: Run the commands with the provided arguments
start "" /w "%~dp0PRPlanIT.com-VirtualDisplayDrv_Wiz.exe" Reso_Adds %WIDTH% %HEIGHT% %FPS% && start "" /w "%~dp0PRPlanIT.com-VirtualDisplayDrv_Wiz.exe" Driv_Relo

:: Optionally pipe the output to a log file (if needed)
PRPlanIT.com-VirtualDisplayDrv_Wiz.exe Reso_Adds %WIDTH% %HEIGHT% %FPS% > output.log 2>&1