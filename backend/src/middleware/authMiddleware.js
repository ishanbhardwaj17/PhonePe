import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

const protect = async (req, res, next) => {
  let token;

  // Check if token exists in headers or cookies
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      // Decode the token and get user ID
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user in database, exclude password
      req.user = await User.findById(decoded.id).select('-password');

      next(); // Move to the next middleware or route controller
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export { protect };