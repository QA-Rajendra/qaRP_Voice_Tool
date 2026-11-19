function errorHandler(error, _request, response, _next) {
  const isUploadTooLarge = error.code === 'LIMIT_FILE_SIZE';
  const isMultipartError = error.name === 'MulterError';
  const status = isUploadTooLarge ? 413 : (isMultipartError ? 400 : (Number.isInteger(error.status) ? error.status : 500));
  const code = isUploadTooLarge ? 'FILE_TOO_LARGE' : (isMultipartError ? 'INVALID_MULTIPART_UPLOAD' : (error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR')));
  const message = isUploadTooLarge
    ? 'The image is larger than the configured upload limit.'
    : (isMultipartError ? 'Upload one image file using the image field.' : (status >= 500 && code === 'INTERNAL_ERROR' ? 'An unexpected server error occurred.' : error.message));
  const payload = { error: { code, message } };
  if (error.details) payload.error.details = error.details;
  response.status(status).json(payload);
}

module.exports = { errorHandler };
