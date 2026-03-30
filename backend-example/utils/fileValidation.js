/**
 * File Validation Utilities
 * 
 * Provides magic-byte validation for uploaded files to prevent spoofing.
 */

/**
 * Magic bytes (file signatures) for supported image formats
 */
const MAGIC_BYTES = {
  // JPEG: FF D8 FF
  jpeg: [0xFF, 0xD8, 0xFF],
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  // GIF: 47 49 46 38 (GIF8)
  gif: [0x47, 0x49, 0x46, 0x38],
  // WebP: RIFF...WEBP
  webp: [0x52, 0x49, 0x46, 0x46], // Must check for "WEBP" at offset 8
  // HEIC: ftyp...heic or ftyp...mif1
  heic: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
};

/**
 * Validate file magic bytes match the declared MIME type
 * 
 * @param {Buffer} buffer - File buffer to validate
 * @param {string} mimeType - Declared MIME type (e.g., 'image/jpeg')
 * @returns {Object} { valid: boolean, reason?: string, detectedType?: string }
 */
function validateMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, reason: 'File too small to validate' };
  }

  const header = buffer.slice(0, 12);
  
  // Check JPEG
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    const detectedType = mimeType.includes('jpeg') || mimeType.includes('jpg') 
      ? 'image/jpeg' 
      : 'image/jpeg';
    return { valid: true, detectedType };
  }
  
  // Check PNG
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47 &&
      header[4] === 0x0D && header[5] === 0x0A && header[6] === 0x1A && header[7] === 0x0A) {
    const detectedType = mimeType.includes('png') ? 'image/png' : 'image/png';
    return { valid: true, detectedType };
  }
  
  // Check GIF
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    const detectedType = mimeType.includes('gif') ? 'image/gif' : 'image/gif';
    return { valid: true, detectedType };
  }
  
  // Check WebP (RIFF...WEBP)
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
    // Check for "WEBP" at offset 8
    if (buffer.length >= 12) {
      const webpCheck = buffer.slice(8, 12).toString('ascii');
      if (webpCheck === 'WEBP') {
        const detectedType = mimeType.includes('webp') ? 'image/webp' : 'image/webp';
        return { valid: true, detectedType };
      }
    }
  }
  
  // Check HEIC/HEIF (ftyp...heic or ftyp...mif1)
  // HEIC files start with ftyp box at offset 4
  if (buffer.length >= 12) {
    const ftypCheck = buffer.slice(4, 8).toString('ascii');
    if (ftypCheck === 'ftyp') {
      const brandCheck = buffer.slice(8, 12).toString('ascii').toLowerCase();
      if (brandCheck.includes('heic') || brandCheck.includes('mif1') || brandCheck.includes('msf1')) {
        const detectedType = mimeType.includes('heic') || mimeType.includes('heif') 
          ? 'image/heic' 
          : 'image/heic';
        return { valid: true, detectedType };
      }
    }
  }
  
  return { 
    valid: false, 
    reason: `File magic bytes do not match declared type "${mimeType}". File may be corrupted or spoofed.` 
  };
}

/**
 * Check if MIME type is allowed
 * 
 * @param {string} mimeType - MIME type to check
 * @returns {boolean}
 */
function isAllowedMimeType(mimeType) {
  const allowed = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
  ];
  return allowed.some(allowedType => mimeType.toLowerCase().includes(allowedType.split('/')[1]));
}

module.exports = {
  validateMagicBytes,
  isAllowedMimeType,
};


