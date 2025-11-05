"""
3D Model Processing Utilities
Handles model optimization, format conversion, and analysis
"""

import os
import numpy as np
import trimesh
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class ModelProcessor:
    """
    Handles 3D model processing operations:
    - Format conversion (GLB, OBJ, FBX, PLY, STL)
    - Model optimization (decimation, cleanup)
    - Model analysis and information extraction
    """

    def __init__(self):
        """Initialize the model processor"""
        logger.info("Model Processor initialized")

    def optimize(self, model_path, output_path, target_triangles=None, preserve_uvs=True):
        """
        Optimize a 3D model for production use

        Args:
            model_path: Path to input model
            output_path: Path to save optimized model
            target_triangles: Target triangle count (None for automatic)
            preserve_uvs: Whether to preserve UV coordinates

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Optimizing model: {model_path}")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                # If it's a scene, merge all meshes
                mesh = mesh.dump(concatenate=True)

            original_faces = len(mesh.faces)
            logger.info(f"Original model: {len(mesh.vertices)} vertices, {original_faces} faces")

            # Clean up the mesh
            mesh.remove_duplicate_faces()
            mesh.remove_degenerate_faces()
            mesh.remove_unreferenced_vertices()
            mesh.fill_holes()

            # Simplify if needed
            if target_triangles and target_triangles < original_faces:
                try:
                    # Use trimesh simplification
                    logger.info(f"Simplifying to {target_triangles} triangles...")

                    # Calculate target ratio
                    target_ratio = target_triangles / original_faces

                    # Simplify using quadric decimation
                    simplified = mesh.simplify_quadric_decimation(target_triangles)

                    if simplified is not None and len(simplified.faces) > 0:
                        mesh = simplified
                        logger.info(f"Simplified to {len(mesh.faces)} faces")
                    else:
                        logger.warning("Simplification failed, using original mesh")

                except Exception as e:
                    logger.warning(f"Simplification error: {e}, using original mesh")

            # Merge vertices that are very close
            mesh.merge_vertices()

            # Ensure proper normals
            mesh.fix_normals()

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Optimized model saved: {output_path}")
            logger.info(f"Final model: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")

            reduction = ((original_faces - len(mesh.faces)) / original_faces) * 100
            return True, f"Model optimized successfully ({reduction:.1f}% reduction)"

        except Exception as e:
            logger.error(f"Error optimizing model: {str(e)}")
            return False, f"Optimization failed: {str(e)}"

    def convert(self, model_path, output_path, output_format='glb'):
        """
        Convert 3D model between formats

        Args:
            model_path: Path to input model
            output_path: Path to save converted model
            output_format: Target format (glb, obj, fbx, ply, stl)

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Converting {model_path} to {output_format}")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                # If it's a scene, merge all meshes
                mesh = mesh.dump(concatenate=True)

            # Handle specific format requirements
            if output_format.lower() in ['stl']:
                # STL doesn't support colors, remove them
                if hasattr(mesh.visual, 'vertex_colors'):
                    mesh.visual = trimesh.visual.ColorVisuals(mesh)

            # Export
            if output_format.lower() in ['glb', 'gltf']:
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path, file_type=output_format.lower())

            logger.info(f"Model converted successfully: {output_path}")
            return True, f"Model converted to {output_format.upper()} successfully"

        except Exception as e:
            logger.error(f"Error converting model: {str(e)}")
            return False, f"Conversion failed: {str(e)}"

    def get_model_info(self, model_path):
        """
        Get information about a 3D model

        Args:
            model_path: Path to the model

        Returns:
            dict: Model information
        """
        try:
            logger.info(f"Analyzing model: {model_path}")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                # If it's a scene, get info about all meshes
                total_vertices = 0
                total_faces = 0
                meshes_count = 0

                for name, geom in mesh.geometry.items():
                    if isinstance(geom, trimesh.Trimesh):
                        total_vertices += len(geom.vertices)
                        total_faces += len(geom.faces)
                        meshes_count += 1

                mesh = mesh.dump(concatenate=True)
            else:
                total_vertices = len(mesh.vertices)
                total_faces = len(mesh.faces)
                meshes_count = 1

            # Calculate bounding box
            bounds = mesh.bounds
            size = bounds[1] - bounds[0]

            # Check for UV coordinates
            has_uvs = hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None

            # Check for vertex colors
            has_colors = hasattr(mesh.visual, 'vertex_colors') and mesh.visual.vertex_colors is not None

            # Check if watertight
            is_watertight = mesh.is_watertight

            # Calculate volume if watertight
            volume = mesh.volume if is_watertight else None

            # Surface area
            surface_area = mesh.area

            info = {
                'vertices': total_vertices,
                'faces': total_faces,
                'meshes': meshes_count,
                'bounds': {
                    'min': bounds[0].tolist(),
                    'max': bounds[1].tolist(),
                    'size': size.tolist()
                },
                'has_uvs': has_uvs,
                'has_colors': has_colors,
                'is_watertight': is_watertight,
                'volume': volume,
                'surface_area': float(surface_area),
                'file_size': os.path.getsize(model_path),
                'format': os.path.splitext(model_path)[1].upper().replace('.', '')
            }

            logger.info(f"Model info extracted: {info['vertices']} verts, {info['faces']} faces")
            return info

        except Exception as e:
            logger.error(f"Error getting model info: {str(e)}")
            return {
                'error': str(e)
            }

    def repair_mesh(self, model_path, output_path):
        """
        Repair a 3D mesh (fix holes, normals, etc.)

        Args:
            model_path: Path to input model
            output_path: Path to save repaired model

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Repairing mesh: {model_path}")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Repair operations
            mesh.remove_duplicate_faces()
            mesh.remove_degenerate_faces()
            mesh.remove_unreferenced_vertices()
            mesh.fill_holes()
            mesh.merge_vertices()
            mesh.fix_normals()

            # Make sure the mesh is manifold if possible
            if not mesh.is_watertight:
                logger.warning("Mesh is not watertight after repair")

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Mesh repaired: {output_path}")
            return True, "Mesh repaired successfully"

        except Exception as e:
            logger.error(f"Error repairing mesh: {str(e)}")
            return False, f"Repair failed: {str(e)}"

    def scale_model(self, model_path, output_path, scale_factor=1.0):
        """
        Scale a 3D model

        Args:
            model_path: Path to input model
            output_path: Path to save scaled model
            scale_factor: Scale multiplier

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Scaling model by {scale_factor}x")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Apply scaling
            mesh.apply_scale(scale_factor)

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Model scaled successfully: {output_path}")
            return True, f"Model scaled by {scale_factor}x"

        except Exception as e:
            logger.error(f"Error scaling model: {str(e)}")
            return False, f"Scaling failed: {str(e)}"

    def center_model(self, model_path, output_path):
        """
        Center a 3D model at the origin

        Args:
            model_path: Path to input model
            output_path: Path to save centered model

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Centering model: {model_path}")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')

            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Center at origin
            mesh.vertices -= mesh.center_mass

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext == '.glb' or file_ext == '.gltf':
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Model centered successfully: {output_path}")
            return True, "Model centered at origin"

        except Exception as e:
            logger.error(f"Error centering model: {str(e)}")
            return False, f"Centering failed: {str(e)}"
