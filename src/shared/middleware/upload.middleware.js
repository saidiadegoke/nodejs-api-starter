/**
 * Multer Upload Middleware
 *
 * Handles file uploads with multer
 * NOTE: Requires installation of multer
 * npm install multer
 */

const multer = require('multer');
const path = require('path');

// Configure multer to use memory storage (files stored in memory as Buffer)
// This allows us to upload directly to S3 without saving to disk
const storage = multer.memoryStorage();

// File filter function - universal approach
const fileFilter = (req, file, cb) => {
  // Define common allowed file types
  const allowedImageTypes = /jpeg|jpg|png|gif|webp|svg/;
  const allowedVideoTypes = /mp4|webm|mov|avi|mkv/;
  const allowedDocTypes = /pdf|doc|docx|txt|rtf|odt/;
  const allowedAudioTypes = /mp3|wav|ogg|m4a|aac/;
  const allowedArchiveTypes = /zip|rar|7z|tar|gz/;

  const extname = path.extname(file.originalname).toLowerCase().replace('.', '');
  const mimetype = file.mimetype;

  // Check if file type is in any allowed category
  const isValidFile =
    (allowedImageTypes.test(extname) && mimetype.startsWith('image/')) ||
    (allowedVideoTypes.test(extname) && mimetype.startsWith('video/')) ||
    (allowedDocTypes.test(extname) && (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('text'))) ||
    (allowedAudioTypes.test(extname) && mimetype.startsWith('audio/')) ||
    (allowedArchiveTypes.test(extname) && (mimetype.includes('zip') || mimetype.includes('compressed')));

  if (isValidFile) {
    return cb(null, true);
  } else {
    return cb(new Error('File type not supported. Allowed: images, videos, documents, audio, archives'));
  }
};

// Configure multer with file size limits
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: fileFilter
});

// Export different upload configurations
module.exports = {
  // Single file upload
  uploadSingle: (fieldName = 'file') => upload.single(fieldName),

  // Multiple files upload
  uploadMultiple: (fieldName = 'files', maxCount = 10) => upload.array(fieldName, maxCount),

  // Raw multer instance for custom configurations
  upload
};
