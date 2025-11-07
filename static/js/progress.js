/**
 * Progress Tracking Module
 * Handles real-time progress updates via WebSocket
 */

class ProgressTracker {
    constructor() {
        this.socket = null;
        this.activeJobs = new Map();
        this.callbacks = new Map();
        this.connected = false;
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.socket && this.connected) {
            console.log('Already connected to WebSocket');
            return;
        }

        // Initialize Socket.IO connection
        this.socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        // Connection event handlers
        this.socket.on('connect', () => {
            console.log('✓ Connected to progress tracking server');
            this.connected = true;
            this.onConnectionChange(true);
        });

        this.socket.on('disconnect', () => {
            console.log('✗ Disconnected from progress tracking server');
            this.connected = false;
            this.onConnectionChange(false);
        });

        this.socket.on('connection_response', (data) => {
            console.log('Server response:', data.message);
        });

        // Progress update handler
        this.socket.on('progress_update', (data) => {
            this.handleProgressUpdate(data);
        });

        // Job status response handler
        this.socket.on('job_status_response', (data) => {
            console.log('Job status:', data);
        });
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }

    /**
     * Track a job and receive progress updates
     * @param {string} jobId - Job identifier
     * @param {Function} callback - Callback function (data) => {}
     */
    trackJob(jobId, callback) {
        if (!this.connected) {
            console.warn('Not connected to WebSocket. Connecting now...');
            this.connect();
        }

        // Store callback
        this.callbacks.set(jobId, callback);
        this.activeJobs.set(jobId, { status: 'tracking' });

        // Join job room for updates
        this.socket.emit('join_job', { job_id: jobId });

        console.log(`Tracking job: ${jobId}`);
    }

    /**
     * Stop tracking a job
     * @param {string} jobId - Job identifier
     */
    stopTracking(jobId) {
        if (this.socket && this.connected) {
            this.socket.emit('leave_job', { job_id: jobId });
        }

        this.callbacks.delete(jobId);
        this.activeJobs.delete(jobId);

        console.log(`Stopped tracking job: ${jobId}`);
    }

    /**
     * Get current job status
     * @param {string} jobId - Job identifier
     */
    getJobStatus(jobId) {
        if (this.socket && this.connected) {
            this.socket.emit('get_job_status', { job_id: jobId });
        }
    }

    /**
     * Handle progress update from server
     * @param {Object} data - Progress data
     */
    handleProgressUpdate(data) {
        const jobId = data.job_id;

        // Update active jobs
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.set(jobId, data);
        }

        // Call registered callback
        const callback = this.callbacks.get(jobId);
        if (callback) {
            callback(data);
        }

        // If job is completed or failed, stop tracking after a delay
        if (data.status === 'completed' || data.status === 'failed') {
            setTimeout(() => {
                this.stopTracking(jobId);
            }, 5000); // Keep for 5 seconds to show final status
        }
    }

    /**
     * Connection change callback (override this)
     * @param {boolean} connected - Connection status
     */
    onConnectionChange(connected) {
        // Override this method to handle connection changes
        console.log(`Connection status changed: ${connected}`);
    }
}

// Create global progress tracker instance
const progressTracker = new ProgressTracker();

/**
 * Progress Bar Component
 * Creates and manages a progress bar UI element
 */
class ProgressBar {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with ID '${containerId}' not found`);
            return;
        }

        this.options = {
            showPercentage: true,
            showMessage: true,
            showETA: true,
            animated: true,
            ...options
        };

        this.currentJobId = null;
        this.createUI();
    }

    /**
     * Create progress bar UI
     */
    createUI() {
        this.container.innerHTML = `
            <div class="progress-container" style="display: none;">
                <div class="progress-header">
                    <span class="progress-job-name">Processing...</span>
                    <span class="progress-percentage">0%</span>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: 0%"></div>
                    </div>
                </div>
                <div class="progress-footer">
                    <span class="progress-message">Initializing...</span>
                    <span class="progress-eta"></span>
                </div>
                <div class="progress-result" style="display: none;">
                    <span class="result-icon"></span>
                    <span class="result-message"></span>
                </div>
            </div>
        `;

        // Get references to elements
        this.progressContainer = this.container.querySelector('.progress-container');
        this.jobNameEl = this.container.querySelector('.progress-job-name');
        this.percentageEl = this.container.querySelector('.progress-percentage');
        this.progressFill = this.container.querySelector('.progress-bar-fill');
        this.messageEl = this.container.querySelector('.progress-message');
        this.etaEl = this.container.querySelector('.progress-eta');
        this.resultContainer = this.container.querySelector('.progress-result');
        this.resultIcon = this.container.querySelector('.result-icon');
        this.resultMessage = this.container.querySelector('.result-message');
    }

    /**
     * Start tracking a job
     * @param {string} jobId - Job identifier
     */
    track(jobId) {
        this.currentJobId = jobId;
        this.show();
        this.reset();

        // Track job with progress tracker
        progressTracker.trackJob(jobId, (data) => {
            this.update(data);
        });
    }

    /**
     * Show progress bar
     */
    show() {
        this.progressContainer.style.display = 'block';
    }

    /**
     * Hide progress bar
     */
    hide() {
        setTimeout(() => {
            this.progressContainer.style.display = 'none';
        }, 5000); // Hide after 5 seconds
    }

    /**
     * Reset progress bar
     */
    reset() {
        this.updateProgress(0);
        this.updateMessage('Initializing...');
        this.resultContainer.style.display = 'none';
    }

    /**
     * Update progress bar with data
     * @param {Object} data - Progress data
     */
    update(data) {
        // Update job name
        if (data.job_name) {
            this.jobNameEl.textContent = data.job_name;
        }

        // Update progress
        if (typeof data.progress !== 'undefined') {
            this.updateProgress(data.progress);
        }

        // Update message
        if (data.message) {
            this.updateMessage(data.message);
        }

        // Update ETA
        if (data.eta && this.options.showETA) {
            const etaSeconds = Math.round(data.eta);
            const etaText = etaSeconds > 60
                ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`
                : `${etaSeconds}s`;
            this.etaEl.textContent = `ETA: ${etaText}`;
        }

        // Handle completed/failed status
        if (data.status === 'completed') {
            this.showResult('success', data.message || 'Completed successfully!');
            if (data.result && data.result.model_url) {
                this.onComplete(data.result);
            }
        } else if (data.status === 'failed') {
            this.showResult('error', data.error || 'Generation failed');
            this.onError(data.error);
        }
    }

    /**
     * Update progress percentage
     * @param {number} progress - Progress (0-100)
     */
    updateProgress(progress) {
        this.progressFill.style.width = `${progress}%`;
        this.percentageEl.textContent = `${Math.round(progress)}%`;
    }

    /**
     * Update progress message
     * @param {string} message - Status message
     */
    updateMessage(message) {
        this.messageEl.textContent = message;
    }

    /**
     * Show result (success or error)
     * @param {string} type - 'success' or 'error'
     * @param {string} message - Result message
     */
    showResult(type, message) {
        this.resultContainer.style.display = 'flex';
        this.resultIcon.textContent = type === 'success' ? '✓' : '✗';
        this.resultIcon.className = `result-icon ${type}`;
        this.resultMessage.textContent = message;

        if (type === 'success') {
            this.progressFill.classList.add('success');
        } else {
            this.progressFill.classList.add('error');
        }

        this.hide();
    }

    /**
     * Completion callback (override this)
     * @param {Object} result - Result data
     */
    onComplete(result) {
        console.log('Generation completed:', result);
    }

    /**
     * Error callback (override this)
     * @param {string} error - Error message
     */
    onError(error) {
        console.error('Generation failed:', error);
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProgressTracker, ProgressBar, progressTracker };
}
