const jwt = require('jsonwebtoken')

module.exports.requireAuth = (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' })
  try {
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports.optionalAuth = (req, res, next) => {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET) } catch {}
  }
  next()
}
