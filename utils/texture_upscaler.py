"""
Texture Upscaling and Enhancement
AI-powered texture quality improvement using Real-ESRGAN
"""

import os
import numpy as np
from PIL import Image
import logging
import torch

logger = logging.getLogger(__name__)


class TextureUpscaler:
    """
    AI-powered texture upscaling and enhancement
    """

    def __init__(self, device=None):
        """Initialize texture upscaler"""
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.upscaler_model = None
        logger.info(f"Texture Upscaler initialized on device: {self.device}")

    def load_upscaler_model(self):
        """Lazy load Real-ESRGAN model"""
        if self.upscaler_model is not None:
            return

        try:
            # Try to load Real-ESRGAN
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer

            logger.info("Loading Real-ESRGAN model...")

            # Use RealESRGAN_x4plus model
            model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)

            self.upscaler_model = RealESRGANer(
                scale=4,
                model_path='https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth',
                model=model,
                tile=0,
                tile_pad=10,
                pre_pad=0,
                half=True if self.device == 'cuda' else False,
                device=self.device
            )

            logger.info("Real-ESRGAN model loaded successfully")

        except Exception as e:
            logger.warning(f"Could not load Real-ESRGAN: {e}")
            logger.info("Will use fallback upscaling methods")
            self.upscaler_model = None

    def upscale_texture(self, texture_path, output_path, scale=4, enhance=True):
        """
        Upscale texture using AI

        Args:
            texture_path: Input texture path
            output_path: Output texture path
            scale: Upscale factor (2, 4, or 8)
            enhance: Apply enhancement filters

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Upscaling texture: {texture_path} (scale={scale}x)")

            # Load texture
            texture = Image.open(texture_path).convert('RGB')
            original_size = texture.size

            # Try AI upscaling first
            self.load_upscaler_model()

            if self.upscaler_model:
                result = self._upscale_with_realesrgan(texture, scale)
            else:
                # Fallback to traditional upscaling
                result = self._upscale_fallback(texture, scale, enhance)

            # Save result
            result.save(output_path, quality=95)

            new_size = result.size
            logger.info(f"Texture upscaled from {original_size} to {new_size}")

            return True, f"Texture upscaled {scale}x successfully"

        except Exception as e:
            logger.error(f"Texture upscaling failed: {str(e)}")
            return False, f"Upscaling failed: {str(e)}"

    def _upscale_with_realesrgan(self, image, scale):
        """Upscale using Real-ESRGAN"""
        try:
            # Convert PIL to numpy
            img_array = np.array(image)

            # Upscale
            output, _ = self.upscaler_model.enhance(img_array, outscale=scale)

            # Convert back to PIL
            result = Image.fromarray(output)

            logger.info("Upscaled with Real-ESRGAN")
            return result

        except Exception as e:
            logger.error(f"Real-ESRGAN upscaling failed: {e}")
            return self._upscale_fallback(image, scale, True)

    def _upscale_fallback(self, image, scale, enhance):
        """Fallback upscaling using PIL"""
        try:
            width, height = image.size
            new_size = (width * scale, height * scale)

            # Use LANCZOS for high-quality resampling
            upscaled = image.resize(new_size, Image.Resampling.LANCZOS)

            if enhance:
                # Apply sharpening
                from PIL import ImageFilter, ImageEnhance

                # Sharpen
                upscaled = upscaled.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))

                # Enhance contrast slightly
                enhancer = ImageEnhance.Contrast(upscaled)
                upscaled = enhancer.enhance(1.1)

                # Enhance color
                enhancer = ImageEnhance.Color(upscaled)
                upscaled = enhancer.enhance(1.05)

            logger.info("Upscaled with fallback method")
            return upscaled

        except Exception as e:
            logger.error(f"Fallback upscaling failed: {e}")
            raise

    def upscale_all_textures(self, texture_dir, output_dir, scale=2):
        """
        Batch upscale all textures in a directory

        Args:
            texture_dir: Directory containing textures
            output_dir: Output directory
            scale: Upscale factor

        Returns:
            (success: bool, message: str, upscaled_count: int)
        """
        try:
            os.makedirs(output_dir, exist_ok=True)

            # Find all image files
            image_extensions = {'.png', '.jpg', '.jpeg', '.tga', '.bmp'}
            texture_files = [
                f for f in os.listdir(texture_dir)
                if os.path.splitext(f)[1].lower() in image_extensions
            ]

            logger.info(f"Found {len(texture_files)} textures to upscale")

            upscaled_count = 0

            for texture_file in texture_files:
                input_path = os.path.join(texture_dir, texture_file)
                output_path = os.path.join(output_dir, texture_file)

                try:
                    success, _ = self.upscale_texture(input_path, output_path, scale)
                    if success:
                        upscaled_count += 1
                except Exception as e:
                    logger.error(f"Failed to upscale {texture_file}: {e}")
                    continue

            return True, f"Upscaled {upscaled_count}/{len(texture_files)} textures", upscaled_count

        except Exception as e:
            logger.error(f"Batch upscaling failed: {str(e)}")
            return False, f"Batch upscaling failed: {str(e)}", 0

    def enhance_texture_quality(self, texture_path, output_path):
        """
        Enhance texture quality without upscaling

        Args:
            texture_path: Input texture
            output_path: Output texture

        Returns:
            (success: bool, message: str)
        """
        try:
            from PIL import ImageFilter, ImageEnhance

            logger.info(f"Enhancing texture quality: {texture_path}")

            texture = Image.open(texture_path).convert('RGB')

            # Apply enhancement filters

            # 1. Sharpen
            texture = texture.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120, threshold=2))

            # 2. Enhance contrast
            enhancer = ImageEnhance.Contrast(texture)
            texture = enhancer.enhance(1.15)

            # 3. Enhance color saturation
            enhancer = ImageEnhance.Color(texture)
            texture = enhancer.enhance(1.1)

            # 4. Slight brightness adjustment
            enhancer = ImageEnhance.Brightness(texture)
            texture = enhancer.enhance(1.05)

            # 5. Denoise (slight blur then sharpen)
            texture = texture.filter(ImageFilter.GaussianBlur(radius=0.5))
            texture = texture.filter(ImageFilter.SHARPEN)

            texture.save(output_path, quality=95)

            logger.info(f"Texture enhanced: {output_path}")
            return True, "Texture quality enhanced"

        except Exception as e:
            logger.error(f"Texture enhancement failed: {str(e)}")
            return False, f"Enhancement failed: {str(e)}"

    def create_seamless_texture(self, texture_path, output_path):
        """
        Make texture seamlessly tileable

        Args:
            texture_path: Input texture
            output_path: Output seamless texture

        Returns:
            (success: bool, message: str)
        """
        try:
            logger.info(f"Creating seamless texture: {texture_path}")

            texture = Image.open(texture_path).convert('RGB')
            width, height = texture.size

            # Convert to numpy for processing
            img_array = np.array(texture, dtype=np.float32)

            # Apply blending at edges to make seamless

            # Horizontal seam
            blend_width = width // 8
            for i in range(blend_width):
                alpha = i / blend_width
                # Blend left and right edges
                img_array[:, i] = (
                    img_array[:, i] * alpha +
                    img_array[:, -(blend_width - i)] * (1 - alpha)
                )
                img_array[:, -(i + 1)] = (
                    img_array[:, -(i + 1)] * alpha +
                    img_array[:, blend_width - i - 1] * (1 - alpha)
                )

            # Vertical seam
            blend_height = height // 8
            for i in range(blend_height):
                alpha = i / blend_height
                # Blend top and bottom edges
                img_array[i, :] = (
                    img_array[i, :] * alpha +
                    img_array[-(blend_height - i), :] * (1 - alpha)
                )
                img_array[-(i + 1), :] = (
                    img_array[-(i + 1), :] * alpha +
                    img_array[blend_height - i - 1, :] * (1 - alpha)
                )

            # Convert back to PIL
            result = Image.fromarray(np.uint8(np.clip(img_array, 0, 255)))

            result.save(output_path, quality=95)

            logger.info(f"Seamless texture created: {output_path}")
            return True, "Seamless texture created"

        except Exception as e:
            logger.error(f"Seamless texture creation failed: {str(e)}")
            return False, f"Seamless creation failed: {str(e)}"

    def generate_texture_variants(self, texture_path, output_dir, count=3):
        """
        Generate color/style variants of a texture

        Args:
            texture_path: Base texture
            output_dir: Output directory
            count: Number of variants to generate

        Returns:
            (success: bool, message: str, variant_paths: list)
        """
        try:
            from PIL import ImageEnhance

            logger.info(f"Generating {count} texture variants")

            os.makedirs(output_dir, exist_ok=True)

            texture = Image.open(texture_path).convert('RGB')
            base_name = os.path.splitext(os.path.basename(texture_path))[0]

            variant_paths = []

            # Generate different variants
            variants = [
                ('darker', {'brightness': 0.8, 'contrast': 1.1}),
                ('lighter', {'brightness': 1.2, 'contrast': 0.9}),
                ('saturated', {'color': 1.3, 'contrast': 1.1}),
                ('desaturated', {'color': 0.7, 'brightness': 1.1}),
                ('warm', {'color': 1.2, 'brightness': 1.05}),
                ('cool', {'color': 0.9, 'contrast': 1.05}),
            ]

            for i, (variant_name, adjustments) in enumerate(variants[:count]):
                variant = texture.copy()

                # Apply adjustments
                if 'brightness' in adjustments:
                    enhancer = ImageEnhance.Brightness(variant)
                    variant = enhancer.enhance(adjustments['brightness'])

                if 'contrast' in adjustments:
                    enhancer = ImageEnhance.Contrast(variant)
                    variant = enhancer.enhance(adjustments['contrast'])

                if 'color' in adjustments:
                    enhancer = ImageEnhance.Color(variant)
                    variant = enhancer.enhance(adjustments['color'])

                # Save variant
                variant_filename = f"{base_name}_{variant_name}.png"
                variant_path = os.path.join(output_dir, variant_filename)
                variant.save(variant_path, quality=95)

                variant_paths.append(variant_path)
                logger.info(f"Created variant: {variant_name}")

            return True, f"Generated {len(variant_paths)} variants", variant_paths

        except Exception as e:
            logger.error(f"Variant generation failed: {str(e)}")
            return False, f"Variant generation failed: {str(e)}", []
