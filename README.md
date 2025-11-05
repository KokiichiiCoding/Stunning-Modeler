# 🎨 Stunning Modeler

**Professional 3D Model Generation Framework**

A comprehensive, locally-hosted AI-powered 3D model generation system with a modern web interface. Create production-ready 3D models from text descriptions, convert images to 3D, and apply AI-generated textures to existing models.

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-green)
![PyTorch](https://img.shields.io/badge/PyTorch-2.1-red)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

### 🖋️ **Text-to-3D Generation**
- Transform text descriptions into fully-formed 3D models
- Powered by OpenAI's Shap-E and custom diffusion models
- Adjustable generation parameters (guidance scale, inference steps)
- Real-time 3D preview with interactive viewer

### 🖼️ **Image-to-3D Conversion**
- Convert 2D images into detailed 3D models
- Advanced depth estimation using MiDaS
- Automatic foreground detection and mesh reconstruction
- Drag-and-drop file upload interface

### 🎨 **AI-Powered Texturing**
- Apply AI-generated textures to existing 3D models
- Import models in multiple formats (OBJ, GLB, PLY, STL, FBX)
- Stable Diffusion-powered texture synthesis
- Customizable texture resolution (512px - 4096px)

### 📦 **Professional Features**
- **Multi-format Export**: GLB, OBJ, FBX, PLY, STL
- **Model Optimization**: Automatic mesh cleanup and decimation
- **UV Unwrapping**: Automatic UV coordinate generation
- **Format Conversion**: Convert between 3D file formats
- **Interactive 3D Viewer**: Built with Three.js for real-time preview
- **Production-Ready**: Optimized for game engines and film production

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.8 or higher**
- **8GB RAM minimum** (16GB+ recommended)
- **5GB free disk space** for AI models
- **CUDA-capable GPU** (optional, but recommended for faster generation)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stunning-modeler.git
   cd stunning-modeler
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv

   # On Windows
   venv\Scripts\activate

   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**

   **For CPU-only (basic installation):**
   ```bash
   pip install -r requirements.txt
   ```

   **For GPU support (NVIDIA CUDA):**
   ```bash
   # Install PyTorch with CUDA support first
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

   # Then install other dependencies
   pip install -r requirements.txt
   ```

4. **Install Shap-E (for Text-to-3D)**
   ```bash
   pip install git+https://github.com/openai/shap-e.git
   ```

5. **Run the application**
   ```bash
   python app.py
   ```

6. **Open your browser**
   ```
   http://localhost:5000
   ```

---

## 📖 Usage Guide

### Text-to-3D Generation

1. Navigate to **Text to 3D** page
2. Enter a detailed description of your desired 3D model
   - Example: *"A red sports car with aerodynamic design"*
3. Adjust generation parameters:
   - **Guidance Scale** (7-20 recommended): Controls prompt adherence
   - **Inference Steps** (16-128): More steps = higher quality
4. Select output format (GLB recommended)
5. Click **Generate 3D Model**
6. Preview in the 3D viewer and download

### Image-to-3D Conversion

1. Navigate to **Image to 3D** page
2. Upload an image:
   - Click the upload area or drag & drop
   - Supported formats: PNG, JPG, JPEG, GIF
   - Tips: Use clear images with distinct subjects
3. Adjust foreground ratio (0.7-0.9 recommended)
4. Select output format
5. Click **Generate 3D Model**
6. Download your converted model

### AI Model Texturing

1. Navigate to **Texture Model** page
2. Upload a 3D model file:
   - Supported formats: OBJ, GLB, GLTF, PLY, STL, FBX
3. Describe the desired texture:
   - Example: *"Rusty metal with worn edges, industrial look"*
4. Choose texture resolution (1024x1024 recommended)
5. Click **Apply Texture**
6. Download the textured model

---

## 🎯 Example Prompts

### Text-to-3D Examples

- **Objects**: *"A blue ceramic coffee mug with handle"*
- **Vehicles**: *"A futuristic hovercraft with glowing blue accents"*
- **Furniture**: *"A modern wooden chair with curved backrest"*
- **Characters**: *"A stylized low-poly robot character"*
- **Architecture**: *"A medieval stone tower with battlements"*

### Texture Examples

- **Metal**: *"Polished chrome metal, highly reflective surface"*
- **Wood**: *"Worn wooden planks with visible grain, weathered texture"*
- **Stone**: *"Smooth white marble with grey veins, polished finish"*
- **Fabric**: *"Blue and gold silk fabric, soft cloth texture"*
- **Brick**: *"Red brick wall texture, rough surface with mortar"*

---

## 🏗️ Architecture

### Backend

```
Stunning-Modeler/
├── app.py                      # Flask application & API routes
├── utils/
│   ├── model_generator.py      # Text/Image-to-3D generation
│   ├── model_processor.py      # Mesh processing & optimization
│   └── texture_generator.py    # AI texture generation
├── static/
│   ├── css/                    # Stylesheets
│   ├── js/                     # JavaScript utilities
│   ├── uploads/                # Temporary uploads
│   └── outputs/                # Generated models
└── templates/                  # HTML templates
```

### Technology Stack

- **Backend**: Flask (Python)
- **AI Models**:
  - Shap-E (Text-to-3D)
  - MiDaS (Depth Estimation)
  - Stable Diffusion (Texture Generation)
- **3D Processing**: Trimesh, PyTorch3D
- **Frontend**: Three.js, Vanilla JavaScript
- **UI/UX**: Modern CSS with dark theme

---

## ⚙️ Configuration

### Model Settings

Edit the generation parameters in the web interface or modify defaults in `utils/model_generator.py`:

```python
# Text-to-3D defaults
guidance_scale = 15.0          # 7-20 recommended
num_inference_steps = 64       # 16-128

# Image-to-3D defaults
foreground_ratio = 0.85        # 0.5-1.0

# Texture generation defaults
texture_resolution = 1024      # 512, 1024, 2048, 4096
```

### Performance Optimization

**For faster generation:**
- Use lower inference steps (16-32)
- Reduce texture resolution (512-1024)
- Enable GPU acceleration
- Use GLB format for faster loading

**For higher quality:**
- Increase inference steps (64-128)
- Use 2048x2048 or 4096x4096 textures
- Enable advanced mesh processing
- Export to FBX for professional workflows

---

## 🔧 Troubleshooting

### Common Issues

**Issue**: *Models fail to load in viewer*
- **Solution**: Ensure you're using GLB format, which has the best browser compatibility

**Issue**: *Generation is slow*
- **Solution**: Install CUDA-enabled PyTorch for GPU acceleration
- Alternative: Reduce inference steps and resolution

**Issue**: *Out of memory errors*
- **Solution**: Close other applications, reduce batch size, or use CPU mode

**Issue**: *Shap-E not found*
- **Solution**: Install manually: `pip install git+https://github.com/openai/shap-e.git`

**Issue**: *Texture generation produces solid colors*
- **Solution**: This is the fallback mode. Install Stable Diffusion models for AI textures

### Getting Help

1. Check the [Issues](https://github.com/yourusername/stunning-modeler/issues) page
2. Review the [Documentation](docs/)
3. Submit a detailed bug report with:
   - Python version
   - OS and GPU info
   - Error messages
   - Steps to reproduce

---

## 🎓 Advanced Usage

### API Endpoints

#### Text-to-3D
```bash
curl -X POST http://localhost:5000/api/generate-text-to-3d \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A red sports car",
    "guidance_scale": 15.0,
    "num_inference_steps": 64,
    "output_format": "glb"
  }'
```

#### Image-to-3D
```bash
curl -X POST http://localhost:5000/api/generate-image-to-3d \
  -F "image=@path/to/image.jpg" \
  -F "foreground_ratio=0.85" \
  -F "output_format=glb"
```

#### Apply Texture
```bash
curl -X POST http://localhost:5000/api/texture-model \
  -F "model=@path/to/model.obj" \
  -F "texture_prompt=rusty metal texture" \
  -F "texture_resolution=1024"
```

### Batch Processing

Create a Python script for batch generation:

```python
import requests

prompts = [
    "A red sports car",
    "A blue coffee mug",
    "A wooden chair"
]

for prompt in prompts:
    response = requests.post(
        "http://localhost:5000/api/generate-text-to-3d",
        json={
            "prompt": prompt,
            "guidance_scale": 15.0,
            "num_inference_steps": 64,
            "output_format": "glb"
        }
    )
    print(f"Generated: {response.json()['filename']}")
```

---

## 🛣️ Roadmap

### Planned Features

- [ ] **Multi-view Image-to-3D**: Use multiple images for better reconstruction
- [ ] **NeRF Integration**: Neural Radiance Fields for photorealistic 3D
- [ ] **Animation Support**: Rigging and basic animations
- [ ] **Material Library**: Pre-made PBR materials
- [ ] **Batch Processing UI**: Generate multiple models at once
- [ ] **Cloud Integration**: Optional cloud rendering for heavy workloads
- [ ] **Model Marketplace**: Share and download community models
- [ ] **Advanced Editing**: In-browser mesh editing tools

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Install development dependencies
pip install pytest pytest-flask black flake8

# Run tests
pytest

# Format code
black .

# Lint
flake8 .
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **OpenAI** for Shap-E text-to-3D model
- **Intel ISL** for MiDaS depth estimation
- **Stability AI** for Stable Diffusion
- **Three.js** for 3D visualization
- **Trimesh** for mesh processing

---

## 📧 Contact

- **Project Link**: [https://github.com/yourusername/stunning-modeler](https://github.com/yourusername/stunning-modeler)
- **Issues**: [https://github.com/yourusername/stunning-modeler/issues](https://github.com/yourusername/stunning-modeler/issues)

---

## 🌟 Star History

If you find this project useful, please consider giving it a star! ⭐

---

**Made with ❤️ for the 3D community**

*Stunning Modeler - Making 3D creation accessible to everyone*
