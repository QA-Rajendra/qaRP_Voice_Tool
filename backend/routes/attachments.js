const multer = require('multer');
const express = require('express');
const { parseConfig } = require('../config/env');
const { createRateLimiter } = require('../middleware/rate-limit');
const { saveImage, resolveImage, removeImage, detectImageType } = require('../services/attachment-service');
const { createScreenshotAnalysisService } = require('../services/screenshot-analysis-service');

const ACCEPTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function createUploadError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function createAttachmentsRouter({ analysisService = createScreenshotAnalysisService() } = {}) {
  const router = express.Router();
  const maxBytes = parseConfig().maxUploadMb * 1024 * 1024;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!ACCEPTED_IMAGE_MIME.has(file.mimetype)) {
        callback(createUploadError('UNSUPPORTED_IMAGE_TYPE', 'Upload a PNG, JPEG, WebP, or GIF image.', 415));
        return;
      }
      callback(null, true);
    },
  });

  router.post('/', createRateLimiter({ windowMs: 60_000, max: 20 }), upload.single('image'), async (request, response) => {
    if (!request.file) {
      const error = createUploadError('IMAGE_REQUIRED', 'Choose an image file to upload.', 400);
      throw error;
    }
    const signature = detectImageType(request.file.buffer);
    if (!signature || signature.mimeType !== request.file.mimetype) {
      throw createUploadError('INVALID_IMAGE_CONTENT', 'The uploaded file content does not match an allowed image type.', 415);
    }
    response.status(201).json(await saveImage(request.file));
  });

  router.post('/:id/analyze', createRateLimiter({ windowMs: 5 * 60_000, max: 6 }), async (request, response) => {
    const image = await resolveImage(request.params.id);
    if (!image) {
      const error = new Error('Image attachment was not found.');
      error.status = 404;
      error.code = 'ATTACHMENT_NOT_FOUND';
      throw error;
    }
    response.json(await analysisService.analyze(image));
  });

  router.delete('/:id', async (request, response) => {
    const removed = await removeImage(request.params.id);
    if (!removed) {
      const error = new Error('Image attachment was not found.');
      error.status = 404;
      error.code = 'ATTACHMENT_NOT_FOUND';
      throw error;
    }
    response.json({ deleted: true });
  });
  return router;
}

module.exports = { createAttachmentsRouter, ACCEPTED_IMAGE_MIME };
