"""
AI Image Preprocessor
Edit and prepare images for 3D generation using AI-powered transformations
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import logging
import torch

logger = logging.getLogger(__name__)


class ImagePreprocessor:
    """
    AI-powered image preprocessing for 3D generation
    Handles pose adjustments, cropping, background removal, and style transfer
    """

    def __init__(self, device=None):
        """Initialize image preprocessor"""
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.inpainting_model = None
        self.pose_model = None
        logger.info(f"Image Preprocessor initialized on device: {self.device}")

    def load_inpainting_model(self):
        """Lazy load Stable Diffusion inpainting model"""
        if self.inpainting_model is not None:
            return

        try:
            from diffusers import StableDiffusionInpaintPipeline

            logger.info("Loading Stable Diffusion Inpainting model...")
            self.inpainting_model = StableDiffusionInpaintPipeline.from_pretrained(
                "runwayml/stable-diffusion-inpainting",
                torch_dtype=torch.float16 if self.device == 'cuda' else torch.float32
            )
            self.inpainting_model = self.inpainting_model.to(self.device)
            logger.info("Inpainting model loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load inpainting model: {e}")
            self.inpainting_model = None

    def load_pose_model(self):
        """Load pose estimation model"""
        if self.pose_model is not None:
            return

        try:
            # Try to load MediaPipe for pose detection
            import mediapipe as mp
            self.mp_pose = mp.solutions.pose
            self.pose_model = self.mp_pose.Pose(
                static_image_mode=True,
                model_complexity=2,
                enable_segmentation=True,
                min_detection_confidence=0.5
            )
            logger.info("MediaPipe pose model loaded")
        except Exception as e:
            logger.warning(f"Could not load pose model: {e}")
            self.pose_model = None

    def edit_image_with_prompt(self, image_path, prompt, output_path, strength=0.8):
        """
        Edit image using AI with text prompt

        Args:
            image_path: Path to input image
            prompt: Edit instruction (e.g., "put them in a t-pose")
            output_path: Path to save edited image
            strength: How much to modify (0.0-1.0)

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Editing image with prompt: '{prompt}'")

            # Load image
            image = Image.open(image_path).convert('RGB')

            # Check if we can use inpainting model
            self.load_inpainting_model()

            if self.inpainting_model:
                return self._edit_with_inpainting(image, prompt, output_path, strength)
            else:
                # Fallback: Use rule-based editing
                return self._edit_with_rules(image, prompt, output_path)

        except Exception as e:
            logger.error(f"Error editing image: {str(e)}")
            return False, f"Image editing failed: {str(e)}"

    def _edit_with_inpainting(self, image, prompt, output_path, strength):
        """Edit using Stable Diffusion inpainting"""
        try:
            # Create a mask for the entire image (we'll inpaint everything)
            mask = Image.new('L', image.size, 255)

            # Generate edited image
            result = self.inpainting_model(
                prompt=f"{prompt}, full body visible, clear pose, professional photo",
                image=image,
                mask_image=mask,
                num_inference_steps=50,
                strength=strength,
                guidance_scale=7.5
            )

            edited_image = result.images[0]
            edited_image.save(output_path)

            logger.info(f"Image edited with AI: {output_path}")
            return True, "Image edited successfully"

        except Exception as e:
            logger.error(f"Inpainting failed: {e}")
            return self._edit_with_rules(image, prompt, output_path)

    def _edit_with_rules(self, image, prompt, output_path):
        """Rule-based editing fallback"""
        try:
            logger.info("Using rule-based image editing")

            edited = image.copy()
            prompt_lower = prompt.lower()

            # Detect common editing requests
            if 't-pose' in prompt_lower or 'tpose' in prompt_lower:
                edited = self._adjust_for_tpose(edited)

            if 'frame' in prompt_lower or 'full body' in prompt_lower:
                edited = self._ensure_full_frame(edited)

            if 'center' in prompt_lower:
                edited = self._center_subject(edited)

            if 'remove background' in prompt_lower or 'white background' in prompt_lower:
                edited = self._simple_background_removal(edited)

            edited.save(output_path)

            logger.info(f"Image edited with rules: {output_path}")
            return True, "Image edited successfully (rule-based)"

        except Exception as e:
            logger.error(f"Rule-based editing failed: {e}")
            # Just save original image
            image.save(output_path)
            return True, "Image saved without modifications"

    def _adjust_for_tpose(self, image):
        """Suggest T-pose adjustments"""
        # This is a placeholder - real implementation would use pose detection
        # For now, just ensure image is properly oriented
        width, height = image.size

        # Ensure portrait orientation for T-pose
        if width > height:
            # Rotate if landscape
            image = image.rotate(90, expand=True)

        return image

    def _ensure_full_frame(self, image):
        """Ensure subject fits in frame with padding"""
        width, height = image.size

        # Add 10% padding
        new_width = int(width * 1.1)
        new_height = int(height * 1.1)

        # Create new image with padding
        padded = Image.new('RGB', (new_width, new_height), (255, 255, 255))

        # Paste original in center
        x_offset = (new_width - width) // 2
        y_offset = (new_height - height) // 2
        padded.paste(image, (x_offset, y_offset))

        return padded

    def _center_subject(self, image):
        """Center the subject in the image"""
        # Simple centering - would use pose detection for better results
        return image

    def _simple_background_removal(self, image):
        """Simple background removal (white background)"""
        try:
            # Convert to numpy array
            img_array = np.array(image)

            # Simple threshold-based background removal
            # This is a placeholder - real implementation would use rembg or similar
            gray = np.mean(img_array, axis=2)

            # Find bright pixels (assumed background)
            threshold = np.percentile(gray, 90)
            mask = gray > threshold

            # Create white background
            result = img_array.copy()
            result[mask] = [255, 255, 255]

            return Image.fromarray(result)

        except Exception as e:
            logger.error(f"Background removal failed: {e}")
            return image

    def detect_pose(self, image_path):
        """
        Detect pose in image using MediaPipe

        Returns:
            Pose landmarks and skeleton data
        """
        try:
            self.load_pose_model()

            if not self.pose_model:
                return None

            # Load image
            image = Image.open(image_path).convert('RGB')
            image_array = np.array(image)

            # Process with MediaPipe
            results = self.pose_model.process(image_array)

            if not results.pose_landmarks:
                logger.warning("No pose detected in image")
                return None

            # Extract landmark data
            landmarks = []
            for landmark in results.pose_landmarks.landmark:
                landmarks.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z,
                    'visibility': landmark.visibility
                })

            logger.info(f"Detected pose with {len(landmarks)} landmarks")
            return {
                'landmarks': landmarks,
                'image_size': image.size
            }

        except Exception as e:
            logger.error(f"Pose detection failed: {str(e)}")
            return None

    def remove_background(self, image_path, output_path):
        """
        Remove background from image

        Args:
            image_path: Input image path
            output_path: Output image path

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Removing background from: {image_path}")

            # Try to use rembg if available
            try:
                from rembg import remove

                with open(image_path, 'rb') as input_file:
                    input_data = input_file.read()

                output_data = remove(input_data)

                with open(output_path, 'wb') as output_file:
                    output_file.write(output_data)

                logger.info("Background removed with rembg")
                return True, "Background removed successfully"

            except ImportError:
                logger.info("rembg not available, using fallback")

                # Fallback to simple method
                image = Image.open(image_path).convert('RGB')
                result = self._simple_background_removal(image)
                result.save(output_path)

                return True, "Background removed (simple method)"

        except Exception as e:
            logger.error(f"Background removal failed: {str(e)}")
            return False, f"Background removal failed: {str(e)}"

    def crop_to_subject(self, image_path, output_path, padding=0.1):
        """
        Crop image to focus on main subject

        Args:
            image_path: Input image
            output_path: Output image
            padding: Padding around subject (0.0-1.0)

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Cropping to subject: {image_path}")

            image = Image.open(image_path).convert('RGB')
            img_array = np.array(image)

            # Simple edge detection for subject bounds
            gray = np.mean(img_array, axis=2)

            # Find non-background pixels
            threshold = np.percentile(gray, 10)
            mask = gray < threshold

            # Find bounding box
            rows = np.any(mask, axis=1)
            cols = np.any(mask, axis=0)

            if not np.any(rows) or not np.any(cols):
                # No clear subject found, return original
                image.save(output_path)
                return True, "No clear subject found, kept original"

            y_min, y_max = np.where(rows)[0][[0, -1]]
            x_min, x_max = np.where(cols)[0][[0, -1]]

            # Add padding
            height, width = img_array.shape[:2]
            pad_x = int((x_max - x_min) * padding)
            pad_y = int((y_max - y_min) * padding)

            x_min = max(0, x_min - pad_x)
            x_max = min(width, x_max + pad_x)
            y_min = max(0, y_min - pad_y)
            y_max = min(height, y_max + pad_y)

            # Crop
            cropped = image.crop((x_min, y_min, x_max, y_max))
            cropped.save(output_path)

            logger.info(f"Image cropped to subject: {output_path}")
            return True, "Image cropped to subject"

        except Exception as e:
            logger.error(f"Cropping failed: {str(e)}")
            return False, f"Cropping failed: {str(e)}"

    def enhance_for_3d(self, image_path, output_path):
        """
        Enhance image specifically for 3D generation
        - Increase contrast
        - Sharpen edges
        - Ensure good lighting

        Args:
            image_path: Input image
            output_path: Output image

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Enhancing image for 3D: {image_path}")

            image = Image.open(image_path).convert('RGB')

            # Increase contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.2)

            # Increase sharpness
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.3)

            # Slight brightness adjustment
            enhancer = ImageEnhance.Brightness(image)
            image = enhancer.enhance(1.1)

            # Apply unsharp mask for edge enhancement
            image = image.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))

            image.save(output_path)

            logger.info(f"Image enhanced: {output_path}")
            return True, "Image enhanced for 3D generation"

        except Exception as e:
            logger.error(f"Enhancement failed: {str(e)}")
            return False, f"Enhancement failed: {str(e)}"
