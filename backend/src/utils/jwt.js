const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRES = '7d';

function signUserToken(userDoc) {
  return jwt.sign(
    {
      sub: String(userDoc._id),
      role: userDoc.role || 'user',
    },
    process.env.JWT_SECRET,
    { expiresIn: DEFAULT_EXPIRES }
  );
}

module.exports = { signUserToken };
