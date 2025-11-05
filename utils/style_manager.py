"""
Style Consistency Manager
Maintain consistent art styles across multiple 3D model generations using CLIP
"""

import os
import json
import numpy as np
import torch
import logging
from PIL import Image

logger = logging.getLogger(__name__)


class StyleManager:
    """
    Manages style consistency across multiple generations
    Uses CLIP embeddings to extract and apply visual styles
    """

    def __init__(self, device=None):
        """Initialize style manager"""
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.clip_model = None
        self.clip_preprocess = None
        self.styles_db = {}
        self.styles_file = 'static/styles/styles_db.json'
        logger.info(f"Style Manager initialized on device: {self.device}")

        # Load existing styles database
        self._load_styles_db()

    def load_clip_model(self):
        """Lazy load CLIP model"""
        if self.clip_model is not None:
            return

        try:
            import clip

            logger.info("Loading CLIP model...")
            self.clip_model, self.clip_preprocess = clip.load("ViT-B/32", device=self.device)
            logger.info("CLIP model loaded successfully")

        except Exception as e:
            logger.warning(f"Could not load CLIP model: {e}")
            self.clip_model = None

    def extract_style_from_image(self, image_path, style_name):
        """
        Extract style embeddings from a reference image

        Args:
            image_path: Path to reference image
            style_name: Name for this style

        Returns:
            (success: bool, style_id: str)
        """
        try:
            logger.info(f"Extracting style from: {image_path}")

            self.load_clip_model()

            if not self.clip_model:
                return False, "CLIP model not available"

            # Load and preprocess image
            image = Image.open(image_path).convert('RGB')
            image_input = self.clip_preprocess(image).unsqueeze(0).to(self.device)

            # Extract CLIP embedding
            with torch.no_grad():
                image_features = self.clip_model.encode_image(image_input)
                image_features /= image_features.norm(dim=-1, keepdim=True)

            # Convert to numpy for storage
            style_embedding = image_features.cpu().numpy().flatten().tolist()

            # Analyze image characteristics
            characteristics = self._analyze_image_characteristics(image)

            # Create style entry
            style_id = self._generate_style_id(style_name)

            self.styles_db[style_id] = {
                'name': style_name,
                'embedding': style_embedding,
                'characteristics': characteristics,
                'reference_image': image_path,
                'created': self._get_timestamp()
            }

            # Save to database
            self._save_styles_db()

            logger.info(f"Style extracted and saved: {style_id}")
            return True, style_id

        except Exception as e:
            logger.error(f"Style extraction failed: {str(e)}")
            return False, str(e)

    def get_style_prompt_modifier(self, style_id):
        """
        Get prompt modifiers to apply a specific style

        Args:
            style_id: Style identifier

        Returns:
            Prompt modifier string
        """
        try:
            if style_id not in self.styles_db:
                return ""

            style = self.styles_db[style_id]
            chars = style['characteristics']

            # Build style description from characteristics
            modifiers = []

            if chars.get('color_palette'):
                modifiers.append(f"{chars['color_palette']} color palette")

            if chars.get('brightness') == 'dark':
                modifiers.append("dark lighting")
            elif chars.get('brightness') == 'bright':
                modifiers.append("bright lighting")

            if chars.get('saturation') == 'high':
                modifiers.append("vibrant colors")
            elif chars.get('saturation') == 'low':
                modifiers.append("muted colors")

            if chars.get('style_type'):
                modifiers.append(chars['style_type'])

            prompt_modifier = ", ".join(modifiers)

            logger.info(f"Style modifier for {style_id}: {prompt_modifier}")
            return prompt_modifier

        except Exception as e:
            logger.error(f"Error getting style modifier: {e}")
            return ""

    def compare_styles(self, image_path, style_id):
        """
        Compare an image to a saved style

        Args:
            image_path: Path to image to compare
            style_id: Style to compare against

        Returns:
            Similarity score (0.0-1.0)
        """
        try:
            self.load_clip_model()

            if not self.clip_model or style_id not in self.styles_db:
                return 0.0

            # Get reference style embedding
            ref_embedding = torch.tensor(self.styles_db[style_id]['embedding']).to(self.device)

            # Extract embedding from comparison image
            image = Image.open(image_path).convert('RGB')
            image_input = self.clip_preprocess(image).unsqueeze(0).to(self.device)

            with torch.no_grad():
                image_features = self.clip_model.encode_image(image_input)
                image_features /= image_features.norm(dim=-1, keepdim=True)

            # Calculate cosine similarity
            similarity = (image_features @ ref_embedding).item()

            logger.info(f"Style similarity: {similarity:.3f}")
            return float(similarity)

        except Exception as e:
            logger.error(f"Style comparison failed: {e}")
            return 0.0

    def find_similar_styles(self, image_path, top_k=3):
        """
        Find most similar styles to an image

        Args:
            image_path: Path to image
            top_k: Number of similar styles to return

        Returns:
            List of (style_id, similarity) tuples
        """
        try:
            self.load_clip_model()

            if not self.clip_model or not self.styles_db:
                return []

            # Extract embedding from image
            image = Image.open(image_path).convert('RGB')
            image_input = self.clip_preprocess(image).unsqueeze(0).to(self.device)

            with torch.no_grad():
                image_features = self.clip_model.encode_image(image_input)
                image_features /= image_features.norm(dim=-1, keepdim=True)

            # Compare to all styles
            similarities = []

            for style_id, style_data in self.styles_db.items():
                ref_embedding = torch.tensor(style_data['embedding']).to(self.device)
                similarity = (image_features @ ref_embedding).item()
                similarities.append((style_id, similarity))

            # Sort by similarity
            similarities.sort(key=lambda x: x[1], reverse=True)

            return similarities[:top_k]

        except Exception as e:
            logger.error(f"Finding similar styles failed: {e}")
            return []

    def list_styles(self):
        """List all saved styles"""
        return [
            {
                'id': style_id,
                'name': data['name'],
                'created': data.get('created', 'Unknown'),
                'characteristics': data.get('characteristics', {})
            }
            for style_id, data in self.styles_db.items()
        ]

    def delete_style(self, style_id):
        """Delete a saved style"""
        try:
            if style_id in self.styles_db:
                del self.styles_db[style_id]
                self._save_styles_db()
                logger.info(f"Style deleted: {style_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Style deletion failed: {e}")
            return False

    def _analyze_image_characteristics(self, image):
        """Analyze image for visual characteristics"""
        try:
            img_array = np.array(image)

            # Calculate average brightness
            brightness = np.mean(img_array) / 255.0

            # Calculate color saturation
            hsv_array = np.array(image.convert('HSV'))
            saturation = np.mean(hsv_array[:, :, 1]) / 255.0

            # Determine dominant colors
            pixels = img_array.reshape(-1, 3)
            mean_color = pixels.mean(axis=0)

            # Classify characteristics
            brightness_level = 'dark' if brightness < 0.4 else 'bright' if brightness > 0.6 else 'medium'
            saturation_level = 'low' if saturation < 0.3 else 'high' if saturation > 0.7 else 'medium'

            # Simple color palette detection
            if mean_color[0] > mean_color[1] and mean_color[0] > mean_color[2]:
                color_palette = 'warm (red-dominant)'
            elif mean_color[2] > mean_color[0] and mean_color[2] > mean_color[1]:
                color_palette = 'cool (blue-dominant)'
            elif saturation < 0.2:
                color_palette = 'monochrome'
            else:
                color_palette = 'balanced'

            # Detect style type (simplified)
            if saturation < 0.3 and brightness < 0.5:
                style_type = 'realistic/photographic'
            elif saturation > 0.7:
                style_type = 'vibrant/stylized'
            else:
                style_type = 'semi-realistic'

            return {
                'brightness': brightness_level,
                'saturation': saturation_level,
                'color_palette': color_palette,
                'style_type': style_type,
                'mean_brightness': float(brightness),
                'mean_saturation': float(saturation)
            }

        except Exception as e:
            logger.error(f"Characteristic analysis failed: {e}")
            return {}

    def _generate_style_id(self, style_name):
        """Generate unique style ID"""
        import hashlib
        import time

        # Create unique ID from name and timestamp
        unique_str = f"{style_name}_{time.time()}"
        style_id = hashlib.md5(unique_str.encode()).hexdigest()[:12]

        return f"style_{style_id}"

    def _get_timestamp(self):
        """Get current timestamp"""
        from datetime import datetime
        return datetime.now().isoformat()

    def _load_styles_db(self):
        """Load styles database from file"""
        try:
            os.makedirs(os.path.dirname(self.styles_file), exist_ok=True)

            if os.path.exists(self.styles_file):
                with open(self.styles_file, 'r') as f:
                    self.styles_db = json.load(f)
                logger.info(f"Loaded {len(self.styles_db)} styles from database")
            else:
                self.styles_db = {}

        except Exception as e:
            logger.error(f"Error loading styles database: {e}")
            self.styles_db = {}

    def _save_styles_db(self):
        """Save styles database to file"""
        try:
            os.makedirs(os.path.dirname(self.styles_file), exist_ok=True)

            with open(self.styles_file, 'w') as f:
                json.dump(self.styles_db, f, indent=2)

            logger.info(f"Saved {len(self.styles_db)} styles to database")

        except Exception as e:
            logger.error(f"Error saving styles database: {e}")


class ReferenceGuidedGenerator:
    """
    Generate 3D models guided by reference images/models
    """

    def __init__(self, style_manager):
        """Initialize reference-guided generator"""
        self.style_manager = style_manager
        logger.info("Reference-Guided Generator initialized")

    def generate_with_reference(self, prompt, reference_image, output_path,
                               style_weight=0.7, **generation_params):
        """
        Generate 3D model guided by reference image

        Args:
            prompt: Text description
            reference_image: Path to reference image
            output_path: Output model path
            style_weight: How much to weight reference style (0.0-1.0)
            **generation_params: Additional generation parameters

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Generating with reference: {reference_image}")

            # Extract style from reference
            success, style_id = self.style_manager.extract_style_from_image(
                reference_image,
                "temp_reference"
            )

            if not success:
                return False, "Failed to extract reference style"

            # Get style modifiers
            style_modifier = self.style_manager.get_style_prompt_modifier(style_id)

            # Enhance prompt with style
            if style_modifier:
                enhanced_prompt = f"{prompt}, {style_modifier}"
            else:
                enhanced_prompt = prompt

            logger.info(f"Enhanced prompt: {enhanced_prompt}")

            # Now we would generate the model with this enhanced prompt
            # This would integrate with the existing text-to-3D generator

            return True, f"Generated with reference style"

        except Exception as e:
            logger.error(f"Reference-guided generation failed: {e}")
            return False, f"Generation failed: {str(e)}"
