# 🚀 Quick Start Guide

Get up and running with Polii in 5 minutes!

## Installation

### Option 1: Automated Setup (Recommended)

**On macOS/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

**On Windows:**
```bash
setup.bat
```

### Option 2: Manual Setup

1. **Create virtual environment:**
   ```bash
   python -m venv venv

   # Activate it
   source venv/bin/activate  # macOS/Linux
   venv\Scripts\activate     # Windows
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   pip install git+https://github.com/openai/shap-e.git
   ```

## Running the Application

1. **Activate virtual environment** (if not already active):
   ```bash
   source venv/bin/activate  # macOS/Linux
   venv\Scripts\activate     # Windows
   ```

2. **Start the server:**
   ```bash
   python app.py
   ```

3. **Open your browser:**
   ```
   http://localhost:5000
   ```

## First Steps

### Generate Your First 3D Model

1. Click on **"Text to 3D"** in the navigation
2. Enter a prompt: *"A red sports car"*
3. Click **"Generate 3D Model"**
4. Wait 10-30 seconds for generation
5. View your model in the 3D viewer!
6. Click **"Download Model"** to save it

### Convert an Image to 3D

1. Click on **"Image to 3D"**
2. Upload an image (PNG, JPG)
3. Click **"Generate 3D Model"**
4. Download your 3D model

### Apply Textures

1. Click on **"Texture Model"**
2. Upload a 3D model (OBJ, GLB, etc.)
3. Describe the texture you want
4. Click **"Apply Texture"**
5. Download the textured model

## Tips

- **For best results:** Use descriptive prompts with details about shape, color, and style
- **For faster generation:** Reduce inference steps to 32 or 16
- **For high quality:** Increase steps to 128 and use 2048px textures
- **GPU support:** Install CUDA-enabled PyTorch for 10x faster generation

## Troubleshooting

**Issue:** Port 5000 already in use
```bash
# Use a different port
python app.py  # Then edit app.py to change the port
```

**Issue:** Models not loading
- Refresh the page
- Try GLB format (best compatibility)
- Check browser console for errors

**Issue:** Out of memory
- Close other applications
- Reduce inference steps
- Use lower texture resolution

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Explore the example prompts in each tool
- Experiment with different parameters
- Export models to your favorite 3D software (Blender, Unity, Unreal Engine)

## Support

Having issues? Check out:
- [Full Documentation](README.md)
- [GitHub Issues](https://github.com/yourusername/stunning-modeler/issues)

---

**Ready to create amazing 3D models? Let's go! 🎨✨**
