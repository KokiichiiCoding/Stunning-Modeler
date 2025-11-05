"""
Advanced Mesh Optimization and Retopology
AI-powered mesh simplification and topology optimization
"""

import os
import numpy as np
import trimesh
import logging
from scipy.spatial import KDTree

logger = logging.getLogger(__name__)


class MeshOptimizer:
    """
    Advanced mesh optimization and retopology system
    """

    def __init__(self):
        """Initialize mesh optimizer"""
        logger.info("Mesh Optimizer initialized")

    def ai_retopology(self, model_path, output_path, target_faces=None, quad_dominant=False):
        """
        AI-powered retopology for cleaner mesh structure

        Args:
            model_path: Input model path
            output_path: Output model path
            target_faces: Target face count (None for auto)
            quad_dominant: Try to create quad-dominant topology

        Returns:
            (success: bool, message: str, stats: dict)
        """
        try:
            logger.info(f"Performing AI retopology on: {model_path}")

            # Load mesh
            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            original_faces = len(mesh.faces)
            original_vertices = len(mesh.vertices)

            logger.info(f"Original mesh: {original_vertices} verts, {original_faces} faces")

            # Step 1: Clean up the mesh
            mesh = self._clean_mesh(mesh)

            # Step 2: Remesh with better topology
            if target_faces:
                mesh = self._adaptive_remesh(mesh, target_faces)
            else:
                # Auto-determine target based on complexity
                target_faces = max(1000, original_faces // 2)
                mesh = self._adaptive_remesh(mesh, target_faces)

            # Step 3: Optimize for quad topology if requested
            if quad_dominant:
                mesh = self._optimize_for_quads(mesh)

            # Step 4: Final cleanup
            mesh.remove_duplicate_faces()
            mesh.remove_degenerate_faces()
            mesh.remove_unreferenced_vertices()
            mesh.fix_normals()

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext in ['.glb', '.gltf']:
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            new_faces = len(mesh.faces)
            new_vertices = len(mesh.vertices)

            reduction = ((original_faces - new_faces) / original_faces) * 100

            stats = {
                'original_vertices': original_vertices,
                'original_faces': original_faces,
                'new_vertices': new_vertices,
                'new_faces': new_faces,
                'reduction_percent': reduction
            }

            logger.info(f"Retopology complete: {new_vertices} verts, {new_faces} faces ({reduction:.1f}% reduction)")

            return True, f"Mesh retopologized ({reduction:.1f}% reduction)", stats

        except Exception as e:
            logger.error(f"Retopology failed: {str(e)}")
            return False, f"Retopology failed: {str(e)}", {}

    def _clean_mesh(self, mesh):
        """Clean up mesh before retopology"""
        # Remove duplicates and degenerate faces
        mesh.remove_duplicate_faces()
        mesh.remove_degenerate_faces()
        mesh.remove_unreferenced_vertices()

        # Fill small holes
        mesh.fill_holes()

        # Merge nearby vertices
        mesh.merge_vertices()

        # Fix normals
        mesh.fix_normals()

        return mesh

    def _adaptive_remesh(self, mesh, target_faces):
        """Adaptive remeshing to target face count"""
        try:
            # Use quadric decimation for edge collapse
            simplified = mesh.simplify_quadric_decimation(target_faces)

            if simplified and len(simplified.faces) > 0:
                return simplified
            else:
                logger.warning("Simplification failed, returning original")
                return mesh

        except Exception as e:
            logger.warning(f"Adaptive remesh failed: {e}, returning original")
            return mesh

    def _optimize_for_quads(self, mesh):
        """
        Attempt to create quad-dominant topology
        This is a simplified version - full quad remeshing is complex
        """
        try:
            # This is a placeholder for quad optimization
            # Real implementation would use algorithms like:
            # - Catmull-Clark subdivision
            # - Quad-based remeshing
            # - Triangle pairing

            # For now, just ensure even edge distribution
            return mesh

        except Exception as e:
            logger.warning(f"Quad optimization failed: {e}")
            return mesh

    def smart_decimate(self, model_path, output_path, quality='balanced'):
        """
        Smart decimation with quality presets

        Args:
            model_path: Input model
            output_path: Output model
            quality: 'high' (30% reduction), 'balanced' (50%), 'performance' (70%)

        Returns:
            (success: bool, message: str)
        """
        try:
            # Load mesh
            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            original_faces = len(mesh.faces)

            # Determine target based on quality
            quality_targets = {
                'high': 0.7,      # Keep 70%
                'balanced': 0.5,  # Keep 50%
                'performance': 0.3  # Keep 30%
            }

            target_ratio = quality_targets.get(quality, 0.5)
            target_faces = int(original_faces * target_ratio)

            logger.info(f"Smart decimating to {target_faces} faces ({quality} quality)")

            # Decimate
            simplified = mesh.simplify_quadric_decimation(target_faces)

            if simplified and len(simplified.faces) > 0:
                mesh = simplified

            # Clean up
            mesh.remove_duplicate_faces()
            mesh.fix_normals()

            # Export
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext in ['.glb', '.gltf']:
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            reduction = ((original_faces - len(mesh.faces)) / original_faces) * 100

            logger.info(f"Decimation complete: {reduction:.1f}% reduction")
            return True, f"Model decimated ({reduction:.1f}% reduction)"

        except Exception as e:
            logger.error(f"Smart decimation failed: {str(e)}")
            return False, f"Decimation failed: {str(e)}"

    def fix_mesh_issues(self, model_path, output_path):
        """
        Comprehensive mesh repair

        Args:
            model_path: Input model
            output_path: Output model

        Returns:
            (success: bool, message: str, issues_fixed: list)
        """
        try:
            logger.info(f"Fixing mesh issues: {model_path}")

            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            issues_fixed = []

            # Check and fix various issues
            initial_faces = len(mesh.faces)

            # 1. Remove duplicate faces
            mesh.remove_duplicate_faces()
            if len(mesh.faces) < initial_faces:
                issues_fixed.append("Removed duplicate faces")

            # 2. Remove degenerate faces (zero area)
            initial_faces = len(mesh.faces)
            mesh.remove_degenerate_faces()
            if len(mesh.faces) < initial_faces:
                issues_fixed.append("Removed degenerate faces")

            # 3. Remove unreferenced vertices
            initial_verts = len(mesh.vertices)
            mesh.remove_unreferenced_vertices()
            if len(mesh.vertices) < initial_verts:
                issues_fixed.append("Removed unreferenced vertices")

            # 4. Fill holes
            if not mesh.is_watertight:
                mesh.fill_holes()
                if mesh.is_watertight:
                    issues_fixed.append("Filled holes (mesh is now watertight)")
                else:
                    issues_fixed.append("Attempted to fill holes")

            # 5. Merge close vertices
            mesh.merge_vertices()
            issues_fixed.append("Merged nearby vertices")

            # 6. Fix normals
            mesh.fix_normals()
            issues_fixed.append("Fixed normals")

            # 7. Check for non-manifold edges
            # (trimesh doesn't have direct fix, but cleaning usually helps)

            # Export fixed mesh
            file_ext = os.path.splitext(output_path)[1].lower()
            if file_ext in ['.glb', '.gltf']:
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            logger.info(f"Mesh fixed. Issues resolved: {len(issues_fixed)}")
            return True, f"Fixed {len(issues_fixed)} issues", issues_fixed

        except Exception as e:
            logger.error(f"Mesh fixing failed: {str(e)}")
            return False, f"Mesh fixing failed: {str(e)}", []

    def analyze_mesh_quality(self, model_path):
        """
        Analyze mesh quality and identify issues

        Returns:
            Analysis report with quality metrics and issues
        """
        try:
            logger.info(f"Analyzing mesh quality: {model_path}")

            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Calculate various quality metrics
            analysis = {
                'vertices': len(mesh.vertices),
                'faces': len(mesh.faces),
                'edges': len(mesh.edges),
                'is_watertight': mesh.is_watertight,
                'is_winding_consistent': mesh.is_winding_consistent,
                'is_volume': mesh.is_volume,
                'euler_number': mesh.euler_number,
                'issues': [],
                'recommendations': []
            }

            # Check for issues
            if not mesh.is_watertight:
                analysis['issues'].append("Mesh has holes (not watertight)")
                analysis['recommendations'].append("Use 'Fill Holes' or 'Fix Mesh Issues'")

            if not mesh.is_winding_consistent:
                analysis['issues'].append("Inconsistent face winding")
                analysis['recommendations'].append("Use 'Fix Normals'")

            # Check face quality
            try:
                face_adjacency = mesh.face_adjacency
                if len(face_adjacency) < len(mesh.faces):
                    analysis['issues'].append("Mesh has non-manifold edges")
                    analysis['recommendations'].append("Use 'AI Retopology' for clean topology")
            except:
                pass

            # Check for degenerate faces
            areas = mesh.area_faces
            degenerate_count = np.sum(areas < 1e-10)
            if degenerate_count > 0:
                analysis['issues'].append(f"Found {degenerate_count} degenerate faces")
                analysis['recommendations'].append("Use 'Fix Mesh Issues'")

            # Poly count recommendations
            face_count = len(mesh.faces)
            if face_count > 100000:
                analysis['recommendations'].append("High poly count - consider decimation for better performance")
            elif face_count < 100:
                analysis['recommendations'].append("Very low poly count - may lack detail")

            # Aspect ratio check
            try:
                # Check triangle quality
                vertices = mesh.vertices[mesh.faces]
                edges = vertices[:, [1, 2, 0]] - vertices[:, [0, 1, 2]]
                edge_lengths = np.linalg.norm(edges, axis=2)

                min_edges = edge_lengths.min(axis=1)
                max_edges = edge_lengths.max(axis=1)

                aspect_ratios = max_edges / (min_edges + 1e-10)
                bad_triangles = np.sum(aspect_ratios > 10)

                if bad_triangles > face_count * 0.1:
                    analysis['issues'].append(f"Found {bad_triangles} poorly shaped triangles")
                    analysis['recommendations'].append("Use 'AI Retopology' for better triangle quality")
            except:
                pass

            analysis['quality_score'] = self._calculate_quality_score(analysis)

            logger.info(f"Mesh analysis complete. Quality score: {analysis['quality_score']}/100")
            return analysis

        except Exception as e:
            logger.error(f"Mesh analysis failed: {str(e)}")
            return {'error': str(e)}

    def _calculate_quality_score(self, analysis):
        """Calculate overall quality score (0-100)"""
        score = 100

        # Deduct for issues
        if not analysis['is_watertight']:
            score -= 20
        if not analysis['is_winding_consistent']:
            score -= 15

        # Deduct for each additional issue
        score -= len(analysis['issues']) * 5

        # Ensure score is in valid range
        score = max(0, min(100, score))

        return score

    def auto_lod_generation(self, model_path, output_dir, levels=3):
        """
        Generate LOD (Level of Detail) versions automatically

        Args:
            model_path: Input high-quality model
            output_dir: Output directory for LOD files
            levels: Number of LOD levels (default 3)

        Returns:
            (success: bool, message: str, lod_paths: list)
        """
        try:
            logger.info(f"Generating {levels} LOD levels")

            os.makedirs(output_dir, exist_ok=True)

            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            original_faces = len(mesh.faces)
            lod_paths = []

            # Generate LOD levels with decreasing quality
            ratios = np.linspace(0.8, 0.1, levels)

            for i, ratio in enumerate(ratios):
                target_faces = int(original_faces * ratio)

                # Simplify
                lod_mesh = mesh.simplify_quadric_decimation(target_faces)

                if lod_mesh and len(lod_mesh.faces) > 0:
                    # Export LOD
                    lod_filename = f"lod{i}_faces{len(lod_mesh.faces)}.glb"
                    lod_path = os.path.join(output_dir, lod_filename)

                    lod_mesh.export(lod_path, file_type='glb')
                    lod_paths.append(lod_path)

                    logger.info(f"LOD {i}: {len(lod_mesh.faces)} faces ({ratio*100:.0f}% of original)")

            return True, f"Generated {len(lod_paths)} LOD levels", lod_paths

        except Exception as e:
            logger.error(f"LOD generation failed: {str(e)}")
            return False, f"LOD generation failed: {str(e)}", []
