"""
Batch Processing and Project Management System
Handle multiple model generations and project workflows
"""

import os
import json
import uuid
import time
from datetime import datetime
from pathlib import Path
import logging
import threading
from queue import Queue, Empty

logger = logging.getLogger(__name__)


class ProjectManager:
    """
    Manages 3D modeling projects with save/load functionality
    """

    def __init__(self, projects_dir='projects'):
        """Initialize project manager"""
        self.projects_dir = projects_dir
        os.makedirs(projects_dir, exist_ok=True)
        logger.info(f"Project Manager initialized: {projects_dir}")

    def create_project(self, name, project_type='text_to_3d'):
        """
        Create a new project

        Args:
            name: Project name
            project_type: Type of project ('text_to_3d', 'image_to_3d', 'texture', 'rigging')

        Returns:
            project_id: Unique project identifier
        """
        try:
            project_id = str(uuid.uuid4())
            project_dir = os.path.join(self.projects_dir, project_id)
            os.makedirs(project_dir, exist_ok=True)

            project_data = {
                'id': project_id,
                'name': name,
                'type': project_type,
                'created': datetime.now().isoformat(),
                'updated': datetime.now().isoformat(),
                'settings': {},
                'versions': [],
                'assets': []
            }

            self._save_project_file(project_id, project_data)

            logger.info(f"Created project: {name} ({project_id})")
            return project_id

        except Exception as e:
            logger.error(f"Error creating project: {str(e)}")
            raise

    def save_project_version(self, project_id, model_path, settings, notes=''):
        """
        Save a version of the project

        Args:
            project_id: Project identifier
            model_path: Path to generated model
            settings: Generation settings used
            notes: Optional version notes
        """
        try:
            project_data = self._load_project_file(project_id)

            version_data = {
                'version': len(project_data['versions']) + 1,
                'timestamp': datetime.now().isoformat(),
                'model_path': model_path,
                'settings': settings,
                'notes': notes
            }

            project_data['versions'].append(version_data)
            project_data['updated'] = datetime.now().isoformat()

            self._save_project_file(project_id, project_data)

            logger.info(f"Saved project version {version_data['version']} for {project_id}")

        except Exception as e:
            logger.error(f"Error saving project version: {str(e)}")
            raise

    def get_project(self, project_id):
        """Get project data"""
        return self._load_project_file(project_id)

    def list_projects(self):
        """List all projects"""
        try:
            projects = []

            for project_dir in os.listdir(self.projects_dir):
                project_path = os.path.join(self.projects_dir, project_dir)
                if os.path.isdir(project_path):
                    try:
                        project_data = self._load_project_file(project_dir)
                        projects.append({
                            'id': project_data['id'],
                            'name': project_data['name'],
                            'type': project_data['type'],
                            'created': project_data['created'],
                            'updated': project_data['updated'],
                            'versions': len(project_data['versions'])
                        })
                    except:
                        continue

            return sorted(projects, key=lambda x: x['updated'], reverse=True)

        except Exception as e:
            logger.error(f"Error listing projects: {str(e)}")
            return []

    def _save_project_file(self, project_id, data):
        """Save project data to JSON file"""
        project_file = os.path.join(self.projects_dir, project_id, 'project.json')
        with open(project_file, 'w') as f:
            json.dump(data, f, indent=2)

    def _load_project_file(self, project_id):
        """Load project data from JSON file"""
        project_file = os.path.join(self.projects_dir, project_id, 'project.json')
        with open(project_file, 'r') as f:
            return json.load(f)


class BatchProcessor:
    """
    Batch processing system for multiple model generations
    """

    def __init__(self, max_workers=2):
        """Initialize batch processor"""
        self.max_workers = max_workers
        self.job_queue = Queue()
        self.active_jobs = {}
        self.completed_jobs = {}
        self.worker_threads = []
        self.running = False

        logger.info(f"Batch Processor initialized with {max_workers} workers")

    def start(self):
        """Start batch processing workers"""
        if self.running:
            return

        self.running = True

        for i in range(self.max_workers):
            worker = threading.Thread(target=self._worker, args=(i,), daemon=True)
            worker.start()
            self.worker_threads.append(worker)

        logger.info(f"Started {self.max_workers} batch processing workers")

    def stop(self):
        """Stop batch processing workers"""
        self.running = False
        logger.info("Stopped batch processing workers")

    def add_job(self, job_type, job_data):
        """
        Add a job to the batch queue

        Args:
            job_type: Type of job ('text_to_3d', 'image_to_3d', 'texture', 'rig')
            job_data: Job parameters

        Returns:
            job_id: Unique job identifier
        """
        try:
            job_id = str(uuid.uuid4())

            job = {
                'id': job_id,
                'type': job_type,
                'data': job_data,
                'status': 'queued',
                'created': datetime.now().isoformat(),
                'started': None,
                'completed': None,
                'result': None,
                'error': None
            }

            self.job_queue.put(job)
            self.active_jobs[job_id] = job

            logger.info(f"Added batch job {job_id} ({job_type})")
            return job_id

        except Exception as e:
            logger.error(f"Error adding batch job: {str(e)}")
            raise

    def get_job_status(self, job_id):
        """Get status of a batch job"""
        if job_id in self.active_jobs:
            return self.active_jobs[job_id]
        elif job_id in self.completed_jobs:
            return self.completed_jobs[job_id]
        else:
            return None

    def get_all_jobs(self):
        """Get status of all jobs"""
        all_jobs = {}
        all_jobs.update(self.active_jobs)
        all_jobs.update(self.completed_jobs)
        return all_jobs

    def _worker(self, worker_id):
        """Worker thread for processing batch jobs"""
        logger.info(f"Batch worker {worker_id} started")

        while self.running:
            try:
                # Get job from queue with timeout
                job = self.job_queue.get(timeout=1.0)

                job['status'] = 'processing'
                job['started'] = datetime.now().isoformat()

                logger.info(f"Worker {worker_id} processing job {job['id']}")

                # Process job based on type
                try:
                    result = self._process_job(job)
                    job['status'] = 'completed'
                    job['result'] = result
                    logger.info(f"Worker {worker_id} completed job {job['id']}")

                except Exception as e:
                    job['status'] = 'failed'
                    job['error'] = str(e)
                    logger.error(f"Worker {worker_id} failed job {job['id']}: {str(e)}")

                job['completed'] = datetime.now().isoformat()

                # Move to completed jobs
                self.completed_jobs[job['id']] = job
                if job['id'] in self.active_jobs:
                    del self.active_jobs[job['id']]

            except Empty:
                # No jobs in queue, continue waiting
                continue

            except Exception as e:
                logger.error(f"Worker {worker_id} error: {str(e)}")

        logger.info(f"Batch worker {worker_id} stopped")

    def _process_job(self, job):
        """Process a single batch job"""

        job_type = job['type']
        job_data = job['data']

        # Import generators (lazy import to avoid circular dependencies)
        from model_generator import TextTo3DGenerator, ImageTo3DGenerator
        from texture_generator import TextureGenerator
        from auto_rigger import AutoRigger

        if job_type == 'text_to_3d':
            generator = TextTo3DGenerator()
            success, message = generator.generate(
                prompt=job_data['prompt'],
                output_path=job_data['output_path'],
                guidance_scale=job_data.get('guidance_scale', 15.0),
                num_inference_steps=job_data.get('num_inference_steps', 64)
            )
            return {'success': success, 'message': message, 'output': job_data['output_path']}

        elif job_type == 'image_to_3d':
            generator = ImageTo3DGenerator()
            success, message = generator.generate(
                image_path=job_data['image_path'],
                output_path=job_data['output_path'],
                foreground_ratio=job_data.get('foreground_ratio', 0.85)
            )
            return {'success': success, 'message': message, 'output': job_data['output_path']}

        elif job_type == 'texture':
            generator = TextureGenerator()
            success, message = generator.apply_texture(
                model_path=job_data['model_path'],
                output_path=job_data['output_path'],
                texture_prompt=job_data['texture_prompt'],
                resolution=job_data.get('resolution', 1024)
            )
            return {'success': success, 'message': message, 'output': job_data['output_path']}

        elif job_type == 'rig':
            rigger = AutoRigger()
            success, message, rig_data = rigger.auto_rig(
                model_path=job_data['model_path'],
                output_path=job_data['output_path'],
                rig_type=job_data.get('rig_type', 'humanoid'),
                auto_weight=job_data.get('auto_weight', True)
            )
            return {'success': success, 'message': message, 'output': job_data['output_path'], 'rig_data': rig_data}

        else:
            raise ValueError(f"Unknown job type: {job_type}")


class ModelComparison:
    """
    Model comparison and analysis tools
    """

    def __init__(self):
        """Initialize model comparison"""
        logger.info("Model Comparison initialized")

    def compare_models(self, model_paths):
        """
        Compare multiple 3D models

        Args:
            model_paths: List of model file paths

        Returns:
            Comparison data with statistics
        """
        try:
            import trimesh

            comparisons = []

            for model_path in model_paths:
                mesh = trimesh.load(model_path, force='mesh')
                if isinstance(mesh, trimesh.Scene):
                    mesh = mesh.dump(concatenate=True)

                stats = {
                    'path': model_path,
                    'filename': os.path.basename(model_path),
                    'vertices': len(mesh.vertices),
                    'faces': len(mesh.faces),
                    'bounds': mesh.bounds.tolist(),
                    'volume': float(mesh.volume) if mesh.is_watertight else None,
                    'surface_area': float(mesh.area),
                    'is_watertight': mesh.is_watertight,
                    'file_size': os.path.getsize(model_path)
                }

                comparisons.append(stats)

            return comparisons

        except Exception as e:
            logger.error(f"Error comparing models: {str(e)}")
            raise

    def generate_comparison_report(self, comparisons):
        """
        Generate a comparison report

        Returns:
            HTML report string
        """
        try:
            report = "<h2>Model Comparison Report</h2>"
            report += "<table border='1' style='border-collapse: collapse; width: 100%;'>"
            report += "<tr><th>Model</th><th>Vertices</th><th>Faces</th><th>Volume</th><th>Surface Area</th><th>File Size</th></tr>"

            for comp in comparisons:
                report += f"<tr>"
                report += f"<td>{comp['filename']}</td>"
                report += f"<td>{comp['vertices']:,}</td>"
                report += f"<td>{comp['faces']:,}</td>"
                report += f"<td>{comp['volume']:.2f if comp['volume'] else 'N/A'}</td>"
                report += f"<td>{comp['surface_area']:.2f}</td>"
                report += f"<td>{comp['file_size'] / 1024:.1f} KB</td>"
                report += f"</tr>"

            report += "</table>"

            return report

        except Exception as e:
            logger.error(f"Error generating comparison report: {str(e)}")
            raise
