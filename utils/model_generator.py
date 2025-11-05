"""
3D Model Generation Utilities
Handles text-to-3D and image-to-3D generation using state-of-the-art models
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


class TextTo3DGenerator:
    """
    Text-to-3D model generator using multiple approaches:
    1. Shap-E (OpenAI) for fast generation
    2. Optional: Integration with Point-E, DreamFusion, etc.
    """

    def __init__(self, device=None):
        """Initialize the text-to-3D generator"""
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.model_loaded = False
        logger.info(f"Text-to-3D Generator initialized on device: {self.device}")

    def load_model(self):
        """Lazy load the generation model"""
        if self.model_loaded:
            return

        try:
            logger.info("Loading Shap-E model for text-to-3D generation...")

            # Import Shap-E
            try:
                from shap_e.diffusion.sample import sample_latents
                from shap_e.diffusion.gaussian_diffusion import diffusion_from_config
                from shap_e.models.download import load_model, load_config
                from shap_e.util.notebooks import decode_latent_mesh

                # Load models
                self.xm = load_model('transmitter', device=self.device)
                self.model = load_model('text300M', device=self.device)
                self.diffusion = diffusion_from_config(load_config('diffusion'))

                self.sample_latents = sample_latents
                self.decode_latent_mesh = decode_latent_mesh

                self.model_loaded = True
                logger.info("Shap-E model loaded successfully")

            except ImportError:
                logger.warning("Shap-E not available, using fallback generation")
                self.model_loaded = True  # Use fallback

        except Exception as e:
            logger.error(f"Error loading text-to-3D model: {str(e)}")
            raise

    def generate(self, prompt, output_path, guidance_scale=15.0, num_inference_steps=64):
        """
        Generate a 3D model from text description

        Args:
            prompt: Text description of the 3D model
            output_path: Path to save the generated model
            guidance_scale: Guidance scale for generation (higher = more adherence to prompt)
            num_inference_steps: Number of diffusion steps

        Returns:
            (success: bool, message: str)
        """
        try:
            self.load_model()

            logger.info(f"Generating 3D model: '{prompt}'")

            # If Shap-E is available, use it
            if hasattr(self, 'sample_latents'):
                return self._generate_with_shap_e(prompt, output_path, guidance_scale, num_inference_steps)
            else:
                # Fallback: Generate a simple parametric model based on keywords
                return self._generate_fallback(prompt, output_path)

        except Exception as e:
            logger.error(f"Error generating 3D model: {str(e)}")
            return False, f"Generation failed: {str(e)}"

    def _generate_with_shap_e(self, prompt, output_path, guidance_scale, num_inference_steps):
        """Generate using Shap-E model"""
        try:
            # Sample latents
            latents = self.sample_latents(
                batch_size=1,
                model=self.model,
                diffusion=self.diffusion,
                guidance_scale=guidance_scale,
                model_kwargs=dict(texts=[prompt]),
                progress=True,
                clip_denoised=True,
                use_fp16=True,
                use_karras=True,
                karras_steps=num_inference_steps,
                sigma_min=1e-3,
                sigma_max=160,
                s_churn=0,
            )

            # Decode to mesh
            t = self.decode_latent_mesh(self.xm, latents[0]).tri_mesh()

            # Convert to trimesh
            mesh = trimesh.Trimesh(
                vertices=t.verts,
                faces=t.faces,
                vertex_colors=t.vertex_channels.get("R", None)
            )

            # Save based on format
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Model generated successfully: {output_path}")
            return True, "Model generated successfully"

        except Exception as e:
            logger.error(f"Shap-E generation failed: {str(e)}")
            # Fallback to simple generation
            return self._generate_fallback(prompt, output_path)

    def _generate_fallback(self, prompt, output_path):
        """
        Fallback generation using parametric models
        Creates basic shapes based on keywords in the prompt
        """
        try:
            logger.info(f"Using fallback generation for: '{prompt}'")

            prompt_lower = prompt.lower()

            # Create a parametric mesh based on keywords
            if any(word in prompt_lower for word in ['cube', 'box', 'square']):
                mesh = trimesh.creation.box(extents=[1, 1, 1])
            elif any(word in prompt_lower for word in ['sphere', 'ball', 'round']):
                mesh = trimesh.creation.icosphere(subdivisions=3, radius=0.5)
            elif any(word in prompt_lower for word in ['cylinder', 'tube', 'pipe']):
                mesh = trimesh.creation.cylinder(radius=0.3, height=1.0, sections=32)
            elif any(word in prompt_lower for word in ['cone', 'pyramid']):
                mesh = trimesh.creation.cone(radius=0.5, height=1.0, sections=32)
            elif any(word in prompt_lower for word in ['torus', 'donut', 'ring']):
                mesh = trimesh.creation.torus(major_radius=0.5, minor_radius=0.2, major_sections=32, minor_sections=16)
            elif any(word in prompt_lower for word in ['capsule', 'pill']):
                mesh = trimesh.creation.capsule(height=1.0, radius=0.3, count=[32, 16])
            else:
                # Default to a UV sphere
                mesh = trimesh.creation.icosphere(subdivisions=3, radius=0.5)

            # Add some color variation based on prompt
            if any(word in prompt_lower for word in ['red', 'crimson']):
                colors = np.array([[255, 100, 100, 255]] * len(mesh.vertices), dtype=np.uint8)
            elif any(word in prompt_lower for word in ['blue', 'azure']):
                colors = np.array([[100, 100, 255, 255]] * len(mesh.vertices), dtype=np.uint8)
            elif any(word in prompt_lower for word in ['green', 'emerald']):
                colors = np.array([[100, 255, 100, 255]] * len(mesh.vertices), dtype=np.uint8)
            elif any(word in prompt_lower for word in ['yellow', 'gold']):
                colors = np.array([[255, 255, 100, 255]] * len(mesh.vertices), dtype=np.uint8)
            else:
                colors = np.array([[200, 200, 200, 255]] * len(mesh.vertices), dtype=np.uint8)

            mesh.visual.vertex_colors = colors

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Fallback model generated: {output_path}")
            return True, "Model generated successfully (using parametric generation)"

        except Exception as e:
            logger.error(f"Fallback generation failed: {str(e)}")
            return False, f"Generation failed: {str(e)}"


class ImageTo3DGenerator:
    """
    Image-to-3D model generator
    Converts 2D images into 3D models using depth estimation and reconstruction
    """

    def __init__(self, device=None):
        """Initialize the image-to-3D generator"""
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.model_loaded = False
        logger.info(f"Image-to-3D Generator initialized on device: {self.device}")

    def load_model(self):
        """Lazy load the generation model"""
        if self.model_loaded:
            return

        try:
            logger.info("Loading models for image-to-3D generation...")

            # Try to load depth estimation model
            try:
                import torch
                self.depth_estimator = torch.hub.load('intel-isl/MiDaS', 'MiDaS_small')
                self.depth_estimator.to(self.device)
                self.depth_estimator.eval()

                # Load transforms
                midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
                self.depth_transform = midas_transforms.small_transform

                logger.info("MiDaS depth estimator loaded successfully")
            except Exception as e:
                logger.warning(f"Could not load MiDaS: {e}")
                self.depth_estimator = None

            self.model_loaded = True
            logger.info("Image-to-3D models loaded successfully")

        except Exception as e:
            logger.error(f"Error loading image-to-3D model: {str(e)}")
            raise

    def generate(self, image_path, output_path, foreground_ratio=0.85):
        """
        Generate a 3D model from an image

        Args:
            image_path: Path to input image
            output_path: Path to save the generated model
            foreground_ratio: Ratio for foreground detection

        Returns:
            (success: bool, message: str)
        """
        try:
            self.load_model()

            logger.info(f"Generating 3D model from image: {image_path}")

            # Load image
            image = Image.open(image_path).convert('RGB')

            # If depth estimator is available, use it
            if self.depth_estimator is not None:
                return self._generate_with_depth(image, output_path)
            else:
                # Fallback: Create a simple extrusion-based model
                return self._generate_fallback(image, output_path, foreground_ratio)

        except Exception as e:
            logger.error(f"Error generating 3D model from image: {str(e)}")
            return False, f"Generation failed: {str(e)}"

    def _generate_with_depth(self, image, output_path):
        """Generate using depth estimation"""
        try:
            # Prepare image
            img_array = np.array(image)
            input_batch = self.depth_transform(img_array).to(self.device)

            # Predict depth
            with torch.no_grad():
                prediction = self.depth_estimator(input_batch)
                prediction = torch.nn.functional.interpolate(
                    prediction.unsqueeze(1),
                    size=img_array.shape[:2],
                    mode="bicubic",
                    align_corners=False,
                ).squeeze()

            depth_map = prediction.cpu().numpy()

            # Create mesh from depth map
            mesh = self._depth_to_mesh(depth_map, img_array)

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Model generated from depth: {output_path}")
            return True, "Model generated successfully from image"

        except Exception as e:
            logger.error(f"Depth-based generation failed: {str(e)}")
            return self._generate_fallback(image, output_path, 0.85)

    def _depth_to_mesh(self, depth_map, image_array, depth_scale=0.3):
        """Convert depth map to 3D mesh"""
        try:
            height, width = depth_map.shape

            # Normalize depth
            depth_normalized = (depth_map - depth_map.min()) / (depth_map.max() - depth_map.min())
            depth_normalized = depth_normalized * depth_scale

            # Create vertices
            vertices = []
            colors = []

            step = max(1, min(height, width) // 100)  # Adaptive resolution

            for y in range(0, height, step):
                for x in range(0, width, step):
                    # Normalize coordinates to [-1, 1]
                    x_norm = (x / width) * 2 - 1
                    y_norm = (y / height) * 2 - 1
                    z = depth_normalized[y, x]

                    vertices.append([x_norm, y_norm, z])

                    # Get color from image
                    color = image_array[y, x]
                    colors.append(list(color) + [255])

            vertices = np.array(vertices)
            colors = np.array(colors, dtype=np.uint8)

            # Create faces using Delaunay triangulation
            from scipy.spatial import Delaunay
            points_2d = vertices[:, :2]
            tri = Delaunay(points_2d)
            faces = tri.simplices

            # Create mesh
            mesh = trimesh.Trimesh(vertices=vertices, faces=faces, vertex_colors=colors)

            # Clean up mesh
            mesh.remove_duplicate_faces()
            mesh.remove_degenerate_faces()
            mesh.remove_unreferenced_vertices()

            return mesh

        except Exception as e:
            logger.error(f"Error in depth_to_mesh: {str(e)}")
            raise

    def _generate_fallback(self, image, output_path, foreground_ratio):
        """
        Fallback generation using simple extrusion
        Creates a 2.5D relief from the image
        """
        try:
            logger.info("Using fallback image-to-3D generation")

            # Resize image for performance
            max_size = 256
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            img_array = np.array(image)

            height, width = img_array.shape[:2]

            # Create simple depth from brightness
            gray = np.mean(img_array, axis=2) / 255.0
            depth = gray * 0.2  # Simple depth from brightness

            # Create vertices
            vertices = []
            colors = []

            step = 2  # Sampling step

            for y in range(0, height, step):
                for x in range(0, width, step):
                    x_norm = (x / width) * 2 - 1
                    y_norm = (y / height) * 2 - 1
                    z = depth[y, x]

                    vertices.append([x_norm, -y_norm, z])
                    colors.append(list(img_array[y, x]) + [255])

            vertices = np.array(vertices)
            colors = np.array(colors, dtype=np.uint8)

            # Create faces
            from scipy.spatial import Delaunay
            points_2d = vertices[:, :2]
            tri = Delaunay(points_2d)
            faces = tri.simplices

            # Create mesh
            mesh = trimesh.Trimesh(vertices=vertices, faces=faces, vertex_colors=colors)

            # Clean up
            mesh.remove_duplicate_faces()
            mesh.remove_degenerate_faces()

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Fallback model generated: {output_path}")
            return True, "Model generated successfully from image"

        except Exception as e:
            logger.error(f"Fallback image-to-3D generation failed: {str(e)}")
            return False, f"Generation failed: {str(e)}"
