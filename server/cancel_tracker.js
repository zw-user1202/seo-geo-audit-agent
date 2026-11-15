// Cancel tracker for running jobs
const cancelledJobs = new Set();

module.exports = {
    markJobCancelled(jobId) {
        cancelledJobs.add(jobId);
    },
    isJobCancelled(jobId) {
        return cancelledJobs.has(jobId);
    },
    clearJobCancelled(jobId) {
        cancelledJobs.delete(jobId);
    }
};
