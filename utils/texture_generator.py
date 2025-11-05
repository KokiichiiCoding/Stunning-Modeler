"""
Texture Generation Utilities
Handles AI-powered texture generation and application to 3D models
"""

import os
import numpy as np
import trimesh
from PIL import Image
import logging
import torch

logger = logging.getLogger(__name__)


class TextureGenerator:
    """
    Generates and applies textures to 3D models using AI
    """

    def __init__(self, device=None):
        """Initialize the texture generator"""
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.model_loaded = False
        logger.info(f"Texture Generator initialized on device: {self.device}")

    def load_model(self):
        """Lazy load the texture generation model"""
        if self.model_loaded:
            return

        try:
            logger.info("Loading texture generation models...")

            # Try to load Stable Diffusion for texture generation
            try:
                from diffusers import StableDiffusionPipeline
                model_id = "runwayml/stable-diffusion-v1-5"
                self.pipe = StableDiffusionPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch.float16 if self.device == 'cuda' else torch.float32
                )
                self.pipe = self.pipe.to(self.device)
                logger.info("Stable Diffusion loaded for texture generation")
            except Exception as e:
                logger.warning(f"Could not load Stable Diffusion: {e}")
                self.pipe = None

            self.model_loaded = True
            logger.info("Texture generation models loaded")

        except Exception as e:
            logger.error(f"Error loading texture generator: {str(e)}")
            raise

    def apply_texture(self, model_path, output_path, texture_prompt, resolution=1024):
        """
        Apply AI-generated texture to a 3D model

        Args:
            model_path: Path to input model
            output_path: Path to save textured model
            texture_prompt: Description of desired texture
            resolution: Texture resolution (pixels)

        Returns:
            (success: bool, message: str)
        """
        try:
            self.load_model()

            logger.info(f"Applying texture to model: {model_path}")
            logger.info(f"Texture prompt: '{texture_prompt}'")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Generate or assign UV coordinates if missing
            if not hasattr(mesh.visual, 'uv') or mesh.visual.uv is None:
                logger.info("Generating UV coordinates...")
                mesh = self._generate_uvs(mesh)

            # Generate texture
            if self.pipe is not None:
                texture_image = self._generate_texture_with_ai(texture_prompt, resolution)
            else:
                texture_image = self._generate_texture_fallback(texture_prompt, resolution)

            # Save texture temporarily
            temp_texture_path = output_path.replace('.glb', '_texture.png').replace('.obj', '_texture.png')
            texture_image.save(temp_texture_path)

            # Apply texture to mesh
            material = trimesh.visual.material.SimpleMaterial(
                image=texture_image,
                diffuse=[255, 255, 255, 255]
            )

            # Create texture visual
            mesh.visual = trimesh.visual.TextureVisuals(
                uv=mesh.visual.uv if hasattr(mesh.visual, 'uv') else self._generate_uv_coords(mesh),
                image=texture_image,
                material=material
            )

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Textured model saved: {output_path}")
            return True, "Texture applied successfully"

        except Exception as e:
            logger.error(f"Error applying texture: {str(e)}")
            return False, f"Texturing failed: {str(e)}"

    def _generate_texture_with_ai(self, prompt, resolution):
        """Generate texture using Stable Diffusion"""
        try:
            logger.info("Generating texture with AI...")

            # Create seamless texture prompt
            full_prompt = f"seamless texture, {prompt}, tileable pattern, high quality, 4k, pbr material"

            # Generate image
            with torch.no_grad():
                result = self.pipe(
                    full_prompt,
                    height=resolution,
                    width=resolution,
                    num_inference_steps=30,
                    guidance_scale=7.5
                )

            texture_image = result.images[0]
            logger.info("AI texture generated successfully")
            return texture_image

        except Exception as e:
            logger.error(f"AI texture generation failed: {e}")
            return self._generate_texture_fallback(prompt, resolution)

    def _generate_texture_fallback(self, prompt, resolution):
        """
        Generate a procedural texture based on the prompt
        Fallback when AI model is not available
        """
        try:
            logger.info("Generating procedural texture...")

            prompt_lower = prompt.lower()

            # Create base texture based on keywords
            texture = np.ones((resolution, resolution, 3), dtype=np.uint8) * 128

            # Color selection
            if any(word in prompt_lower for word in ['wood', 'wooden', 'timber']):
                # Wood texture
                texture = self._generate_wood_texture(resolution)
            elif any(word in prompt_lower for word in ['metal', 'metallic', 'steel', 'iron']):
                # Metallic texture
                texture = self._generate_metal_texture(resolution)
            elif any(word in prompt_lower for word in ['stone', 'rock', 'granite', 'marble']):
                # Stone texture
                texture = self._generate_stone_texture(resolution)
            elif any(word in prompt_lower for word in ['fabric', 'cloth', 'textile']):
                # Fabric texture
                texture = self._generate_fabric_texture(resolution)
            elif any(word in prompt_lower for word in ['brick', 'wall']):
                # Brick texture
                texture = self._generate_brick_texture(resolution)
            else:
                # Generic colored texture
                texture = self._generate_colored_texture(prompt_lower, resolution)

            texture_image = Image.fromarray(texture)
            logger.info("Procedural texture generated")
            return texture_image

        except Exception as e:
            logger.error(f"Procedural texture generation failed: {e}")
            # Return simple colored texture as last resort
            color = [200, 200, 200]
            texture = np.ones((resolution, resolution, 3), dtype=np.uint8) * color
            return Image.fromarray(texture)

    def _generate_wood_texture(self, resolution):
        """Generate a procedural wood texture"""
        texture = np.zeros((resolution, resolution, 3), dtype=np.uint8)

        # Brown wood colors
        base_color = np.array([139, 90, 43])
        dark_color = np.array([101, 67, 33])

        for y in range(resolution):
            for x in range(resolution):
                # Create wood grain pattern
                noise = np.sin(x * 0.1 + np.sin(y * 0.05) * 10) * 0.5 + 0.5
                color = base_color * (0.7 + noise * 0.3) + dark_color * (0.3 - noise * 0.3)
                texture[y, x] = np.clip(color, 0, 255).astype(np.uint8)

        return texture

    def _generate_metal_texture(self, resolution):
        """Generate a procedural metal texture"""
        # Metallic gray with noise
        base = 180
        noise = np.random.randint(-30, 30, (resolution, resolution))
        texture = np.clip(base + noise, 0, 255).astype(np.uint8)
        texture = np.stack([texture, texture, texture], axis=2)
        return texture

    def _generate_stone_texture(self, resolution):
        """Generate a procedural stone texture"""
        # Gray stone with variation
        base_color = np.array([128, 128, 120])
        texture = np.zeros((resolution, resolution, 3), dtype=np.uint8)

        for y in range(resolution):
            for x in range(resolution):
                noise = np.sin(x * 0.05) * np.cos(y * 0.05) + np.random.random() * 0.3
                color = base_color * (0.6 + noise * 0.4)
                texture[y, x] = np.clip(color, 0, 255).astype(np.uint8)

        return texture

    def _generate_fabric_texture(self, resolution):
        """Generate a procedural fabric texture"""
        # Create weave pattern
        texture = np.ones((resolution, resolution, 3), dtype=np.uint8) * 200

        for y in range(resolution):
            for x in range(resolution):
                # Weave pattern
                pattern = ((x % 4) < 2) != ((y % 4) < 2)
                color = 200 if pattern else 180
                texture[y, x] = [color, color, color + 10]

        return texture

    def _generate_brick_texture(self, resolution):
        """Generate a procedural brick texture"""
        texture = np.zeros((resolution, resolution, 3), dtype=np.uint8)
        brick_color = np.array([180, 90, 70])
        mortar_color = np.array([200, 200, 200])

        brick_height = resolution // 8
        brick_width = resolution // 4

        for y in range(resolution):
            for x in range(resolution):
                # Brick pattern
                row = y // brick_height
                offset = (brick_width // 2) if (row % 2) == 1 else 0
                col = (x + offset) // brick_width

                # Mortar lines
                if (y % brick_height < 3) or (((x + offset) % brick_width) < 3):
                    texture[y, x] = mortar_color
                else:
                    texture[y, x] = brick_color + np.random.randint(-10, 10, 3)

        return np.clip(texture, 0, 255).astype(np.uint8)

    def _generate_colored_texture(self, prompt, resolution):
        """Generate a colored texture based on color keywords"""
        # Default gray
        base_color = [128, 128, 128]

        # Parse colors from prompt
        if 'red' in prompt or 'crimson' in prompt:
            base_color = [200, 80, 80]
        elif 'blue' in prompt or 'azure' in prompt:
            base_color = [80, 80, 200]
        elif 'green' in prompt or 'emerald' in prompt:
            base_color = [80, 200, 80]
        elif 'yellow' in prompt or 'gold' in prompt:
            base_color = [220, 220, 80]
        elif 'purple' in prompt or 'violet' in prompt:
            base_color = [180, 80, 180]
        elif 'orange' in prompt:
            base_color = [220, 140, 60]
        elif 'white' in prompt:
            base_color = [240, 240, 240]
        elif 'black' in prompt or 'dark' in prompt:
            base_color = [40, 40, 40]

        # Add some variation
        texture = np.ones((resolution, resolution, 3), dtype=np.uint8) * base_color
        noise = np.random.randint(-20, 20, (resolution, resolution, 3))
        texture = np.clip(texture + noise, 0, 255).astype(np.uint8)

        return texture

    def _generate_uvs(self, mesh):
        """Generate UV coordinates for a mesh"""
        try:
            # Try to use pymeshlab for UV unwrapping if available
            try:
                import pymeshlab as ml
                ms = ml.MeshSet()

                # Create temporary mesh
                temp_mesh = ml.Mesh(
                    vertex_matrix=mesh.vertices,
                    face_matrix=mesh.faces
                )
                ms.add_mesh(temp_mesh)

                # Apply UV parametrization
                ms.compute_texcoord_parametrization_triangle_trivial_per_wedge()

                # Get UV coordinates
                current_mesh = ms.current_mesh()
                uv_coords = current_mesh.wedge_tex_coord_matrix()

                mesh.visual.uv = uv_coords
                logger.info("UV coordinates generated with pymeshlab")

            except:
                # Fallback: simple spherical mapping
                uv_coords = self._generate_uv_coords(mesh)
                mesh.visual.uv = uv_coords
                logger.info("UV coordinates generated with spherical mapping")

            return mesh

        except Exception as e:
            logger.error(f"Error generating UVs: {e}")
            return mesh

    def _generate_uv_coords(self, mesh):
        """
        Generate simple spherical UV coordinates
        """
        try:
            vertices = mesh.vertices
            center = vertices.mean(axis=0)
            vertices_centered = vertices - center

            # Spherical coordinates
            r = np.linalg.norm(vertices_centered, axis=1)
            r = np.where(r == 0, 1e-10, r)  # Avoid division by zero

            # Calculate UV from spherical coordinates
            u = 0.5 + np.arctan2(vertices_centered[:, 2], vertices_centered[:, 0]) / (2 * np.pi)
            v = 0.5 - np.arcsin(vertices_centered[:, 1] / r) / np.pi

            uv = np.stack([u, v], axis=1)

            # Clamp to [0, 1]
            uv = np.clip(uv, 0, 1)

            return uv

        except Exception as e:
            logger.error(f"Error generating UV coordinates: {e}")
            # Return default UVs
            return np.zeros((len(mesh.vertices), 2))
