@echo off
echo Starting NeuAI Backend...

:: Check for virtual environment in parent folder (standard workspace setup)
if exist "..\.venv\Scripts\python.exe" (
    echo Virtual environment detected in parent folder. Using virtualenv...
    ..\.venv\Scripts\python.exe -m pip install -r requirements.txt
    ..\.venv\Scripts\python.exe app.py
    goto end
)

:: Check for virtual environment in current folder
if exist ".venv\Scripts\python.exe" (
    echo Virtual environment detected in current folder. Using virtualenv...
    .venv\Scripts\python.exe -m pip install -r requirements.txt
    .venv\Scripts\python.exe app.py
    goto end
)

:: Fallback to system Python
echo No virtual environment found. Using system python...
pip install -r requirements.txt
python app.py

:end
pause
