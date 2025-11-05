"""
Polii - Professional 3D Model Generation & Animation Studio
A comprehensive AI-powered 3D model generation system supporting:
- Text-to-3D model generation
- Image-to-3D model conversion
- Model import and texturing
- Auto-rigging and animation
- VRM export for VTubers
- Multi-format export (GLB, OBJ, FBX, VRM)
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
from auto_rigger import AutoRigger
from vrm_exporter import VRMExporter
from batch_processor import ProjectManager, BatchProcessor, ModelComparison
from pbr_materials import PBRMaterialGenerator

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
os.makedirs('static/projects', exist_ok=True)
os.makedirs('static/materials', exist_ok=True)

# Initialize generators (lazy loading)
text_to_3d_generator = None
image_to_3d_generator = None
model_processor = None
texture_generator = None
auto_rigger = None
vrm_exporter = None
project_manager = None
batch_processor = None
model_comparison = None
pbr_generator = None

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

def get_auto_rigger():
    """Lazy load auto-rigger"""
    global auto_rigger
    if auto_rigger is None:
        logger.info("Initializing Auto-Rigger...")
        auto_rigger = AutoRigger()
    return auto_rigger

def get_vrm_exporter():
    """Lazy load VRM exporter"""
    global vrm_exporter
    if vrm_exporter is None:
        logger.info("Initializing VRM Exporter...")
        vrm_exporter = VRMExporter()
    return vrm_exporter

def get_project_manager():
    """Lazy load project manager"""
    global project_manager
    if project_manager is None:
        logger.info("Initializing Project Manager...")
        project_manager = ProjectManager('static/projects')
    return project_manager

def get_batch_processor():
    """Lazy load batch processor"""
    global batch_processor
    if batch_processor is None:
        logger.info("Initializing Batch Processor...")
        batch_processor = BatchProcessor(max_workers=2)
        batch_processor.start()
    return batch_processor

def get_model_comparison():
    """Lazy load model comparison"""
    global model_comparison
    if model_comparison is None:
        logger.info("Initializing Model Comparison...")
        model_comparison = ModelComparison()
    return model_comparison

def get_pbr_generator():
    """Lazy load PBR generator"""
    global pbr_generator
    if pbr_generator is None:
        logger.info("Initializing PBR Material Generator...")
        pbr_generator = PBRMaterialGenerator()
    return pbr_generator

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
            'processor': model_processor is not None,
            'auto_rigger': auto_rigger is not None,
            'vrm_exporter': vrm_exporter is not None,
            'pbr_generator': pbr_generator is not None
        }
    })

# ============================================================================
# API ROUTES - AUTO-RIGGING & ANIMATION
# ============================================================================

@app.route('/api/auto-rig', methods=['POST'])
def auto_rig_model():
    """
    Automatically rig a 3D model with skeleton

    Expected form data:
    - model: File upload
    - rig_type: str ('humanoid', 'quadruped', 'biped')
    - auto_weight: bool (optional)
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
        upload_filename = f"rig_{job_id}_{filename}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], upload_filename)
        file.save(upload_path)

        # Get parameters
        rig_type = request.form.get('rig_type', 'humanoid')
        auto_weight = request.form.get('auto_weight', 'true').lower() == 'true'

        logger.info(f"Auto-rigging model: {filename} with {rig_type} rig")

        # Generate output filename
        output_filename = f"rigged_{job_id}.glb"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Auto-rig the model
        rigger = get_auto_rigger()
        success, message, rig_data = rigger.auto_rig(
            model_path=upload_path,
            output_path=output_path,
            rig_type=rig_type,
            auto_weight=auto_weight
        )

        if success:
            return jsonify({
                'success': True,
                'message': message,
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id,
                'bone_count': rig_data['bone_count'] if rig_data else 0
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error in auto-rigging: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'Auto-rigging failed: {str(e)}'}), 500

# ============================================================================
# API ROUTES - VRM EXPORT
# ============================================================================

@app.route('/api/export-vrm', methods=['POST'])
def export_vrm():
    """
    Export model as VRM for VTuber use

    Expected form data:
    - model: File upload
    - title: str (avatar title)
    - author: str (optional)
    - version: str ('0.0' or '1.0')
    - include_blendshapes: bool (optional)
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
        upload_filename = f"vrm_{job_id}_{filename}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], upload_filename)
        file.save(upload_path)

        # Get metadata
        metadata = {
            'title': request.form.get('title', 'VRM Avatar'),
            'author': request.form.get('author', 'Polii'),
            'version': request.form.get('avatar_version', '1.0'),
        }

        vrm_version = request.form.get('vrm_version', '1.0')
        include_blendshapes = request.form.get('include_blendshapes', 'true').lower() == 'true'

        logger.info(f"Exporting VRM {vrm_version}: {filename}")

        # Generate output filename
        output_filename = f"avatar_{job_id}.vrm"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        # Export as VRM
        exporter = get_vrm_exporter()
        success, message = exporter.export_vrm(
            model_path=upload_path,
            output_path=output_path,
            metadata=metadata,
            vrm_version=vrm_version,
            include_blendshapes=include_blendshapes
        )

        if success:
            return jsonify({
                'success': True,
                'message': message,
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename,
                'job_id': job_id
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error exporting VRM: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': f'VRM export failed: {str(e)}'}), 500

@app.route('/api/validate-vrm', methods=['POST'])
def validate_vrm():
    """Validate VRM file for common issues"""
    try:
        if 'model' not in request.files:
            return jsonify({'error': 'No VRM file provided'}), 400

        file = request.files['model']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Save temporarily
        filename = secure_filename(file.filename)
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f"validate_{uuid.uuid4()}_{filename}")
        file.save(temp_path)

        # Validate
        exporter = get_vrm_exporter()
        valid, issues = exporter.validate_vrm(temp_path)

        # Clean up
        try:
            os.remove(temp_path)
        except:
            pass

        return jsonify({
            'success': True,
            'valid': valid,
            'issues': issues
        })

    except Exception as e:
        logger.error(f"Error validating VRM: {str(e)}")
        return jsonify({'error': f'Validation failed: {str(e)}'}), 500

# ============================================================================
# API ROUTES - PBR MATERIALS
# ============================================================================

@app.route('/api/generate-pbr-material', methods=['POST'])
def generate_pbr_material():
    """
    Generate PBR material set

    Expected JSON:
    {
        "material_name": "my_material",
        "preset": "metal",
        "resolution": 1024
    }
    """
    try:
        data = request.json
        material_name = data.get('material_name', 'material')
        preset = data.get('preset', 'default')
        resolution = int(data.get('resolution', 1024))

        logger.info(f"Generating PBR material: {material_name} ({preset})")

        # Create material directory
        material_dir = os.path.join('static/materials', str(uuid.uuid4()))
        os.makedirs(material_dir, exist_ok=True)

        # Generate PBR material
        pbr_gen = get_pbr_generator()
        success, message, material_paths = pbr_gen.generate_pbr_material(
            output_dir=material_dir,
            material_name=material_name,
            resolution=resolution,
            preset=preset
        )

        if success:
            # Convert paths to URLs
            material_urls = {
                key: f'/{path.replace(os.sep, "/")}'
                for key, path in material_paths.items()
            }

            return jsonify({
                'success': True,
                'message': message,
                'materials': material_urls
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error generating PBR material: {str(e)}")
        return jsonify({'error': f'Material generation failed: {str(e)}'}), 500

@app.route('/api/apply-pbr-material', methods=['POST'])
def apply_pbr_material():
    """Apply PBR material to model"""
    try:
        if 'model' not in request.files:
            return jsonify({'error': 'No model file provided'}), 400

        file = request.files['model']
        if file.filename == '':
            return jsonify({'error': 'No model file selected'}), 400

        # Save model
        filename = secure_filename(file.filename)
        job_id = str(uuid.uuid4())
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], f"pbr_{job_id}_{filename}")
        file.save(upload_path)

        # Get material preset
        preset = request.form.get('preset', 'default')
        resolution = int(request.form.get('resolution', 1024))

        # Generate PBR material
        material_dir = os.path.join('static/materials', job_id)
        os.makedirs(material_dir, exist_ok=True)

        pbr_gen = get_pbr_generator()
        success, message, material_paths = pbr_gen.generate_pbr_material(
            output_dir=material_dir,
            material_name='generated',
            resolution=resolution,
            preset=preset
        )

        if not success:
            return jsonify({'error': message}), 500

        # Apply to model
        output_filename = f"pbr_{job_id}.glb"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)

        success, message = pbr_gen.apply_pbr_to_model(
            model_path=upload_path,
            material_paths=material_paths,
            output_path=output_path
        )

        if success:
            return jsonify({
                'success': True,
                'message': message,
                'model_url': f'/static/outputs/{output_filename}',
                'filename': output_filename
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        logger.error(f"Error applying PBR material: {str(e)}")
        return jsonify({'error': f'Failed to apply PBR material: {str(e)}'}), 500

# ============================================================================
# API ROUTES - BATCH PROCESSING
# ============================================================================

@app.route('/api/batch/add-job', methods=['POST'])
def add_batch_job():
    """Add a job to the batch queue"""
    try:
        data = request.json
        job_type = data.get('job_type')
        job_data = data.get('job_data')

        if not job_type or not job_data:
            return jsonify({'error': 'job_type and job_data are required'}), 400

        # Add job to batch processor
        batch_proc = get_batch_processor()
        job_id = batch_proc.add_job(job_type, job_data)

        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': 'Job added to batch queue'
        })

    except Exception as e:
        logger.error(f"Error adding batch job: {str(e)}")
        return jsonify({'error': f'Failed to add job: {str(e)}'}), 500

@app.route('/api/batch/job-status/<job_id>', methods=['GET'])
def get_batch_job_status(job_id):
    """Get status of a batch job"""
    try:
        batch_proc = get_batch_processor()
        job = batch_proc.get_job_status(job_id)

        if job:
            return jsonify({
                'success': True,
                'job': job
            })
        else:
            return jsonify({'error': 'Job not found'}), 404

    except Exception as e:
        logger.error(f"Error getting job status: {str(e)}")
        return jsonify({'error': f'Failed to get status: {str(e)}'}), 500

@app.route('/api/batch/all-jobs', methods=['GET'])
def get_all_batch_jobs():
    """Get all batch jobs"""
    try:
        batch_proc = get_batch_processor()
        jobs = batch_proc.get_all_jobs()

        return jsonify({
            'success': True,
            'jobs': jobs
        })

    except Exception as e:
        logger.error(f"Error getting all jobs: {str(e)}")
        return jsonify({'error': f'Failed to get jobs: {str(e)}'}), 500

# ============================================================================
# API ROUTES - PROJECT MANAGEMENT
# ============================================================================

@app.route('/api/project/create', methods=['POST'])
def create_project():
    """Create a new project"""
    try:
        data = request.json
        name = data.get('name', 'Untitled Project')
        project_type = data.get('type', 'text_to_3d')

        pm = get_project_manager()
        project_id = pm.create_project(name, project_type)

        return jsonify({
            'success': True,
            'project_id': project_id,
            'message': 'Project created successfully'
        })

    except Exception as e:
        logger.error(f"Error creating project: {str(e)}")
        return jsonify({'error': f'Failed to create project: {str(e)}'}), 500

@app.route('/api/project/<project_id>', methods=['GET'])
def get_project(project_id):
    """Get project data"""
    try:
        pm = get_project_manager()
        project_data = pm.get_project(project_id)

        return jsonify({
            'success': True,
            'project': project_data
        })

    except Exception as e:
        logger.error(f"Error getting project: {str(e)}")
        return jsonify({'error': f'Project not found: {str(e)}'}), 404

@app.route('/api/project/list', methods=['GET'])
def list_projects():
    """List all projects"""
    try:
        pm = get_project_manager()
        projects = pm.list_projects()

        return jsonify({
            'success': True,
            'projects': projects
        })

    except Exception as e:
        logger.error(f"Error listing projects: {str(e)}")
        return jsonify({'error': f'Failed to list projects: {str(e)}'}), 500

# ============================================================================
# API ROUTES - MODEL COMPARISON
# ============================================================================

@app.route('/api/compare-models', methods=['POST'])
def compare_models():
    """Compare multiple 3D models"""
    try:
        if 'models' not in request.files:
            return jsonify({'error': 'No model files provided'}), 400

        files = request.files.getlist('models')
        if len(files) < 2:
            return jsonify({'error': 'At least 2 models required for comparison'}), 400

        # Save uploaded models
        model_paths = []
        for file in files:
            filename = secure_filename(file.filename)
            temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f"compare_{uuid.uuid4()}_{filename}")
            file.save(temp_path)
            model_paths.append(temp_path)

        # Compare models
        comparison = get_model_comparison()
        comparisons = comparison.compare_models(model_paths)

        # Clean up temp files
        for path in model_paths:
            try:
                os.remove(path)
            except:
                pass

        return jsonify({
            'success': True,
            'comparisons': comparisons
        })

    except Exception as e:
        logger.error(f"Error comparing models: {str(e)}")
        return jsonify({'error': f'Comparison failed: {str(e)}'}), 500

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
    print("=" * 80)
    print("  POLII - Professional 3D Model Generation & Animation Studio")
    print("=" * 80)
    print()
    print("  🎨 Core Features:")
    print("  • Text-to-3D Model Generation (Shap-E, Diffusion Models)")
    print("  • Image-to-3D Model Conversion (MiDaS Depth Estimation)")
    print("  • AI-Powered Model Texturing (Stable Diffusion)")
    print()
    print("  🦴 Rigging & Animation:")
    print("  • Automatic Skeleton Generation (Humanoid, Quadruped, Biped)")
    print("  • AI-Powered Bone Weight Painting")
    print("  • Pose Library (T-Pose, A-Pose, Idle, Custom)")
    print()
    print("  🎭 VTuber & Streaming:")
    print("  • VRM 0.0 & 1.0 Export")
    print("  • Auto-Generated Blend Shapes (VRM, ARKit)")
    print("  • VTube Studio / VSeeFace / VRChat Ready")
    print()
    print("  ✨ Advanced Materials:")
    print("  • Full PBR Material System (Albedo, Normal, Roughness, Metallic, AO)")
    print("  • Material Presets (Metal, Wood, Plastic, Stone, Fabric, etc.)")
    print("  • Procedural Texture Generation")
    print()
    print("  🚀 Workflow & Productivity:")
    print("  • Batch Processing Queue")
    print("  • Project Management System")
    print("  • Model Comparison Tools")
    print("  • Multi-format Export (GLB, OBJ, FBX, PLY, STL, VRM)")
    print()
    print("  Server starting at: http://localhost:5000")
    print("=" * 80)
    print()

    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
