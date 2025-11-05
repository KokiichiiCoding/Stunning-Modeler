"""
Advanced PBR (Physically Based Rendering) Material System
Generate complete material sets with multiple texture maps
"""

import os
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
import logging

logger = logging.getLogger(__name__)


class PBRMaterialGenerator:
    """
    Generate PBR material sets with multiple texture maps
    """

    def __init__(self):
        """Initialize PBR material generator"""
        logger.info("PBR Material Generator initialized")

        # Material presets
        self.material_presets = {
            'wood': {
                'base_color': [139, 90, 43],
                'roughness': 0.8,
                'metallic': 0.0,
                'ao_strength': 0.7,
                'normal_strength': 0.5
            },
            'metal': {
                'base_color': [180, 180, 180],
                'roughness': 0.3,
                'metallic': 1.0,
                'ao_strength': 0.5,
                'normal_strength': 0.3
            },
            'plastic': {
                'base_color': [200, 200, 200],
                'roughness': 0.4,
                'metallic': 0.0,
                'ao_strength': 0.4,
                'normal_strength': 0.2
            },
            'rubber': {
                'base_color': [60, 60, 60],
                'roughness': 0.9,
                'metallic': 0.0,
                'ao_strength': 0.6,
                'normal_strength': 0.3
            },
            'fabric': {
                'base_color': [100, 100, 120],
                'roughness': 0.85,
                'metallic': 0.0,
                'ao_strength': 0.65,
                'normal_strength': 0.6
            },
            'stone': {
                'base_color': [128, 128, 120],
                'roughness': 0.75,
                'metallic': 0.0,
                'ao_strength': 0.8,
                'normal_strength': 0.7
            },
            'gold': {
                'base_color': [255, 215, 0],
                'roughness': 0.2,
                'metallic': 1.0,
                'ao_strength': 0.3,
                'normal_strength': 0.2
            },
            'chrome': {
                'base_color': [220, 220, 220],
                'roughness': 0.1,
                'metallic': 1.0,
                'ao_strength': 0.2,
                'normal_strength': 0.1
            },
        }

    def generate_pbr_material(self, output_dir, material_name='default', resolution=1024,
                            preset=None, custom_params=None):
        """
        Generate complete PBR material set

        Args:
            output_dir: Directory to save texture maps
            material_name: Name for the material
            resolution: Texture resolution (pixels)
            preset: Material preset name ('wood', 'metal', etc.)
            custom_params: Custom material parameters

        Returns:
            (success: bool, message: str, material_paths: dict)
        """
        try:
            logger.info(f"Generating PBR material: {material_name}")

            os.makedirs(output_dir, exist_ok=True)

            # Get material parameters
            if preset and preset in self.material_presets:
                params = self.material_presets[preset].copy()
            else:
                params = {
                    'base_color': [200, 200, 200],
                    'roughness': 0.5,
                    'metallic': 0.0,
                    'ao_strength': 0.5,
                    'normal_strength': 0.5
                }

            # Override with custom params
            if custom_params:
                params.update(custom_params)

            # Generate texture maps
            material_paths = {}

            # 1. Albedo/Base Color
            albedo_path = os.path.join(output_dir, f'{material_name}_albedo.png')
            self._generate_albedo(albedo_path, params, resolution)
            material_paths['albedo'] = albedo_path

            # 2. Normal Map
            normal_path = os.path.join(output_dir, f'{material_name}_normal.png')
            self._generate_normal_map(normal_path, params, resolution)
            material_paths['normal'] = normal_path

            # 3. Roughness Map
            roughness_path = os.path.join(output_dir, f'{material_name}_roughness.png')
            self._generate_roughness_map(roughness_path, params, resolution)
            material_paths['roughness'] = roughness_path

            # 4. Metallic Map
            metallic_path = os.path.join(output_dir, f'{material_name}_metallic.png')
            self._generate_metallic_map(metallic_path, params, resolution)
            material_paths['metallic'] = metallic_path

            # 5. Ambient Occlusion
            ao_path = os.path.join(output_dir, f'{material_name}_ao.png')
            self._generate_ao_map(ao_path, params, resolution)
            material_paths['ao'] = ao_path

            # 6. Height/Displacement (optional)
            height_path = os.path.join(output_dir, f'{material_name}_height.png')
            self._generate_height_map(height_path, params, resolution)
            material_paths['height'] = height_path

            logger.info(f"Generated PBR material with {len(material_paths)} maps")
            return True, "PBR material generated successfully", material_paths

        except Exception as e:
            logger.error(f"Error generating PBR material: {str(e)}")
            return False, f"Material generation failed: {str(e)}", {}

    def _generate_albedo(self, output_path, params, resolution):
        """Generate albedo/base color texture"""
        try:
            base_color = params['base_color']

            # Create base texture with color
            texture = np.ones((resolution, resolution, 3), dtype=np.uint8)
            texture[:, :] = base_color

            # Add noise for variation
            noise = np.random.randint(-15, 15, (resolution, resolution, 3))
            texture = np.clip(texture + noise, 0, 255).astype(np.uint8)

            # Add subtle patterns based on material type
            if params.get('roughness', 0.5) > 0.7:
                # Rough materials get more variation
                texture = self._add_grain_pattern(texture)

            img = Image.fromarray(texture)

            # Slight blur for smoothness
            img = img.filter(ImageFilter.GaussianBlur(radius=0.5))

            img.save(output_path)
            logger.debug(f"Generated albedo: {output_path}")

        except Exception as e:
            logger.error(f"Error generating albedo: {str(e)}")
            raise

    def _generate_normal_map(self, output_path, params, resolution):
        """Generate normal map texture"""
        try:
            normal_strength = params.get('normal_strength', 0.5)

            # Create base normal map (flat = [128, 128, 255])
            texture = np.ones((resolution, resolution, 3), dtype=np.uint8)
            texture[:, :] = [128, 128, 255]

            # Add normal variation
            if normal_strength > 0:
                # Generate height noise
                noise = np.random.rand(resolution, resolution) * normal_strength * 50

                # Convert to normal map
                for y in range(1, resolution - 1):
                    for x in range(1, resolution - 1):
                        # Sobel filter for gradients
                        dx = (noise[y, x + 1] - noise[y, x - 1]) * 0.5
                        dy = (noise[y + 1, x] - noise[y - 1, x]) * 0.5

                        # Normal vector
                        normal_x = -dx
                        normal_y = -dy
                        normal_z = 1.0

                        # Normalize
                        length = np.sqrt(normal_x**2 + normal_y**2 + normal_z**2)
                        normal_x /= length
                        normal_y /= length
                        normal_z /= length

                        # Convert to color (0-255)
                        texture[y, x, 0] = int((normal_x + 1) * 127.5)
                        texture[y, x, 1] = int((normal_y + 1) * 127.5)
                        texture[y, x, 2] = int((normal_z + 1) * 127.5)

            img = Image.fromarray(texture)
            img.save(output_path)
            logger.debug(f"Generated normal map: {output_path}")

        except Exception as e:
            logger.error(f"Error generating normal map: {str(e)}")
            raise

    def _generate_roughness_map(self, output_path, params, resolution):
        """Generate roughness map texture"""
        try:
            roughness = params.get('roughness', 0.5)

            # Create roughness texture
            base_value = int(roughness * 255)
            texture = np.ones((resolution, resolution), dtype=np.uint8) * base_value

            # Add variation
            noise = np.random.randint(-20, 20, (resolution, resolution))
            texture = np.clip(texture + noise, 0, 255).astype(np.uint8)

            img = Image.fromarray(texture, mode='L')

            # Blur for smoothness
            img = img.filter(ImageFilter.GaussianBlur(radius=1.0))

            img.save(output_path)
            logger.debug(f"Generated roughness map: {output_path}")

        except Exception as e:
            logger.error(f"Error generating roughness map: {str(e)}")
            raise

    def _generate_metallic_map(self, output_path, params, resolution):
        """Generate metallic map texture"""
        try:
            metallic = params.get('metallic', 0.0)

            # Create metallic texture (usually binary - either metal or not)
            base_value = int(metallic * 255)
            texture = np.ones((resolution, resolution), dtype=np.uint8) * base_value

            # Very slight variation for non-uniform metals
            if metallic > 0.5:
                noise = np.random.randint(-10, 10, (resolution, resolution))
                texture = np.clip(texture + noise, 0, 255).astype(np.uint8)

            img = Image.fromarray(texture, mode='L')
            img.save(output_path)
            logger.debug(f"Generated metallic map: {output_path}")

        except Exception as e:
            logger.error(f"Error generating metallic map: {str(e)}")
            raise

    def _generate_ao_map(self, output_path, params, resolution):
        """Generate ambient occlusion map"""
        try:
            ao_strength = params.get('ao_strength', 0.5)

            # Create AO texture (lighter = more exposed, darker = occluded)
            base_value = 200  # Mostly lit

            texture = np.ones((resolution, resolution), dtype=np.uint8) * base_value

            # Add AO patterns (darker in crevices)
            if ao_strength > 0:
                # Create random occlusion patterns
                for _ in range(int(ao_strength * 20)):
                    x = np.random.randint(0, resolution)
                    y = np.random.randint(0, resolution)
                    size = np.random.randint(20, 100)

                    # Create circular dark spot
                    y_coords, x_coords = np.ogrid[-y:resolution-y, -x:resolution-x]
                    mask = x_coords*x_coords + y_coords*y_coords <= size*size

                    darkening = int(ao_strength * 100)
                    texture[mask] = np.clip(texture[mask] - darkening, 0, 255)

            img = Image.fromarray(texture, mode='L')

            # Heavy blur for soft AO
            img = img.filter(ImageFilter.GaussianBlur(radius=10.0))

            img.save(output_path)
            logger.debug(f"Generated AO map: {output_path}")

        except Exception as e:
            logger.error(f"Error generating AO map: {str(e)}")
            raise

    def _generate_height_map(self, output_path, params, resolution):
        """Generate height/displacement map"""
        try:
            normal_strength = params.get('normal_strength', 0.5)

            # Height map is often derived from normal map intensity
            texture = np.zeros((resolution, resolution), dtype=np.uint8)

            if normal_strength > 0:
                # Generate Perlin-like noise
                for i in range(5):  # Multiple octaves
                    scale = 2 ** i
                    noise = np.random.rand(resolution // scale, resolution // scale)

                    # Resize to full resolution
                    noise_resized = np.array(Image.fromarray((noise * 255).astype(np.uint8)).resize((resolution, resolution)))

                    texture += (noise_resized // (2 ** i))

                texture = (texture / texture.max() * 255).astype(np.uint8)

            img = Image.fromarray(texture, mode='L')

            # Blur for smoothness
            img = img.filter(ImageFilter.GaussianBlur(radius=2.0))

            img.save(output_path)
            logger.debug(f"Generated height map: {output_path}")

        except Exception as e:
            logger.error(f"Error generating height map: {str(e)}")
            raise

    def _add_grain_pattern(self, texture):
        """Add grain pattern to texture"""
        height, width = texture.shape[:2]

        # Add directional noise for grain
        for y in range(height):
            grain = np.random.randint(-5, 5, (width, 3))
            texture[y] = np.clip(texture[y] + grain, 0, 255)

        return texture.astype(np.uint8)

    def apply_pbr_to_model(self, model_path, material_paths, output_path):
        """
        Apply PBR material set to a 3D model

        Args:
            model_path: Path to 3D model
            material_paths: Dict of texture map paths
            output_path: Output model path

        Returns:
            (success: bool, message: str)
        """
        try:
            import trimesh

            logger.info(f"Applying PBR material to model: {model_path}")

            # Load model
            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Load textures
            textures = {}
            for tex_type, tex_path in material_paths.items():
                if os.path.exists(tex_path):
                    textures[tex_type] = Image.open(tex_path)

            # Apply base color texture
            if 'albedo' in textures:
                mesh.visual = trimesh.visual.TextureVisuals(
                    image=textures['albedo']
                )

            # Store other maps in metadata for export
            mesh.metadata['pbr_textures'] = material_paths

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext in ['.glb', '.gltf']:
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"PBR material applied successfully: {output_path}")
            return True, "PBR material applied successfully"

        except Exception as e:
            logger.error(f"Error applying PBR material: {str(e)}")
            return False, f"Failed to apply material: {str(e)}"
