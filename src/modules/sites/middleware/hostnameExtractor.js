/**
 * Hostname Extractor Middleware
 * Extracts and normalizes hostname from request
 */
const hostnameExtractor = (req, res, next) => {
  // Get hostname from request
  const hostname = req.hostname || req.get('host') || req.headers.host;
  
  if (!hostname) {
    return res.status(400).json({ error: 'Hostname is required' });
  }
  
  // Remove port if present
  const cleanHostname = hostname.split(':')[0];
  
  // Remove www prefix
  const normalizedHostname = cleanHostname.replace(/^www\./, '').toLowerCase();
  
  // Store in request
  req.hostname = normalizedHostname;
  req.originalHostname = hostname;
  
  // Check if it's a subdomain
  const baseDomain = process.env.BASE_DOMAIN || 'smartstore.ng';
  req.isSubdomain = normalizedHostname.endsWith(`.${baseDomain}`);
  
  if (req.isSubdomain) {
    req.subdomain = normalizedHostname.split('.')[0];
  }
  
  next();
};

module.exports = hostnameExtractor;


