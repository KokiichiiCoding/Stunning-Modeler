@echo off
REM Polii - Run Script (Windows)
REM This script runs the application with automatic CUDA toolkit setup

echo ==========================================
echo   POLII - 3D Model Generation Studio
echo ==========================================
echo.

REM Check if venv exists
if not exist "venv" (
    echo ERROR: Virtual environment not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat
echo.

REM ==========================================
REM CUDA TOOLKIT DETECTION AND SETUP
REM ==========================================

echo Checking CUDA availability...
echo.

REM Check if nvidia-smi is available
where nvidia-smi >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] NVIDIA GPU detected
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
    echo.

    REM Check CUDA version
    nvidia-smi | findstr "CUDA Version" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] CUDA driver detected
        for /f "tokens=*" %%a in ('nvidia-smi ^| findstr "CUDA Version"') do echo %%a
        echo.
    ) else (
        echo [!] CUDA driver not found in nvidia-smi output
    )

    REM Check if PyTorch can see CUDA
    echo Checking PyTorch CUDA support...
    python -c "import torch; print('[✓] PyTorch version:', torch.__version__); cuda_available = torch.cuda.is_available(); print('[✓] CUDA available:', cuda_available); print('[✓] CUDA devices:', torch.cuda.device_count() if cuda_available else 0); print('[✓] Current device:', torch.cuda.get_device_name(0) if cuda_available else 'CPU only')" 2>nul

    if errorlevel 1 (
        echo [!] WARNING: PyTorch CUDA check failed
        echo [!] You may need to reinstall PyTorch with CUDA support
        echo.
        echo To reinstall PyTorch with CUDA 11.8:
        echo   pip uninstall torch torchvision -y
        echo   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
        echo.
        echo To reinstall PyTorch with CUDA 12.1:
        echo   pip uninstall torch torchvision -y
        echo   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
        echo.
        set /p reinstall_cuda="Would you like to reinstall PyTorch with CUDA 11.8 now? (y/n): "
        if /i "!reinstall_cuda!"=="y" (
            echo.
            echo Reinstalling PyTorch with CUDA 11.8...
            pip uninstall torch torchvision -y
            pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
            echo.
            echo PyTorch reinstalled. Testing CUDA...
            python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
            echo.
        )
    )

    REM Set CUDA optimization flags
    echo [✓] Setting CUDA environment variables...
    set CUDA_VISIBLE_DEVICES=0
    set PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
    set TORCH_CUDA_ARCH_LIST=6.0;6.1;7.0;7.5;8.0;8.6;8.9;9.0
    echo.

) else (
    echo [!] No NVIDIA GPU detected
    echo [!] Running in CPU-only mode (slower performance)
    echo.
    echo If you have an NVIDIA GPU:
    echo   1. Install the latest NVIDIA drivers from nvidia.com/drivers
    echo   2. Install CUDA Toolkit from developer.nvidia.com/cuda-downloads
    echo   3. Restart your computer
    echo   4. Run this script again
    echo.

    REM Check if user wants to continue in CPU mode
    set /p continue_cpu="Continue in CPU-only mode? (y/n): "
    if /i not "!continue_cpu!"=="y" (
        echo Exiting...
        pause
        exit /b 0
    )
    echo.
)

REM ==========================================
REM MEMORY OPTIMIZATION
REM ==========================================

echo Configuring memory settings...
set PYTORCH_ENABLE_MPS_FALLBACK=1
set OMP_NUM_THREADS=4
set MKL_NUM_THREADS=4
echo [✓] Memory optimization enabled
echo.

REM ==========================================
REM DEPENDENCY CHECK
REM ==========================================

echo Checking dependencies...
python -c "import flask, torch, trimesh, PIL, numpy; print('[✓] Core dependencies OK')" 2>nul
if errorlevel 1 (
    echo [!] WARNING: Some dependencies are missing
    echo [!] Run setup.bat to install dependencies
    echo.
    set /p install_now="Install dependencies now? (y/n): "
    if /i "!install_now!"=="y" (
        pip install -r requirements.txt
        echo.
    ) else (
        pause
        exit /b 1
    )
)
echo.

REM ==========================================
REM CREATE REQUIRED DIRECTORIES
REM ==========================================

echo Creating required directories...
if not exist "static\uploads" mkdir static\uploads
if not exist "static\outputs" mkdir static\outputs
if not exist "static\models" mkdir static\models
if not exist "static\materials" mkdir static\materials
if not exist "static\projects" mkdir static\projects
if not exist "static\styles" mkdir static\styles
echo [✓] Directories created
echo.

REM ==========================================
REM START APPLICATION
REM ==========================================

echo ==========================================
echo   Starting Polii Server...
echo ==========================================
echo.
echo   Server will start at: http://localhost:5000
echo   Press Ctrl+C to stop the server
echo.
echo ==========================================
echo.

REM Run the application
python app.py

REM If app exits, pause to show errors
if errorlevel 1 (
    echo.
    echo [!] ERROR: Application exited with error code %errorlevel%
    echo.
)

pause
