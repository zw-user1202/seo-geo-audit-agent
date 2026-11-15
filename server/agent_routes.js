const express = require('express');

function requireSession(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    next();
}

function validateHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function serializeJob(job) {
    return {
        id: job.id,
        url: job.url,
        userAgent: job.user_agent,
        analysisTypes: job.analysis_types ? String(job.analysis_types).split(',') : [],
        status: job.status,
        progress: job.progress || 0,
        currentStep: job.current_step,
        reportId: job.report_id,
        error: job.error,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        steps: (job.steps || []).map((step) => ({
            id: step.id,
            stepKey: step.step_key,
            title: step.title,
            status: step.status,
            progress: step.progress || 0,
            message: step.message,
            details: step.details,
            startedAt: step.started_at,
            completedAt: step.completed_at
        }))
    };
}

const VALID_ANALYSIS_TYPES = ['seo', 'geo'];

function createAgentRouter({ store, runner, logger = console }) {
    const router = express.Router();

    router.post('/jobs', requireSession, async (req, res) => {
        const { url, userAgent = 'pc', analysisTypes = ['seo', 'geo'] } = req.body || {};

        if (!url || !validateHttpUrl(url)) {
            return res.status(400).json({ error: 'Valid http or https URL required' });
        }

        if (!Array.isArray(analysisTypes) || analysisTypes.length === 0 ||
            analysisTypes.some((type) => !VALID_ANALYSIS_TYPES.includes(type))) {
            return res.status(400).json({ error: 'analysisTypes must be a non-empty array containing only "seo" and/or "geo"' });
        }

        const types = [...new Set(analysisTypes)];

        try {
            const aiProvider = req.body.aiProvider || process.env.AI_PROVIDER || 'deepseek';
            const jobId = await store.createJob({ url, userAgent, userId: req.session.userId, analysisTypes: types, aiProvider });
            setImmediate(() => {
                runner.run(jobId).catch((error) => {
                    logger.error('Agent job failed', { jobId, error: error.message });
                });
            });
            res.json({ success: true, jobId });
        } catch (error) {
            logger.error('Failed to create agent job', { error: error.message });
            res.status(500).json({ error: 'Failed to create agent job' });
        }
    });

    router.get('/jobs/:id', requireSession, async (req, res) => {
        const jobId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(jobId)) {
            return res.status(400).json({ error: 'Valid job id required' });
        }

        try {
            const job = await store.getJobWithSteps({
                jobId,
                userId: req.session.userId,
                isAdmin: req.session.userRole === 'admin'
            });
            if (!job) return res.status(404).json({ error: 'Agent job not found' });
            res.json(serializeJob(job));
        } catch (error) {
            logger.error('Failed to fetch agent job', { jobId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch agent job' });
        }
    });

    
    router.post('/jobs/:id/cancel', requireSession, async (req, res) => {
        try {
            const jobId = parseInt(req.params.id, 10);
            const job = await store.getJobWithSteps({ jobId, userId: req.session.userId, isAdmin: req.session.userRole === 'admin' });
            
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }
            
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                return res.status(400).json({ error: 'Job already finished' });
            }
            
            await store.cancelJob(jobId);
            markJobCancelled(jobId);
            logger.info('Job cancelled', { jobId, userId: req.session.userId });
            
            res.json({ success: true, message: 'Job cancelled' });
        } catch (error) {
            logger.error('Failed to cancel job', { error: error.message });
            res.status(500).json({ error: 'Failed to cancel job' });
        }
    });

    return router;
}

module.exports = {
    createAgentRouter,
    serializeJob
};
