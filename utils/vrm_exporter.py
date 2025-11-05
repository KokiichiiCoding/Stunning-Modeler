"""
VRM Export System for VTuber Avatars
Handles VRM 0.0 and VRM 1.0 format export with blendshapes and metadata
"""

import os
import json
import numpy as np
import trimesh
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class VRMExporter:
    """
    VRM format exporter for VTuber avatars
    Supports VRM 0.0 and VRM 1.0 specifications
    """

    def __init__(self):
        """Initialize VRM exporter"""
        logger.info("VRM Exporter initialized")

        # VRM standard blend shapes
        self.vrm_blend_shapes = [
            'neutral', 'a', 'i', 'u', 'e', 'o',
            'blink', 'blink_l', 'blink_r',
            'joy', 'angry', 'sorrow', 'fun',
            'lookup', 'lookdown', 'lookleft', 'lookright'
        ]

        # ARKit blend shapes (52 shapes for iPhone tracking)
        self.arkit_blend_shapes = [
            'eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft',
            'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft',
            'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight',
            'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
            'jawForward', 'jawLeft', 'jawRight', 'jawOpen',
            'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
            'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
            'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight',
            'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
            'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
            'mouthUpperUpLeft', 'mouthUpperUpRight',
            'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
            'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
            'noseSneerLeft', 'noseSneerRight',
            'tongueOut'
        ]

    def export_vrm(self, model_path, output_path, metadata=None, vrm_version='1.0',
                   include_blendshapes=True, rig_data=None):
        """
        Export model as VRM format

        Args:
            model_path: Path to input model
            output_path: Path to save VRM file
            metadata: VRM metadata (author, title, etc.)
            vrm_version: '0.0' or '1.0'
            include_blendshapes: Generate automatic blendshapes
            rig_data: Optional rig data from auto-rigger

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Exporting VRM {vrm_version}: {model_path}")

            # Load model
            mesh = trimesh.load(model_path, force='mesh')
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)

            # Prepare VRM metadata
            vrm_meta = self._prepare_vrm_metadata(metadata or {}, vrm_version)

            # Generate or validate blendshapes
            blendshapes = {}
            if include_blendshapes:
                blendshapes = self._generate_basic_blendshapes(mesh)

            # Create VRM extension data
            vrm_extension = self._create_vrm_extension(
                mesh, vrm_meta, blendshapes, rig_data, vrm_version
            )

            # Export as GLB with VRM extension
            self._export_with_vrm_extension(mesh, vrm_extension, output_path)

            logger.info(f"VRM export successful: {output_path}")
            return True, f"VRM {vrm_version} exported successfully"

        except Exception as e:
            logger.error(f"Error exporting VRM: {str(e)}")
            return False, f"VRM export failed: {str(e)}"

    def _prepare_vrm_metadata(self, metadata, version):
        """Prepare VRM metadata with defaults"""

        default_meta = {
            'title': metadata.get('title', 'Generated Avatar'),
            'author': metadata.get('author', 'Stunning Modeler'),
            'version': metadata.get('version', '1.0'),
            'contactInformation': metadata.get('contact', ''),
            'reference': metadata.get('reference', ''),
            'allowedUserName': metadata.get('allowed_user', 'Everyone'),
            'violentUssageName': metadata.get('violent_usage', 'Disallow'),
            'sexualUssageName': metadata.get('sexual_usage', 'Disallow'),
            'commercialUssageName': metadata.get('commercial_usage', 'Allow'),
            'otherPermissionUrl': metadata.get('permission_url', ''),
            'licenseName': metadata.get('license', 'CC0'),
            'otherLicenseUrl': metadata.get('license_url', ''),
        }

        if version == '1.0':
            # VRM 1.0 has different metadata structure
            default_meta.update({
                'avatarPermission': metadata.get('avatar_permission', 'onlyAuthor'),
                'allowExcessivelyViolentUsage': False,
                'allowExcessivelySexualUsage': False,
                'commercialUsage': metadata.get('commercial', 'personalNonProfit'),
                'allowPoliticalOrReligiousUsage': False,
                'creditNotation': metadata.get('credit', 'required'),
                'allowRedistribution': False,
                'modification': metadata.get('modification', 'allowModification')
            })

        return default_meta

    def _generate_basic_blendshapes(self, mesh):
        """
        Generate basic blend shapes for facial animation
        These are simplified versions - in production you'd use more sophisticated methods
        """
        try:
            blendshapes = {}
            vertices = mesh.vertices.copy()
            num_verts = len(vertices)

            # Find approximate face region (upper part of model)
            bounds = mesh.bounds
            height = bounds[1][1] - bounds[0][1]
            face_threshold = bounds[0][1] + height * 0.7  # Top 30% is "face"

            face_indices = np.where(vertices[:, 1] > face_threshold)[0]

            if len(face_indices) == 0:
                logger.warning("Could not identify face region for blendshapes")
                return {}

            # Generate basic VRM blendshapes
            # These are simplified demonstrations - real blendshapes need proper modeling

            # Neutral (no change)
            blendshapes['neutral'] = np.zeros((num_verts, 3))

            # A, I, U, E, O (mouth shapes)
            blendshapes['a'] = self._generate_mouth_shape(vertices, face_indices, 'open')
            blendshapes['i'] = self._generate_mouth_shape(vertices, face_indices, 'wide')
            blendshapes['u'] = self._generate_mouth_shape(vertices, face_indices, 'pucker')
            blendshapes['e'] = self._generate_mouth_shape(vertices, face_indices, 'smile')
            blendshapes['o'] = self._generate_mouth_shape(vertices, face_indices, 'round')

            # Blink
            blendshapes['blink'] = self._generate_blink_shape(vertices, face_indices)
            blendshapes['blink_l'] = self._generate_blink_shape(vertices, face_indices, 'left')
            blendshapes['blink_r'] = self._generate_blink_shape(vertices, face_indices, 'right')

            # Emotions
            blendshapes['joy'] = self._generate_emotion_shape(vertices, face_indices, 'happy')
            blendshapes['angry'] = self._generate_emotion_shape(vertices, face_indices, 'angry')
            blendshapes['sorrow'] = self._generate_emotion_shape(vertices, face_indices, 'sad')
            blendshapes['fun'] = self._generate_emotion_shape(vertices, face_indices, 'playful')

            # Look directions (eye movement approximation)
            blendshapes['lookup'] = self._generate_look_shape(vertices, face_indices, 'up')
            blendshapes['lookdown'] = self._generate_look_shape(vertices, face_indices, 'down')
            blendshapes['lookleft'] = self._generate_look_shape(vertices, face_indices, 'left')
            blendshapes['lookright'] = self._generate_look_shape(vertices, face_indices, 'right')

            logger.info(f"Generated {len(blendshapes)} basic blendshapes")
            return blendshapes

        except Exception as e:
            logger.error(f"Error generating blendshapes: {str(e)}")
            return {}

    def _generate_mouth_shape(self, vertices, face_indices, shape_type):
        """Generate mouth shape deformation"""
        deltas = np.zeros_like(vertices)

        # Simple mouth region (center bottom of face)
        center = vertices[face_indices].mean(axis=0)
        mouth_region = face_indices[
            np.where(
                (vertices[face_indices, 1] < center[1]) &
                (np.abs(vertices[face_indices, 0] - center[0]) < 0.1)
            )[0]
        ]

        if len(mouth_region) > 0:
            if shape_type == 'open':
                deltas[mouth_region, 1] -= 0.02  # Move down
            elif shape_type == 'wide':
                deltas[mouth_region, 0] *= 1.1  # Spread horizontally
            elif shape_type == 'pucker':
                deltas[mouth_region, 0] *= 0.9  # Compress horizontally
                deltas[mouth_region, 2] += 0.01  # Forward
            elif shape_type == 'smile':
                deltas[mouth_region, 0] *= 1.05
                deltas[mouth_region, 1] += 0.01
            elif shape_type == 'round':
                deltas[mouth_region, 2] += 0.01

        return deltas

    def _generate_blink_shape(self, vertices, face_indices, side='both'):
        """Generate blink shape deformation"""
        deltas = np.zeros_like(vertices)

        center = vertices[face_indices].mean(axis=0)

        # Find eye region (upper middle face)
        eye_region = face_indices[
            np.where(
                (vertices[face_indices, 1] > center[1] * 1.05) &
                (vertices[face_indices, 1] < center[1] * 1.15)
            )[0]
        ]

        if len(eye_region) > 0:
            if side == 'both' or side == 'left':
                left_eye = eye_region[vertices[eye_region, 0] > center[0]]
                deltas[left_eye, 1] -= 0.01  # Close left eye

            if side == 'both' or side == 'right':
                right_eye = eye_region[vertices[eye_region, 0] < center[0]]
                deltas[right_eye, 1] -= 0.01  # Close right eye

        return deltas

    def _generate_emotion_shape(self, vertices, face_indices, emotion):
        """Generate emotion shape deformation"""
        deltas = np.zeros_like(vertices)

        # Simple emotion approximations
        if emotion == 'happy':
            return self._generate_mouth_shape(vertices, face_indices, 'smile')
        elif emotion == 'angry':
            # Slight downward mouth
            return self._generate_mouth_shape(vertices, face_indices, 'open') * -0.5
        elif emotion == 'sad':
            return self._generate_mouth_shape(vertices, face_indices, 'open') * -0.3
        elif emotion == 'playful':
            return self._generate_mouth_shape(vertices, face_indices, 'smile') * 0.8

        return deltas

    def _generate_look_shape(self, vertices, face_indices, direction):
        """Generate eye look direction shape"""
        deltas = np.zeros_like(vertices)

        # This is a simplified version - real eye tracking would need proper eye modeling
        center = vertices[face_indices].mean(axis=0)
        eye_region = face_indices[
            np.where(
                (vertices[face_indices, 1] > center[1] * 1.05) &
                (vertices[face_indices, 1] < center[1] * 1.15)
            )[0]
        ]

        if len(eye_region) > 0:
            movement = 0.005  # Small movement

            if direction == 'up':
                deltas[eye_region, 1] += movement
            elif direction == 'down':
                deltas[eye_region, 1] -= movement
            elif direction == 'left':
                deltas[eye_region, 0] += movement
            elif direction == 'right':
                deltas[eye_region, 0] -= movement

        return deltas

    def _create_vrm_extension(self, mesh, metadata, blendshapes, rig_data, version):
        """Create VRM extension data for GLTF"""

        vrm_ext = {
            'exporterVersion': f'Stunning Modeler VRM Exporter {version}',
            'specVersion': version,
            'meta': metadata,
        }

        # Add blend shapes
        if blendshapes:
            vrm_ext['blendShapeMaster'] = {
                'blendShapeGroups': [
                    {
                        'name': name,
                        'presetName': name,
                        'binds': [{'mesh': 0, 'index': i, 'weight': 100}],
                        'materialValues': []
                    }
                    for i, name in enumerate(blendshapes.keys())
                ]
            }

        # Add humanoid rig if available
        if rig_data:
            vrm_ext['humanoid'] = self._create_humanoid_data(rig_data)

        # Add first person settings
        vrm_ext['firstPerson'] = {
            'firstPersonBone': 'Head',
            'firstPersonBoneOffset': {'x': 0, 'y': 0.06, 'z': 0},
            'meshAnnotations': [],
            'lookAtTypeName': 'Bone',
            'lookAtHorizontalInner': {'curve': [0, 0, 0, 1, 1, 1, 1, 0], 'xRange': 90, 'yRange': 10},
            'lookAtHorizontalOuter': {'curve': [0, 0, 0, 1, 1, 1, 1, 0], 'xRange': 90, 'yRange': 10},
            'lookAtVerticalDown': {'curve': [0, 0, 0, 1, 1, 1, 1, 0], 'xRange': 90, 'yRange': 10},
            'lookAtVerticalUp': {'curve': [0, 0, 0, 1, 1, 1, 1, 0], 'xRange': 90, 'yRange': 10}
        }

        return vrm_ext

    def _create_humanoid_data(self, rig_data):
        """Create humanoid bone mapping for VRM"""

        # Map bone names to VRM humanoid bone names
        bone_mapping = {
            'Hips': 'hips',
            'Spine': 'spine',
            'Spine1': 'chest',
            'Spine2': 'upperChest',
            'Neck': 'neck',
            'Head': 'head',
            'LeftShoulder': 'leftShoulder',
            'LeftArm': 'leftUpperArm',
            'LeftForeArm': 'leftLowerArm',
            'LeftHand': 'leftHand',
            'RightShoulder': 'rightShoulder',
            'RightArm': 'rightUpperArm',
            'RightForeArm': 'rightLowerArm',
            'RightHand': 'rightHand',
            'LeftUpLeg': 'leftUpperLeg',
            'LeftLeg': 'leftLowerLeg',
            'LeftFoot': 'leftFoot',
            'LeftToeBase': 'leftToes',
            'RightUpLeg': 'rightUpperLeg',
            'RightLeg': 'rightLowerLeg',
            'RightFoot': 'rightFoot',
            'RightToeBase': 'rightToes',
        }

        humanoid_bones = []
        for bone_name, vrm_bone in bone_mapping.items():
            if bone_name in rig_data['skeleton']['bones']:
                humanoid_bones.append({
                    'bone': vrm_bone,
                    'node': bone_name,
                    'useDefaultValues': True
                })

        return {
            'humanBones': humanoid_bones,
            'armStretch': 0.05,
            'legStretch': 0.05,
            'upperArmTwist': 0.5,
            'lowerArmTwist': 0.5,
            'upperLegTwist': 0.5,
            'lowerLegTwist': 0.5,
            'feetSpacing': 0,
            'hasTranslationDoF': False
        }

    def _export_with_vrm_extension(self, mesh, vrm_extension, output_path):
        """Export GLB with VRM extension"""

        try:
            # Add VRM extension to mesh metadata
            if not hasattr(mesh, 'metadata'):
                mesh.metadata = {}

            mesh.metadata['VRM'] = vrm_extension

            # Export as GLB
            mesh.export(output_path, file_type='glb')

            # Also save VRM extension as separate JSON for reference
            vrm_json_path = output_path.replace('.vrm', '_vrm_data.json')
            with open(vrm_json_path, 'w') as f:
                json.dump(vrm_extension, f, indent=2)

            logger.info(f"VRM file exported: {output_path}")

        except Exception as e:
            logger.error(f"Error exporting VRM file: {str(e)}")
            raise

    def validate_vrm(self, vrm_path):
        """
        Validate VRM file for common issues

        Returns:
            (valid: bool, issues: list)
        """
        try:
            issues = []

            # Load and check basic structure
            mesh = trimesh.load(vrm_path)

            # Check for required VRM metadata
            if not hasattr(mesh, 'metadata') or 'VRM' not in mesh.metadata:
                issues.append("Missing VRM extension data")

            # Check poly count (for streaming performance)
            if isinstance(mesh, trimesh.Trimesh):
                poly_count = len(mesh.faces)
                if poly_count > 70000:
                    issues.append(f"High poly count ({poly_count}) - recommended < 70k for VTuber use")
                elif poly_count > 32000:
                    issues.append(f"Moderate poly count ({poly_count}) - may affect performance")

            # Check texture size
            # (would need to inspect actual texture files in GLB)

            valid = len(issues) == 0
            return valid, issues

        except Exception as e:
            return False, [f"Validation error: {str(e)}"]
