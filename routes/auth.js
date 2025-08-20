const express = require('express');
const { query } = require('../src/database');
const { generateToken, hashPassword, comparePassword, authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Register new admin user
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName, role = 'admin' } = req.body;

  // Validation
  if (!username || !email || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Username, email, and password are required' 
    });
  }

  if (password.length < 6) {
    return res.status(400).json({ 
      success: false, 
      error: 'Password must be at least 6 characters long' 
    });
  }

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
    [username, email]
  );

  if (existingUser.rows.length > 0) {
    return res.status(409).json({ 
      success: false, 
      error: 'Username or email already exists' 
    });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const result = await query(
    `INSERT INTO admin_users (username, email, password_hash, first_name, last_name, role) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING id, username, email, first_name, last_name, role, created_at`,
    [username, email, passwordHash, firstName, lastName, role]
  );

  const user = result.rows[0];
  const token = generateToken(user);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    },
    token
  });
}));

// Login user
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // Validation
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Username and password are required' 
    });
  }

  // Find user (allow login with username or email)
  const result = await query(
    'SELECT * FROM admin_users WHERE (username = $1 OR email = $1) AND is_active = true',
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid credentials' 
    });
  }

  const user = result.rows[0];

  // Check password
  const isValidPassword = await comparePassword(password, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid credentials' 
    });
  }

  // Generate token
  const token = generateToken(user);

  res.json({
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    },
    token
  });
}));

// Get current user
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      role: req.user.role
    }
  });
}));

// Logout (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Change password
router.put('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      error: 'Current password and new password are required' 
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ 
      success: false, 
      error: 'New password must be at least 6 characters long' 
    });
  }

  // Get current user with password
  const result = await query(
    'SELECT password_hash FROM admin_users WHERE id = $1',
    [req.user.id]
  );

  const user = result.rows[0];

  // Verify current password
  const isValidPassword = await comparePassword(currentPassword, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({ 
      success: false, 
      error: 'Current password is incorrect' 
    });
  }

  // Hash new password
  const newPasswordHash = await hashPassword(newPassword);

  // Update password
  await query(
    'UPDATE admin_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newPasswordHash, req.user.id]
  );

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

module.exports = router;