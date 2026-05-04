const jwt = require('jsonwebtoken');

function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function authenticateUser(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sub) return res.status(401).json({ error: 'Invalid token' });
    req.userId = payload.sub;
    req.userRole = payload.role || 'user';
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authenticateAdmin(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.adminId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateUser, authenticateAdmin, bearerToken };
