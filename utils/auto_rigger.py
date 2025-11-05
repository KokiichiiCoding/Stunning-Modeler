"""
Auto-Rigging System for 3D Models
Automatic skeleton generation and weight painting for characters and objects
"""

import os
import numpy as np
import trimesh
import logging
from scipy.spatial import KDTree
from scipy.spatial.distance import cdist

logger = logging.getLogger(__name__)


class AutoRigger:
    """
    Automatic rigging system for 3D models
    Supports humanoid, quadruped, and custom rigs
    """

    def __init__(self):
        """Initialize the auto-rigger"""
        logger.info("Auto-Rigger initialized")

        # Predefined skeleton templates
        self.skeleton_templates = {
            'humanoid': self._get_humanoid_skeleton(),
            'humanoid_simple': self._get_simple_humanoid_skeleton(),
            'quadruped': self._get_quadruped_skeleton(),
            'biped': self._get_biped_skeleton(),
        }

    def auto_rig(self, model_path, output_path, rig_type='humanoid', auto_weight=True):
        """
        Automatically rig a 3D model

        Args:
            model_path: Path to input model
            output_path: Path to save rigged model
            rig_type: Type of rig ('humanoid', 'quadruped', etc.)
            auto_weight: Automatically generate bone weights

        Returns:
            (success: bool, message: str, rig_data: dict)
        """
        try:
            logger.info(f"Auto-rigging model: {model_path} with {rig_type} rig")

            # Load the model
            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Get skeleton template
            skeleton = self.skeleton_templates.get(rig_type)
            if skeleton is None:
                return False, f"Unknown rig type: {rig_type}", None

            # Fit skeleton to mesh
            fitted_skeleton = self._fit_skeleton_to_mesh(mesh, skeleton)

            # Generate bone weights
            if auto_weight:
                weights = self._generate_bone_weights(mesh, fitted_skeleton)
            else:
                weights = None

            # Create rig data
            rig_data = {
                'skeleton': fitted_skeleton,
                'weights': weights,
                'rig_type': rig_type,
                'bone_count': len(fitted_skeleton['bones'])
            }

            # Export rigged model
            self._export_rigged_model(mesh, rig_data, output_path)

            logger.info(f"Model rigged successfully with {len(fitted_skeleton['bones'])} bones")
            return True, "Model rigged successfully", rig_data

        except Exception as e:
            logger.error(f"Error auto-rigging model: {str(e)}")
            return False, f"Rigging failed: {str(e)}", None

    def _get_humanoid_skeleton(self):
        """
        Get standard humanoid skeleton template (Unity/Unreal compatible)
        Bone positions in normalized space (0-1)
        """
        bones = {
            # Spine
            'Hips': {'position': [0.5, 0.4, 0.5], 'parent': None},
            'Spine': {'position': [0.5, 0.5, 0.5], 'parent': 'Hips'},
            'Spine1': {'position': [0.5, 0.6, 0.5], 'parent': 'Spine'},
            'Spine2': {'position': [0.5, 0.7, 0.5], 'parent': 'Spine1'},
            'Neck': {'position': [0.5, 0.82, 0.5], 'parent': 'Spine2'},
            'Head': {'position': [0.5, 0.9, 0.5], 'parent': 'Neck'},

            # Left Arm
            'LeftShoulder': {'position': [0.55, 0.75, 0.5], 'parent': 'Spine2'},
            'LeftArm': {'position': [0.65, 0.75, 0.5], 'parent': 'LeftShoulder'},
            'LeftForeArm': {'position': [0.8, 0.6, 0.5], 'parent': 'LeftArm'},
            'LeftHand': {'position': [0.95, 0.45, 0.5], 'parent': 'LeftForeArm'},

            # Right Arm
            'RightShoulder': {'position': [0.45, 0.75, 0.5], 'parent': 'Spine2'},
            'RightArm': {'position': [0.35, 0.75, 0.5], 'parent': 'RightShoulder'},
            'RightForeArm': {'position': [0.2, 0.6, 0.5], 'parent': 'RightArm'},
            'RightHand': {'position': [0.05, 0.45, 0.5], 'parent': 'RightForeArm'},

            # Left Leg
            'LeftUpLeg': {'position': [0.55, 0.35, 0.5], 'parent': 'Hips'},
            'LeftLeg': {'position': [0.55, 0.2, 0.5], 'parent': 'LeftUpLeg'},
            'LeftFoot': {'position': [0.55, 0.05, 0.5], 'parent': 'LeftLeg'},
            'LeftToeBase': {'position': [0.55, 0.02, 0.55], 'parent': 'LeftFoot'},

            # Right Leg
            'RightUpLeg': {'position': [0.45, 0.35, 0.5], 'parent': 'Hips'},
            'RightLeg': {'position': [0.45, 0.2, 0.5], 'parent': 'RightUpLeg'},
            'RightFoot': {'position': [0.45, 0.05, 0.5], 'parent': 'RightLeg'},
            'RightToeBase': {'position': [0.45, 0.02, 0.55], 'parent': 'RightFoot'},
        }

        return {'bones': bones, 'root': 'Hips'}

    def _get_simple_humanoid_skeleton(self):
        """Simplified humanoid skeleton (fewer bones)"""
        bones = {
            'Hips': {'position': [0.5, 0.4, 0.5], 'parent': None},
            'Spine': {'position': [0.5, 0.65, 0.5], 'parent': 'Hips'},
            'Neck': {'position': [0.5, 0.82, 0.5], 'parent': 'Spine'},
            'Head': {'position': [0.5, 0.95, 0.5], 'parent': 'Neck'},

            'LeftArm': {'position': [0.7, 0.7, 0.5], 'parent': 'Spine'},
            'LeftForeArm': {'position': [0.85, 0.5, 0.5], 'parent': 'LeftArm'},
            'LeftHand': {'position': [0.95, 0.35, 0.5], 'parent': 'LeftForeArm'},

            'RightArm': {'position': [0.3, 0.7, 0.5], 'parent': 'Spine'},
            'RightForeArm': {'position': [0.15, 0.5, 0.5], 'parent': 'RightArm'},
            'RightHand': {'position': [0.05, 0.35, 0.5], 'parent': 'RightForeArm'},

            'LeftLeg': {'position': [0.55, 0.25, 0.5], 'parent': 'Hips'},
            'LeftFoot': {'position': [0.55, 0.05, 0.5], 'parent': 'LeftLeg'},

            'RightLeg': {'position': [0.45, 0.25, 0.5], 'parent': 'Hips'},
            'RightFoot': {'position': [0.45, 0.05, 0.5], 'parent': 'RightLeg'},
        }

        return {'bones': bones, 'root': 'Hips'}

    def _get_quadruped_skeleton(self):
        """Quadruped animal skeleton"""
        bones = {
            'Hips': {'position': [0.5, 0.5, 0.3], 'parent': None},
            'Spine': {'position': [0.5, 0.5, 0.5], 'parent': 'Hips'},
            'Spine1': {'position': [0.5, 0.5, 0.7], 'parent': 'Spine'},
            'Neck': {'position': [0.5, 0.55, 0.85], 'parent': 'Spine1'},
            'Head': {'position': [0.5, 0.6, 0.95], 'parent': 'Neck'},

            # Front Left Leg
            'FrontLeftLeg': {'position': [0.6, 0.5, 0.75], 'parent': 'Spine1'},
            'FrontLeftLeg1': {'position': [0.6, 0.3, 0.75], 'parent': 'FrontLeftLeg'},
            'FrontLeftFoot': {'position': [0.6, 0.1, 0.75], 'parent': 'FrontLeftLeg1'},

            # Front Right Leg
            'FrontRightLeg': {'position': [0.4, 0.5, 0.75], 'parent': 'Spine1'},
            'FrontRightLeg1': {'position': [0.4, 0.3, 0.75], 'parent': 'FrontRightLeg'},
            'FrontRightFoot': {'position': [0.4, 0.1, 0.75], 'parent': 'FrontRightLeg1'},

            # Back Left Leg
            'BackLeftLeg': {'position': [0.6, 0.45, 0.3], 'parent': 'Hips'},
            'BackLeftLeg1': {'position': [0.6, 0.25, 0.3], 'parent': 'BackLeftLeg'},
            'BackLeftFoot': {'position': [0.6, 0.1, 0.3], 'parent': 'BackLeftLeg1'},

            # Back Right Leg
            'BackRightLeg': {'position': [0.4, 0.45, 0.3], 'parent': 'Hips'},
            'BackRightLeg1': {'position': [0.4, 0.25, 0.3], 'parent': 'BackRightLeg'},
            'BackRightFoot': {'position': [0.4, 0.1, 0.3], 'parent': 'BackRightLeg1'},

            # Tail
            'Tail': {'position': [0.5, 0.45, 0.15], 'parent': 'Hips'},
            'Tail1': {'position': [0.5, 0.4, 0.05], 'parent': 'Tail'},
        }

        return {'bones': bones, 'root': 'Hips'}

    def _get_biped_skeleton(self):
        """Simple biped creature skeleton"""
        bones = {
            'Root': {'position': [0.5, 0.3, 0.5], 'parent': None},
            'Spine': {'position': [0.5, 0.6, 0.5], 'parent': 'Root'},
            'Head': {'position': [0.5, 0.9, 0.5], 'parent': 'Spine'},

            'LeftLeg': {'position': [0.55, 0.2, 0.5], 'parent': 'Root'},
            'LeftFoot': {'position': [0.55, 0.05, 0.5], 'parent': 'LeftLeg'},

            'RightLeg': {'position': [0.45, 0.2, 0.5], 'parent': 'Root'},
            'RightFoot': {'position': [0.45, 0.05, 0.5], 'parent': 'RightLeg'},
        }

        return {'bones': bones, 'root': 'Root'}

    def _fit_skeleton_to_mesh(self, mesh, skeleton_template):
        """
        Fit skeleton template to mesh bounds
        """
        try:
            # Get mesh bounding box
            bounds = mesh.bounds
            min_bound = bounds[0]
            max_bound = bounds[1]
            size = max_bound - min_bound

            # Create fitted skeleton
            fitted_skeleton = {'bones': {}, 'root': skeleton_template['root']}

            # Transform each bone position
            for bone_name, bone_data in skeleton_template['bones'].items():
                # Convert normalized position to world position
                norm_pos = np.array(bone_data['position'])
                world_pos = min_bound + norm_pos * size

                fitted_skeleton['bones'][bone_name] = {
                    'position': world_pos.tolist(),
                    'parent': bone_data['parent'],
                    'rotation': [0, 0, 0],  # Default rotation
                    'scale': [1, 1, 1]      # Default scale
                }

            return fitted_skeleton

        except Exception as e:
            logger.error(f"Error fitting skeleton: {str(e)}")
            raise

    def _generate_bone_weights(self, mesh, skeleton):
        """
        Generate automatic bone weights using distance-based algorithm
        """
        try:
            vertices = mesh.vertices
            num_vertices = len(vertices)
            num_bones = len(skeleton['bones'])

            # Get bone positions
            bone_positions = []
            bone_names = []

            for bone_name, bone_data in skeleton['bones'].items():
                bone_positions.append(bone_data['position'])
                bone_names.append(bone_name)

            bone_positions = np.array(bone_positions)

            # Calculate distances from vertices to bones
            distances = cdist(vertices, bone_positions)

            # Convert distances to weights (inverse distance)
            # Add small epsilon to avoid division by zero
            epsilon = 1e-6
            inv_distances = 1.0 / (distances + epsilon)

            # Normalize weights per vertex (sum to 1)
            weights = inv_distances / inv_distances.sum(axis=1, keepdims=True)

            # Keep only top 4 influences per vertex (standard for real-time rendering)
            max_influences = 4
            vertex_weights = []

            for i in range(num_vertices):
                vertex_weight = weights[i]

                # Get top influences
                top_indices = np.argsort(vertex_weight)[-max_influences:][::-1]
                top_weights = vertex_weight[top_indices]

                # Normalize
                top_weights = top_weights / top_weights.sum()

                # Store as list of (bone_name, weight)
                influences = [
                    {'bone': bone_names[idx], 'weight': float(top_weights[j])}
                    for j, idx in enumerate(top_indices)
                    if top_weights[j] > 0.01  # Skip very small influences
                ]

                vertex_weights.append(influences)

            logger.info(f"Generated weights for {num_vertices} vertices across {num_bones} bones")
            return vertex_weights

        except Exception as e:
            logger.error(f"Error generating bone weights: {str(e)}")
            raise

    def _export_rigged_model(self, mesh, rig_data, output_path):
        """
        Export rigged model with skeleton and weights
        """
        try:
            # For now, export the mesh with rig data as metadata
            # Full rigged export (FBX with armature) would require additional libraries

            # Store rig data in mesh metadata
            mesh.metadata['rig_data'] = rig_data

            # Export as GLB (supports skinning data)
            file_ext = os.path.splitext(output_path)[1].lower()

            if file_ext in ['.glb', '.gltf']:
                mesh.export(output_path, file_type='glb')
            else:
                mesh.export(output_path)

            # Also export rig data as separate JSON file
            import json
            rig_json_path = output_path.replace(file_ext, '_rig.json')

            # Convert numpy arrays to lists for JSON serialization
            rig_export = {
                'skeleton': {
                    'bones': {
                        name: {
                            'position': bone['position'],
                            'rotation': bone.get('rotation', [0, 0, 0]),
                            'scale': bone.get('scale', [1, 1, 1]),
                            'parent': bone['parent']
                        }
                        for name, bone in rig_data['skeleton']['bones'].items()
                    },
                    'root': rig_data['skeleton']['root']
                },
                'rig_type': rig_data['rig_type'],
                'bone_count': rig_data['bone_count']
            }

            with open(rig_json_path, 'w') as f:
                json.dump(rig_export, f, indent=2)

            logger.info(f"Exported rigged model and rig data to {output_path}")

        except Exception as e:
            logger.error(f"Error exporting rigged model: {str(e)}")
            raise

    def create_pose(self, rig_data, pose_name):
        """
        Create predefined poses (T-pose, A-pose, etc.)

        Args:
            rig_data: Rig data from auto_rig
            pose_name: Name of pose ('t_pose', 'a_pose', 'idle', etc.)

        Returns:
            Pose data with bone rotations
        """
        try:
            poses = {
                't_pose': self._get_t_pose(),
                'a_pose': self._get_a_pose(),
                'idle': self._get_idle_pose(),
                'wave': self._get_wave_pose(),
            }

            pose_data = poses.get(pose_name)
            if pose_data is None:
                return None

            # Apply pose to skeleton
            posed_skeleton = rig_data['skeleton'].copy()

            for bone_name, rotation in pose_data.items():
                if bone_name in posed_skeleton['bones']:
                    posed_skeleton['bones'][bone_name]['rotation'] = rotation

            return posed_skeleton

        except Exception as e:
            logger.error(f"Error creating pose: {str(e)}")
            return None

    def _get_t_pose(self):
        """T-pose bone rotations"""
        return {
            'LeftArm': [0, 0, -90],
            'LeftForeArm': [0, 0, 0],
            'RightArm': [0, 0, 90],
            'RightForeArm': [0, 0, 0],
        }

    def _get_a_pose(self):
        """A-pose bone rotations"""
        return {
            'LeftArm': [0, 0, -45],
            'LeftForeArm': [0, 0, 0],
            'RightArm': [0, 0, 45],
            'RightForeArm': [0, 0, 0],
        }

    def _get_idle_pose(self):
        """Relaxed idle pose"""
        return {
            'LeftArm': [0, 0, -15],
            'LeftForeArm': [0, 0, 20],
            'RightArm': [0, 0, 15],
            'RightForeArm': [0, 0, 20],
            'Spine': [0, 0, 2],
            'Head': [5, 0, 0],
        }

    def _get_wave_pose(self):
        """Waving pose (right hand up)"""
        return {
            'RightArm': [0, 0, 150],
            'RightForeArm': [0, 0, -30],
            'RightHand': [0, 0, 10],
        }
