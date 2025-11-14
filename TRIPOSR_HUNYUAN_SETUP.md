# TripoSR & Hunyuan3D Integration Guide

This guide explains how to use the newly integrated **TripoSR** and **Hunyuan3D** models for high-quality image-to-3D generation.

## Overview

The system now supports three different image-to-3D generation methods:

1. **TripoSR** (Stability AI) - Fast, high-quality single image to 3D mesh reconstruction
2. **Hunyuan3D** (Tencent) - Advanced 3D mesh generation with texture from single images
3. **MiDaS** (Intel) - Fallback depth-based 2.5D generation

## Installation

### Step 1: Install Base Dependencies

```bash
pip install -r requirements.txt
```

### Step 2: Install TripoSR (Recommended)

```bash
pip install git+https://github.com/VAST-AI-Research/TripoSR.git
```

### Step 3: Install Hunyuan3D (Optional)

```bash
pip install git+https://github.com/Tencent/Hunyuan3D-1.git
```

### Step 4: Install CUDA-enabled PyTorch (For GPU Acceleration)

```bash
# For CUDA 11.8
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# For CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

## Usage

### API Endpoint

The `/api/generate-image-to-3d` endpoint now supports model selection:

#### Basic Request (TripoSR - Default)

```bash
curl -X POST http://localhost:5000/api/generate-image-to-3d \
  -F "image=@/path/to/image.png" \
  -F "model=triposr"
```

#### With Hunyuan3D

```bash
curl -X POST http://localhost:5000/api/generate-image-to-3d \
  -F "image=@/path/to/image.png" \
  -F "model=hunyuan3d" \
  -F "num_inference_steps=50" \
  -F "guidance_scale=7.5"
```

#### Fallback to MiDaS

```bash
curl -X POST http://localhost:5000/api/generate-image-to-3d \
  -F "image=@/path/to/image.png" \
  -F "model=midas"
```

### Parameters

#### Common Parameters

- `image` (required): Input image file (PNG, JPG, JPEG, GIF)
- `model` (optional): Model to use - `'triposr'`, `'hunyuan3d'`, or `'midas'` (default: `'triposr'`)
- `output_format` (optional): Output format - `'glb'` or `'obj'` (default: `'glb'`)

#### TripoSR Specific Parameters

- `remove_bg` (optional): Automatically remove background - `true` or `false` (default: `true`)
- `foreground_ratio` (optional): Ratio of foreground in image - `0.0` to `1.0` (default: `0.85`)
- `mc_resolution` (optional): Marching cubes resolution - higher = more detail but slower (default: `256`)

#### Hunyuan3D Specific Parameters

- `num_inference_steps` (optional): Number of diffusion steps (default: `50`)
- `guidance_scale` (optional): Classifier-free guidance scale (default: `7.5`)

#### MiDaS Specific Parameters

- `foreground_ratio` (optional): Ratio for foreground detection - `0.0` to `1.0` (default: `0.85`)

### Response Format

The API returns immediately with a job ID for progress tracking via WebSocket:

```json
{
  "success": true,
  "message": "Generation started with triposr",
  "job_id": "img2mesh_abc123...",
  "status": "processing",
  "model_type": "triposr"
}
```

### Progress Tracking

Connect to the WebSocket endpoint to receive real-time progress updates:

```javascript
const socket = io('http://localhost:5000');

socket.emit('join', { job_id: 'img2mesh_abc123...' });

socket.on('progress', (data) => {
  console.log(`Progress: ${data.progress * 100}%`);
  console.log(`Status: ${data.status}`);
});

socket.on('complete', (data) => {
  console.log('Generation complete!');
  console.log('Model URL:', data.result.model_url);
  console.log('Filename:', data.result.filename);
});

socket.on('error', (data) => {
  console.error('Generation failed:', data.message);
});
```

## Python Usage Example

```python
from utils.advanced_img2mesh import TripoSRGenerator, Hunyuan3DGenerator, MultiModelImageTo3D

# Option 1: Use a specific model directly
generator = TripoSRGenerator()
success, message = generator.generate(
    image_path="input.png",
    output_path="output.glb",
    remove_bg=True,
    foreground_ratio=0.85,
    mc_resolution=256
)

# Option 2: Use the multi-model interface with automatic fallback
multi_generator = MultiModelImageTo3D(preferred_model='triposr')
success, message = multi_generator.generate(
    image_path="input.png",
    output_path="output.glb",
    model='triposr'  # or 'hunyuan3d' or 'midas'
)
```

## Model Comparison

| Feature | TripoSR | Hunyuan3D | MiDaS |
|---------|---------|-----------|-------|
| **Speed** | Fast (~10s) | Slower (~30-60s) | Very Fast (~5s) |
| **Quality** | High | Very High | Medium (2.5D) |
| **Texture** | Good | Excellent | Good |
| **Geometry** | Accurate | Very Accurate | Approximate |
| **GPU Required** | Recommended | Required | Optional |
| **Background Removal** | Automatic | Manual | Manual |
| **Best For** | Quick high-quality meshes | Final production assets | Quick previews |

## Tips for Best Results

### Input Image Guidelines

1. **Clear subject**: Ensure the main object is clearly visible
2. **Good lighting**: Avoid harsh shadows or overexposure
3. **Plain background**: For best results, use images with simple backgrounds
4. **Resolution**: Higher resolution images (1024x1024+) work better
5. **Single object**: Works best with a single, well-defined object

### TripoSR Tips

- Set `remove_bg=true` for automatic background removal
- Increase `mc_resolution` to 512 for higher quality (but slower)
- Use `foreground_ratio=0.9` for objects that fill the frame

### Hunyuan3D Tips

- Increase `num_inference_steps` to 100 for better quality
- Adjust `guidance_scale` between 5.0-10.0 for different results
- Lower guidance_scale = more creative, higher = more faithful to input

### Performance Optimization

- Use a CUDA-enabled GPU for 10-20x faster generation
- Reduce `mc_resolution` to 128 for faster TripoSR generation
- Use MiDaS for quick previews before running expensive models

## Troubleshooting

### TripoSR Installation Issues

If you get import errors:

```bash
pip install torchmcubes einops
pip install git+https://github.com/VAST-AI-Research/TripoSR.git
```

### Hunyuan3D Installation Issues

If you get import errors:

```bash
pip install omegaconf
pip install git+https://github.com/Tencent/Hunyuan3D-1.git
```

### CUDA/GPU Issues

If you get CUDA errors, ensure:

1. You have an NVIDIA GPU with CUDA support
2. CUDA toolkit is installed (11.8 or 12.1)
3. PyTorch is installed with CUDA support:

```bash
python -c "import torch; print(torch.cuda.is_available())"
```

If it returns `False`, reinstall PyTorch with CUDA:

```bash
pip uninstall torch torchvision
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### Memory Issues

If you run out of GPU memory:

- Reduce `mc_resolution` for TripoSR (try 128 or 192)
- Reduce `num_inference_steps` for Hunyuan3D
- Use MiDaS as a fallback (runs on CPU)
- Close other GPU-intensive applications

## Architecture

The integration uses a modular architecture:

```
utils/advanced_img2mesh.py
├── TripoSRGenerator          # TripoSR implementation
├── Hunyuan3DGenerator         # Hunyuan3D implementation
└── MultiModelImageTo3D        # Unified interface with fallback

app.py
└── /api/generate-image-to-3d  # API endpoint with model selection
```

## Future Enhancements

Planned features:

- [ ] Multi-view image-to-3D support
- [ ] Automatic model selection based on image characteristics
- [ ] Batch processing for multiple images
- [ ] Fine-tuned models for specific object categories
- [ ] Integration with texture upscaling pipeline

## References

- **TripoSR**: https://github.com/VAST-AI-Research/TripoSR
- **TripoSR Paper**: https://arxiv.org/abs/2403.02151
- **Hunyuan3D**: https://github.com/Tencent/Hunyuan3D-1
- **MiDaS**: https://github.com/isl-org/MiDaS

## License

Please refer to the individual model licenses:

- TripoSR: MIT License
- Hunyuan3D: Check repository for license
- MiDaS: MIT License

---

**Note**: This integration is part of the Polii 3D Model Generation Studio. For general usage and other features, see the main README.md.
