"""
Progress Tracker for Real-Time Generation Updates
Provides WebSocket-based progress updates for long-running operations
"""

import time
from threading import Lock
from typing import Optional, Dict, Callable
import uuid


class ProgressTracker:
    """
    Tracks progress for long-running operations and provides callbacks
    for real-time updates to frontend via WebSocket
    """

    def __init__(self):
        self.jobs = {}
        self.lock = Lock()
        self.socketio = None  # Will be set by app.py

    def set_socketio(self, socketio):
        """Set the SocketIO instance for broadcasting updates"""
        self.socketio = socketio

    def create_job(self, job_type: str, job_name: str = None) -> str:
        """
        Create a new progress tracking job

        Args:
            job_type: Type of job (e.g., 'text_to_3d', 'image_to_3d', etc.)
            job_name: Optional human-readable name

        Returns:
            job_id: Unique identifier for this job
        """
        job_id = str(uuid.uuid4())

        with self.lock:
            self.jobs[job_id] = {
                'job_id': job_id,
                'job_type': job_type,
                'job_name': job_name or job_type,
                'status': 'starting',
                'progress': 0.0,
                'message': 'Initializing...',
                'start_time': time.time(),
                'end_time': None,
                'error': None,
                'result': None
            }

        # Broadcast initial status
        self._broadcast_update(job_id)

        return job_id

    def update_progress(self, job_id: str, progress: float, message: str = None):
        """
        Update job progress

        Args:
            job_id: Job identifier
            progress: Progress value 0.0-1.0 (or 0-100 if > 1)
            message: Optional status message
        """
        # Normalize progress to 0.0-1.0 range
        if progress > 1.0:
            progress = progress / 100.0

        progress = max(0.0, min(1.0, progress))

        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]['progress'] = progress
                self.jobs[job_id]['status'] = 'running'

                if message:
                    self.jobs[job_id]['message'] = message

        # Broadcast update
        self._broadcast_update(job_id)

    def complete_job(self, job_id: str, result=None, message: str = "Completed"):
        """
        Mark job as completed

        Args:
            job_id: Job identifier
            result: Optional result data
            message: Completion message
        """
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]['status'] = 'completed'
                self.jobs[job_id]['progress'] = 1.0
                self.jobs[job_id]['message'] = message
                self.jobs[job_id]['end_time'] = time.time()
                self.jobs[job_id]['result'] = result

        # Broadcast completion
        self._broadcast_update(job_id)

    def fail_job(self, job_id: str, error: str):
        """
        Mark job as failed

        Args:
            job_id: Job identifier
            error: Error message
        """
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]['status'] = 'failed'
                self.jobs[job_id]['message'] = f"Error: {error}"
                self.jobs[job_id]['error'] = error
                self.jobs[job_id]['end_time'] = time.time()

        # Broadcast failure
        self._broadcast_update(job_id)

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get current job status"""
        with self.lock:
            return self.jobs.get(job_id, None)

    def get_all_jobs(self) -> Dict:
        """Get all jobs"""
        with self.lock:
            return dict(self.jobs)

    def cleanup_old_jobs(self, max_age_seconds: int = 3600):
        """Remove jobs older than max_age_seconds"""
        current_time = time.time()

        with self.lock:
            to_remove = []
            for job_id, job_data in self.jobs.items():
                if job_data['end_time'] and (current_time - job_data['end_time'] > max_age_seconds):
                    to_remove.append(job_id)

            for job_id in to_remove:
                del self.jobs[job_id]

    def _broadcast_update(self, job_id: str):
        """Broadcast job update via WebSocket"""
        if self.socketio:
            with self.lock:
                job_data = self.jobs.get(job_id)
                if job_data:
                    # Calculate elapsed time and ETA
                    elapsed = time.time() - job_data['start_time']

                    eta = None
                    if job_data['progress'] > 0 and job_data['status'] == 'running':
                        total_estimated = elapsed / job_data['progress']
                        eta = total_estimated - elapsed

                    # Prepare broadcast data
                    broadcast_data = {
                        'job_id': job_id,
                        'job_type': job_data['job_type'],
                        'job_name': job_data['job_name'],
                        'status': job_data['status'],
                        'progress': round(job_data['progress'] * 100, 1),  # As percentage
                        'message': job_data['message'],
                        'elapsed': round(elapsed, 1),
                        'eta': round(eta, 1) if eta else None,
                        'error': job_data.get('error')
                    }

                    # Emit to specific job room and general progress room
                    self.socketio.emit('progress_update', broadcast_data, room=job_id)
                    self.socketio.emit('progress_update', broadcast_data, broadcast=True)

    def create_callback(self, job_id: str) -> Callable:
        """
        Create a callback function for progress updates

        Usage:
            progress_callback = tracker.create_callback(job_id)
            generator.generate(..., progress_callback=progress_callback)

        Returns:
            Callable that accepts (progress, message) arguments
        """
        def callback(progress: float, message: str = None):
            self.update_progress(job_id, progress, message)

        return callback


# Global progress tracker instance
progress_tracker = ProgressTracker()
