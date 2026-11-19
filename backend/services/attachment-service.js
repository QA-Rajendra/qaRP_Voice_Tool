const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const UPLOAD_DIRECTORY = path.join(__dirname, '..', '..', 'uploads');
const SIGNATURES = [
  { mimeType: 'image/png', extension: '.png', matches: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/jpeg', extension: '.jpg', matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mimeType: 'image/webp', extension: '.webp', matches: (bytes) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
  { mimeType: 'image/gif', extension: '.gif', matches: (bytes) => bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) },
];

function detectImageType(bytes) {
  return SIGNATURES.find((signature) => signature.matches(bytes)) || null;
}

function cleanDisplayName(name) {
  return path.basename(name || 'image').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150) || 'image';
}

async function saveImage(file) {
  const signature = detectImageType(file.buffer);
  if (!signature || signature.mimeType !== file.mimetype) {
    const error = new Error('The uploaded file content does not match an allowed image type.');
    error.status = 415;
    error.code = 'INVALID_IMAGE_CONTENT';
    throw error;
  }
  await fs.mkdir(UPLOAD_DIRECTORY, { recursive: true });
  const id = randomUUID();
  await fs.writeFile(path.join(UPLOAD_DIRECTORY, `${id}${signature.extension}`), file.buffer, { flag: 'wx' });
  return { id, name: cleanDisplayName(file.originalname), mimeType: signature.mimeType, size: file.size };
}

function validateId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

async function resolveImage(id) {
  if (!validateId(id)) return null;
  for (const signature of SIGNATURES) {
    const filepath = path.join(UPLOAD_DIRECTORY, `${id}${signature.extension}`);
    try {
      const buffer = await fs.readFile(filepath);
      return { filepath, buffer, mimeType: signature.mimeType };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

async function removeImage(id) {
  const image = await resolveImage(id);
  if (!image) return false;
  await fs.unlink(image.filepath);
  return true;
}

module.exports = { saveImage, resolveImage, removeImage, detectImageType, validateId, cleanDisplayName };
