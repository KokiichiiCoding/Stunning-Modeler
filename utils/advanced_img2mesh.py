"""
Advanced Image-to-3D Generation using TripoSR and Hunyuan3D
State-of-the-art models for high-quality 3D reconstruction from single images
"""

import os
import sys
import numpy as np
import torch
import trimesh
from PIL import Image
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class TripoSRGenerator:
    """
    TripoSR Image-to-3D Generator (Stability AI / VAST)
    Fast and high-quality single image to 3D mesh reconstruction
    Paper: https://arxiv.org/abs/2403.02151
    """

    def __init__(self, device=None, model_name='triposr'):
        """
        Initialize TripoSR generator

        Args:
            device: Device to run model on ('cuda' or 'cpu')
            model_name: Model variant to use
        """
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_name = model_name
        self.model = None
        self.model_loaded = False
        logger.info(f"TripoSR Generator initialized on device: {self.device}")

    def load_model(self):
        """Lazy load the TripoSR model"""
        if self.model_loaded:
            return

        try:
            logger.info("Loading TripoSR model for image-to-3D generation...")

            try:
                # Import TripoSR
                from tsr.system import TSR
                from tsr.utils import remove_background, resize_foreground, to_gradio_3d_orientation

                # Load the model
                self.model = TSR.from_pretrained(
                    "stabilityai/TripoSR",
                    config_name="config.yaml",
                    weight_name="model.ckpt",
                )
                self.model.renderer.set_chunk_size(131072)
                self.model.to(self.device)

                # Store utilities
                self.remove_background = remove_background
                self.resize_foreground = resize_foreground
                self.to_gradio_3d_orientation = to_gradio_3d_orientation

                self.model_loaded = True
                logger.info("TripoSR model loaded successfully")

            except ImportError as e:
                logger.warning(f"TripoSR not available: {e}")
                logger.info("Install with: pip install git+https://github.com/VAST-AI-Research/TripoSR.git")
                raise ImportError("TripoSR not installed. Please install it first.")

        except Exception as e:
            logger.error(f"Error loading TripoSR model: {str(e)}")
            raise

    def generate(self, image_path, output_path, remove_bg=True, foreground_ratio=0.85,
                 mc_resolution=256, progress_callback=None):
        """
        Generate a 3D model from an image using TripoSR

        Args:
            image_path: Path to input image or PIL Image object
            output_path: Path to save the generated model
            remove_bg: Whether to remove background automatically
            foreground_ratio: Ratio of foreground in the image (0-1)
            mc_resolution: Marching cubes resolution (higher = more detail, slower)
            progress_callback: Optional callback for progress updates

        Returns:
            (success: bool, message: str)
        """
        try:
            self.load_model()

            if progress_callback:
                progress_callback(0.1, "Loading image...")

            logger.info(f"Generating 3D model from image: {image_path}")

            # Load and preprocess image
            if isinstance(image_path, str):
                image = Image.open(image_path).convert('RGB')
            else:
                image = image_path.convert('RGB')

            if progress_callback:
                progress_callback(0.2, "Preprocessing image...")

            # Remove background if requested
            if remove_bg:
                logger.info("Removing background...")
                try:
                    image = self.remove_background(image, rembg_session=None)
                except Exception as e:
                    logger.warning(f"Background removal failed: {e}, using original image")

            # Resize foreground
            image = self.resize_foreground(image, foreground_ratio)

            # Convert to format expected by TripoSR
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).to(self.device)

            if progress_callback:
                progress_callback(0.3, "Running TripoSR model...")

            # Run TripoSR
            logger.info("Running TripoSR inference...")
            with torch.no_grad():
                scene_codes = self.model([image], self.device)

            if progress_callback:
                progress_callback(0.7, "Extracting mesh...")

            # Extract mesh using marching cubes
            logger.info(f"Extracting mesh with resolution {mc_resolution}...")
            meshes = self.model.extract_mesh(scene_codes, resolution=mc_resolution)
            mesh = meshes[0]

            # Convert to trimesh format
            vertices = mesh.vertices.cpu().numpy()
            faces = mesh.faces.cpu().numpy()

            # Handle vertex colors if available
            vertex_colors = None
            if hasattr(mesh, 'vertex_colors') and mesh.vertex_colors is not None:
                vertex_colors = (mesh.vertex_colors.cpu().numpy() * 255).astype(np.uint8)

            if progress_callback:
                progress_callback(0.9, "Saving mesh...")

            # Create trimesh object
            trimesh_mesh = trimesh.Trimesh(
                vertices=vertices,
                faces=faces,
                vertex_colors=vertex_colors,
                process=False
            )

            # Apply orientation fix for proper viewing
            # TripoSR outputs in a specific coordinate system
            trimesh_mesh.apply_transform(trimesh.transformations.rotation_matrix(
                np.pi, [1, 0, 0]
            ))

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                trimesh_mesh.export(output_path, file_type='glb')
            else:
                trimesh_mesh.export(output_path)

            if progress_callback:
                progress_callback(1.0, "Complete!")

            logger.info(f"TripoSR model generated successfully: {output_path}")
            return True, "Model generated successfully with TripoSR"

        except Exception as e:
            logger.error(f"TripoSR generation failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False, f"TripoSR generation failed: {str(e)}"


class Hunyuan3DGenerator:
    """
    Hunyuan3D Image-to-3D Generator (Tencent)
    High-quality 3D mesh generation with texture from single images
    GitHub: https://github.com/Tencent/Hunyuan3D-1
    """

    def __init__(self, device=None, model_path=None):
        """
        Initialize Hunyuan3D generator

        Args:
            device: Device to run model on ('cuda' or 'cpu')
            model_path: Optional path to model weights
        """
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_path = model_path
        self.model = None
        self.model_loaded = False
        logger.info(f"Hunyuan3D Generator initialized on device: {self.device}")

    def load_model(self):
        """Lazy load the Hunyuan3D model"""
        if self.model_loaded:
            return

        try:
            logger.info("Loading Hunyuan3D model for image-to-3D generation...")

            try:
                # Import Hunyuan3D modules
                # Note: The actual import paths may vary based on the Hunyuan3D implementation
                from hunyuan3d.inference import infer
                from hunyuan3d.utils import load_config, setup_pipeline

                # Load configuration
                if self.model_path:
                    config_path = os.path.join(self.model_path, "config.yaml")
                else:
                    # Use default pretrained path
                    config_path = "tencent/Hunyuan3D-1"

                self.config = load_config(config_path)
                self.pipeline = setup_pipeline(self.config, device=self.device)
                self.infer = infer

                self.model_loaded = True
                logger.info("Hunyuan3D model loaded successfully")

            except ImportError as e:
                logger.warning(f"Hunyuan3D not available: {e}")
                logger.info("Install with: pip install git+https://github.com/Tencent/Hunyuan3D-1.git")
                raise ImportError("Hunyuan3D not installed. Please install it first.")

        except Exception as e:
            logger.error(f"Error loading Hunyuan3D model: {str(e)}")
            raise

    def generate(self, image_path, output_path, num_inference_steps=50,
                 guidance_scale=7.5, seed=None, progress_callback=None):
        """
        Generate a 3D model from an image using Hunyuan3D

        Args:
            image_path: Path to input image or PIL Image object
            output_path: Path to save the generated model
            num_inference_steps: Number of diffusion steps
            guidance_scale: Classifier-free guidance scale
            seed: Random seed for reproducibility
            progress_callback: Optional callback for progress updates

        Returns:
            (success: bool, message: str)
        """
        try:
            self.load_model()

            if progress_callback:
                progress_callback(0.1, "Loading image...")

            logger.info(f"Generating 3D model from image with Hunyuan3D: {image_path}")

            # Load image
            if isinstance(image_path, str):
                image = Image.open(image_path).convert('RGB')
            else:
                image = image_path.convert('RGB')

            if progress_callback:
                progress_callback(0.2, "Running Hunyuan3D model...")

            # Set random seed if provided
            if seed is not None:
                torch.manual_seed(seed)
                np.random.seed(seed)

            # Run Hunyuan3D inference
            logger.info("Running Hunyuan3D inference...")
            result = self.infer(
                pipeline=self.pipeline,
                image=image,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                device=self.device,
                progress_callback=lambda p: progress_callback(0.2 + p * 0.6, "Generating...") if progress_callback else None
            )

            if progress_callback:
                progress_callback(0.8, "Processing mesh...")

            # Extract mesh and texture
            mesh = result['mesh']

            # Convert to trimesh if needed
            if not isinstance(mesh, trimesh.Trimesh):
                vertices = np.array(mesh['vertices'])
                faces = np.array(mesh['faces'])

                # Handle texture/colors
                vertex_colors = None
                if 'vertex_colors' in mesh:
                    vertex_colors = np.array(mesh['vertex_colors'])

                mesh = trimesh.Trimesh(
                    vertices=vertices,
                    faces=faces,
                    vertex_colors=vertex_colors,
                    process=False
                )

            if progress_callback:
                progress_callback(0.9, "Saving mesh...")

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            if progress_callback:
                progress_callback(1.0, "Complete!")

            logger.info(f"Hunyuan3D model generated successfully: {output_path}")
            return True, "Model generated successfully with Hunyuan3D"

        except Exception as e:
            logger.error(f"Hunyuan3D generation failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False, f"Hunyuan3D generation failed: {str(e)}"


class MultiModelImageTo3D:
    """
    Unified interface for multiple Image-to-3D models
    Automatically selects the best available model or allows manual selection
    """

    def __init__(self, device=None, preferred_model='triposr'):
        """
        Initialize multi-model generator

        Args:
            device: Device to run models on
            preferred_model: 'triposr', 'hunyuan3d', or 'midas' (fallback)
        """
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.preferred_model = preferred_model.lower()
        self.generators = {}
        logger.info(f"Multi-Model Image-to-3D initialized, preferred: {preferred_model}")

    def get_generator(self, model_name=None):
        """Get or create a generator for the specified model"""
        model_name = model_name or self.preferred_model

        if model_name not in self.generators:
            if model_name == 'triposr':
                self.generators[model_name] = TripoSRGenerator(device=self.device)
            elif model_name == 'hunyuan3d':
                self.generators[model_name] = Hunyuan3DGenerator(device=self.device)
            else:
                # Import the MiDaS-based fallback
                from .model_generator import ImageTo3DGenerator
                self.generators[model_name] = ImageTo3DGenerator(device=self.device)

        return self.generators[model_name]

    def generate(self, image_path, output_path, model=None, **kwargs):
        """
        Generate 3D model using the specified or preferred model

        Args:
            image_path: Input image path
            output_path: Output model path
            model: Model to use ('triposr', 'hunyuan3d', 'midas')
            **kwargs: Additional arguments passed to the generator
        """
        model_name = model or self.preferred_model

        try:
            generator = self.get_generator(model_name)
            return generator.generate(image_path, output_path, **kwargs)
        except Exception as e:
            logger.error(f"Failed to generate with {model_name}: {e}")

            # Try fallback to MiDaS if preferred model fails
            if model_name != 'midas':
                logger.info("Falling back to MiDaS-based generation...")
                try:
                    generator = self.get_generator('midas')
                    return generator.generate(image_path, output_path, **kwargs)
                except Exception as fallback_e:
                    logger.error(f"Fallback generation also failed: {fallback_e}")
                    return False, f"All generation methods failed: {str(e)}"

            return False, f"Generation failed: {str(e)}"
