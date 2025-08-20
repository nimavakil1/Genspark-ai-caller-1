const errorHandler = (err, req, res, next) => {
  console.error('💥 Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.statusCode || 500
  };

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    error.status = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error.message = message;
    error.status = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error.message = message.join(', ');
    error.status = 400;
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        error.message = 'Duplicate entry. This record already exists.';
        error.status = 409;
        break;
      case '23503': // foreign_key_violation
        error.message = 'Referenced record does not exist.';
        error.status = 400;
        break;
      case '23502': // not_null_violation
        error.message = 'Required field is missing.';
        error.status = 400;
        break;
      case '42P01': // undefined_table
        error.message = 'Database table not found.';
        error.status = 500;
        break;
      case '42703': // undefined_column
        error.message = 'Database column not found.';
        error.status = 500;
        break;
      case '28P01': // invalid_password
        error.message = 'Database authentication failed.';
        error.status = 500;
        break;
      case '3D000': // invalid_catalog_name
        error.message = 'Database does not exist.';
        error.status = 500;
        break;
      case '08006': // connection_failure
        error.message = 'Database connection failed.';
        error.status = 500;
        break;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.status = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.status = 401;
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File too large';
    error.status = 400;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.message = 'Unexpected file field';
    error.status = 400;
  }

  // Send error response
  res.status(error.status).json({
    success: false,
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
const notFound = (req, res, next) => {
  const error = new Error(`Not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound
};