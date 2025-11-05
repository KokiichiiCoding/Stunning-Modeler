#!/bin/bash

# Polii - Setup Script
# This script helps set up the environment for the 3D model generation framework

set -e  # Exit on error

echo "=========================================="
echo "  Polii - Setup Script"
echo "=========================================="
echo ""

# Check Python version
echo "Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Found Python $python_version"

# Check if Python version is 3.8 or higher
required_version="3.8"
if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)"; then
    echo "ERROR: Python 3.8 or higher is required"
    exit 1
fi

# Create virtual environment
echo ""
echo "Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created"
else
    echo "Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Ask about GPU support
echo ""
echo "Do you have an NVIDIA GPU with CUDA support? (y/n)"
read -r gpu_support

if [ "$gpu_support" = "y" ] || [ "$gpu_support" = "Y" ]; then
    echo ""
    echo "Installing PyTorch with CUDA support..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
else
    echo ""
    echo "Installing CPU-only PyTorch..."
fi

# Install main requirements
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

# Install Shap-E
echo ""
echo "Installing Shap-E for Text-to-3D generation..."
pip install git+https://github.com/openai/shap-e.git || {
    echo "WARNING: Shap-E installation failed. Text-to-3D will use fallback mode."
}

# Create necessary directories
echo ""
echo "Creating necessary directories..."
mkdir -p static/uploads
mkdir -p static/outputs
mkdir -p static/models

# Optional advanced features
echo ""
echo "Do you want to install optional advanced features? (y/n)"
echo "  - PyMeshLab (better UV unwrapping)"
echo "  - Open3D (point cloud processing)"
read -r install_optional

if [ "$install_optional" = "y" ] || [ "$install_optional" = "Y" ]; then
    echo ""
    echo "Installing optional dependencies..."
    pip install pymeshlab open3d || {
        echo "WARNING: Some optional dependencies failed to install"
    }
fi

# Test installation
echo ""
echo "Testing installation..."
python3 -c "import flask; import torch; import trimesh; import PIL; print('✓ Core dependencies OK')" || {
    echo "ERROR: Installation test failed"
    exit 1
}

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To start the application:"
echo "  1. Activate the virtual environment:"
echo "     source venv/bin/activate"
echo ""
echo "  2. Run the application:"
echo "     python app.py"
echo ""
echo "  3. Open your browser to:"
echo "     http://localhost:5000"
echo ""
echo "=========================================="
echo ""
