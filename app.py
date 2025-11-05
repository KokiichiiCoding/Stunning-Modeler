"""
Stunning Modeler - Professional 3D Model Generation Framework
A comprehensive AI-powered 3D model generation system supporting:
- Text-to-3D model generation
- Image-to-3D model conversion
- Model import and texturing
- Multi-format export (GLB, OBJ, FBX)
"""

from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
from werkzeug.utils import secure_filename
import os
import sys
import json
import uuid
import time
from datetime import datetime
import traceback
import logging

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'utils'))

# Import our custom utilities
from model_generator import TextTo3DGenerator, ImageTo3DGenerator
from model_processor import ModelProcessor
from texture_generator import TextureGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['OUTPUT_FOLDER'] = 'static/outputs'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'obj', 'glb', 'gltf', 'fbx', 'ply', 'stl'}

# Ensure folders exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

# Initialize generators (lazy loading)
text_to_3d_generator = None
image_to_3d_generator = None
model_processor = None
texture_generator = None

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_text_to_3d_generator():
    """Lazy load text-to-3D generator"""
    global text_to_3d_generator
    if text_to_3d_generator is None:
        logger.info("Initializing Text-to-3D Generator...")
        text_to_3d_generator = TextTo3DGenerator()
    return text_to_3d_generator

def get_image_to_3d_generator():
    """Lazy load image-to-3D generator"""
    global image_to_3d_generator
    if image_to_3d_generator is None:
        logger.info("Initializing Image-to-3D Generator...")
        image_to_3d_generator = ImageTo3DGenerator()
    return image_to_3d_generator

def get_model_processor():
    """Lazy load model processor"""
    global model_processor
    if model_processor is None:
        logger.info("Initializing Model Processor...")
        model_processor = ModelProcessor()
    return model_processor

def get_texture_generator():
    """Lazy load texture generator"""
    global texture_generator
    if texture_generator is None:
        logger.info("Initializing Texture Generator...")
        texture_generator = TextureGenerator()
    return texture_generator

# ============================================================================
# MAIN ROUTES
# ============================================================================

@app.route('/')
def index():
    """Main application page"""
    return render_template('index.html')

@app.route('/text-to-3d')
def text_to_3d_page():
    """Text-to-3D generation page"""
    return render_template('text_to_3d.html')

@app.route('/image-to-3d')
def image_to_3d_page():
    """Image-to-3D generation page"""
    return render_template('image_to_3d.html')

@app.route('/texture-model')
def texture_model_page():
    """Model texturing page"""
    return render_template('texture_model.html')

# ============================================================================
# API ROUTES - TEXT-TO-3D
# ============================================================================

@app.route('/api/generate-text-to-3d', methods=['POST'])
def generate_text_to_3d():
    """
    Generate 3D model from text description

    Expected JSON:
    {
        "prompt": "A red sports car",
        "guidance_scale": 15.0,
        "num_inference_steps": 64,
        "output_format": "glb"
    }
    """
    try:
        data = request.json
        prompt = data.get('prompt', '').strip()

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        # Generation parameters
        guidance_scale = float(data.get('guidance_scale', 15.0))
        num_inference_steps = int(data.get('num_inference_steps', 64))
        output_format = data.get('output_format', 'glb')

        logger.info(f"Generating 3D model from text: '{prompt}'")

        # Generate unique filename
        job_id = str(uuid.uuid4())
        output_filename = f"text_to_3d_{job_id}.{output_format}"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Generate the model
        generator = get_text_to_3d_generator()
        success, message = generator.generate(
            prompt=prompt,
            output_path=output_path,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps
        )

        if success:
            return jsonify({
                'success': True,
                'message': 'Model generated successfully',
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error in text-to-3D generation: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Generation failed: {str(e)}'}), 500

# ============================================================================
# API ROUTES - IMAGE-TO-3D
# ============================================================================

@app.route('/api/generate-image-to-3d', methods=['POST'])
def generate_image_to_3d():
    """
    Generate 3D model from image

    Expected form data:
    - image: File upload
    - foreground_ratio: float (optional)
    - output_format: str (optional)
    """
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No image file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400

        # Save uploaded image
        filename = secure_filename(file.filename)
        job_id = str(uuid.uuid4())
        upload_filename = f"upload_{job_id}_{filename}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], upload_filename)
        file.save(upload_path)

        # Get parameters
        foreground_ratio = float(request.form.get('foreground_ratio', 0.85))
        output_format = request.form.get('output_format', 'glb')

        logger.info(f"Generating 3D model from image: {filename}")

        # Generate output filename
        output_filename = f"image_to_3d_{job_id}.{output_format}"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Generate the model
        generator = get_image_to_3d_generator()
        success, message = generator.generate(
            image_path=upload_path,
            output_path=output_path,
            foreground_ratio=foreground_ratio
        )

        if success:
            return jsonify({
                'success': True,
                'message': 'Model generated successfully from image',
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error in image-to-3D generation: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Generation failed: {str(e)}'}), 500

# ============================================================================
# API ROUTES - MODEL TEXTURING
# ============================================================================

@app.route('/api/texture-model', methods=['POST'])
def texture_model():
    """
    Apply AI-generated textures to an imported 3D model

    Expected form data:
    - model: File upload (3D model)
    - texture_prompt: str (description of desired texture)
    - texture_resolution: int (optional)
    """
    try:
        if 'model' not in request.files:
            return jsonify({'error': 'No model file provided'}), 400

        file = request.files['model']
        if file.filename == '':
            return jsonify({'error': 'No model file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400

        # Save uploaded model
        filename = secure_filename(file.filename)
        job_id = str(uuid.uuid4())
        upload_filename = f"model_{job_id}_{filename}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], upload_filename)
        file.save(upload_path)

        # Get parameters
        texture_prompt = request.form.get('texture_prompt', '').strip()
        texture_resolution = int(request.form.get('texture_resolution', 1024))

        if not texture_prompt:
            return jsonify({'error': 'Texture prompt is required'}), 400

        logger.info(f"Texturing model: {filename} with prompt: '{texture_prompt}'")

        # Generate output filename
        output_filename = f"textured_{job_id}.glb"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Process and texture the model
        tex_gen = get_texture_generator()
        success, message = tex_gen.apply_texture(
            model_path=upload_path,
            output_path=output_path,
            texture_prompt=texture_prompt,
            resolution=texture_resolution
        )

        if success:
            return jsonify({
                'success': True,
                'message': 'Model textured successfully',
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error in model texturing: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Texturing failed: {str(e)}'}), 500

# ============================================================================
# API ROUTES - MODEL PROCESSING
# ============================================================================

@app.route('/api/optimize-model', methods=['POST'])
def optimize_model():
    """
    Optimize a 3D model for production use

    Expected form data:
    - model: File upload
    - target_triangles: int (optional)
    - preserve_uvs: bool (optional)
    """
    try:
        if 'model' not in request.files:
            return jsonify({'error': 'No model file provided'}), 400

        file = request.files['model']
        if file.filename == '':
            return jsonify({'error': 'No model file selected'}), 400

        # Save uploaded model
        filename = secure_filename(file.filename)
        job_id = str(uuid.uuid4())
        upload_filename = f"optimize_{job_id}_{filename}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], upload_filename)
        file.save(upload_path)

        # Get parameters
        target_triangles = request.form.get('target_triangles', type=int)
        preserve_uvs = request.form.get('preserve_uvs', 'true').lower() == 'true'

        logger.info(f"Optimizing model: {filename}")

        # Generate output filename
        output_filename = f"optimized_{job_id}.glb"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Optimize the model
        processor = get_model_processor()
        success, message = processor.optimize(
            model_path=upload_path,
            output_path=output_path,
            target_triangles=target_triangles,
            preserve_uvs=preserve_uvs
        )

        if success:
            return jsonify({
                'success': True,
                'message': 'Model optimized successfully',
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error in model optimization: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Optimization failed: {str(e)}'}), 500

@app.route('/api/convert-format', methods=['POST'])
def convert_format():
    """
    Convert 3D model between formats

    Expected form data:
    - model: File upload
    - output_format: str (glb, obj, fbx, ply, stl)
    """
    try:
        if 'model' not in request.files:
            return jsonify({'error': 'No model file provided'}), 400

        file = request.files['model']
        if file.filename == '':
            return jsonify({'error': 'No model file selected'}), 400

        # Save uploaded model
        filename = secure_filename(file.filename)
        job_id = str(uuid.uuid4())
        upload_filename = f"convert_{job_id}_{filename}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], upload_filename)
        file.save(upload_path)

        # Get output format
        output_format = request.form.get('output_format', 'glb').lower()

        logger.info(f"Converting model {filename} to {output_format}")

        # Generate output filename
        output_filename = f"converted_{job_id}.{output_format}"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Convert the model
        processor = get_model_processor()
        success, message = processor.convert(
            model_path=upload_path,
            output_path=output_path,
            output_format=output_format
        )

        if success:
            return jsonify({
                'success': True,
                'message': f'Model converted to {output_format.upper()} successfully',
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error in format conversion: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Conversion failed: {str(e)}'}), 500

# ============================================================================
# UTILITY ROUTES
# ============================================================================

@app.route('/api/model-info', methods=['POST'])
def get_model_info():
    """Get information about an uploaded model"""
    try:
        if 'model' not in request.files:
            return jsonify({'error': 'No model file provided'}), 400

        file = request.files['model']
        if file.filename == '':
            return jsonify({'error': 'No model file selected'}), 400

        # Save temporarily
        filename = secure_filename(file.filename)
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f"temp_{uuid.uuid4()}_{filename}")
        file.save(temp_path)

        # Get model info
        processor = get_model_processor()
        info = processor.get_model_info(temp_path)

        # Clean up temp file
        try:
            os.remove(temp_path)
        except:
            pass

        return jsonify({
            'success': True,
            'info': info
        })

    except Exception as e:
        logger.error(f"Error getting model info: {str(e)}")
        return jsonify({'error': f'Failed to get model info: {str(e)}'}), 500

@app.route('/static/outputs/<path:filename>')
def serve_output(filename):
    """Serve generated model files"""
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'generators': {
            'text_to_3d': text_to_3d_generator is not None,
            'image_to_3d': image_to_3d_generator is not None,
            'texture_gen': texture_generator is not None,
            'processor': model_processor is not None
        }
    })

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large. Maximum size is 100MB'}), 413

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("=" * 70)
    print("  STUNNING MODELER - Professional 3D Model Generation Framework")
    print("=" * 70)
    print()
    print("  Features:")
    print("  • Text-to-3D Model Generation")
    print("  • Image-to-3D Model Conversion")
    print("  • AI-Powered Model Texturing")
    print("  • Multi-format Export (GLB, OBJ, FBX, PLY, STL)")
    print("  • Production-Ready Model Optimization")
    print()
    print("  Server starting at: http://localhost:5000")
    print("=" * 70)
    print()

    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
