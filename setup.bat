@echo off
REM Stunning Modeler - Setup Script (Windows)
REM This script helps set up the environment for the 3D model generation framework

echo ==========================================
echo   Stunning Modeler - Setup Script
echo ==========================================
echo.

REM Check Python version
echo Checking Python version...
python --version
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from python.org
    pause
    exit /b 1
)
echo.

REM Create virtual environment
echo Creating virtual environment...
if not exist "venv" (
    python -m venv venv
    echo Virtual environment created
) else (
    echo Virtual environment already exists
)
echo.

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip
echo.

REM Ask about GPU support
set /p gpu_support="Do you have an NVIDIA GPU with CUDA support? (y/n): "
echo.

if /i "%gpu_support%"=="y" (
    echo Installing PyTorch with CUDA support...
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
) else (
    echo Installing CPU-only PyTorch...
)
echo.

REM Install main requirements
echo Installing dependencies...
pip install -r requirements.txt
echo.

REM Install Shap-E
echo Installing Shap-E for Text-to-3D generation...
pip install git+https://github.com/openai/shap-e.git
if errorlevel 1 (
    echo WARNING: Shap-E installation failed. Text-to-3D will use fallback mode.
)
echo.

REM Create necessary directories
echo Creating necessary directories...
if not exist "static\uploads" mkdir static\uploads
if not exist "static\outputs" mkdir static\outputs
if not exist "static\models" mkdir static\models
echo.

REM Optional advanced features
set /p install_optional="Do you want to install optional advanced features? (y/n): "
echo   - PyMeshLab (better UV unwrapping)
echo   - Open3D (point cloud processing)
echo.

if /i "%install_optional%"=="y" (
    echo Installing optional dependencies...
    pip install pymeshlab open3d
    if errorlevel 1 (
        echo WARNING: Some optional dependencies failed to install
    )
)
echo.

REM Test installation
echo Testing installation...
python -c "import flask; import torch; import trimesh; import PIL; print('✓ Core dependencies OK')"
if errorlevel 1 (
    echo ERROR: Installation test failed
    pause
    exit /b 1
)
echo.

echo ==========================================
echo   Setup Complete!
echo ==========================================
echo.
echo To start the application:
echo   1. Activate the virtual environment:
echo      venv\Scripts\activate.bat
echo.
echo   2. Run the application:
echo      python app.py
echo.
echo   3. Open your browser to:
echo      http://localhost:5000
echo.
echo ==========================================
echo.
pause
