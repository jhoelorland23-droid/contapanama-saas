@echo off
"C:\Program Files\nodejs\node.exe" --version > "%~dp0check_output.txt" 2>&1
"C:\Program Files\nodejs\npm.cmd" --version >> "%~dp0check_output.txt" 2>&1
"C:\Program Files\Docker\Docker\resources\bin\docker.exe" version >> "%~dp0check_output.txt" 2>&1
echo DONE >> "%~dp0check_output.txt"
