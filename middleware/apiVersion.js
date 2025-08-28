/**
 * API Versioning Middleware
 * Handles API version routing and backward compatibility
 */

const apiVersion = (options = {}) => {
    const defaultVersion = options.defaultVersion || 'v1';
    const supportedVersions = options.supportedVersions || ['v1'];
    
    return (req, res, next) => {
        // Extract version from URL path (e.g., /api/v1/agents)
        const versionMatch = req.path.match(/^\/api\/(v\d+)\//);
        let requestedVersion = versionMatch ? versionMatch[1] : null;
        
        // Check Accept header for version (e.g., Accept: application/vnd.api.v1+json)
        if (!requestedVersion && req.headers.accept) {
            const acceptMatch = req.headers.accept.match(/application\/vnd\.api\.(v\d+)\+json/);
            requestedVersion = acceptMatch ? acceptMatch[1] : null;
        }
        
        // Check custom header (e.g., X-API-Version: v1)
        if (!requestedVersion && req.headers['x-api-version']) {
            requestedVersion = req.headers['x-api-version'];
        }
        
        // Default to latest version if none specified
        if (!requestedVersion) {
            requestedVersion = defaultVersion;
        }
        
        // Validate version
        if (!supportedVersions.includes(requestedVersion)) {
            return res.status(400).json({
                success: false,
                error: 'Unsupported API version',
                requested_version: requestedVersion,
                supported_versions: supportedVersions,
                message: `Please use one of the supported API versions: ${supportedVersions.join(', ')}`
            });
        }
        
        // Add version info to request
        req.apiVersion = requestedVersion;
        
        // Add version info to response headers
        res.set('X-API-Version', requestedVersion);
        res.set('X-Supported-Versions', supportedVersions.join(', '));
        
        next();
    };
};

module.exports = {
    apiVersion
};