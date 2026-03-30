/**
 * Feedback Repository
 * 
 * Logs user feedback and corrections for future learning.
 * 
 * Stores:
 * - imageHash
 * - final_record_id / discogsId
 * - candidate_data (scores, Discogs IDs considered)
 * - vision/OCR summary
 * - timestamp
 * - source (scan/manual/multiple-choice)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const config = require('../config');
const DB_PATH = config.database.path;

let db = null;

/**
 * Initialize feedback table
 */
function initFeedbackTable(database) {
  return new Promise((resolve, reject) => {
    database.run(`
      CREATE TABLE IF NOT EXISTS identification_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_hash TEXT NOT NULL,
        final_record_id TEXT,
        final_discogs_id TEXT,
        candidate_data TEXT NOT NULL,
        vision_summary TEXT,
        ocr_summary TEXT,
        embedding_summary TEXT,
        source TEXT DEFAULT 'scan',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(image_hash, final_discogs_id)
      )
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        // Create index for fast lookups
        database.run(`
          CREATE INDEX IF NOT EXISTS idx_feedback_hash ON identification_feedback(image_hash)
        `, (err) => {
          if (err) {
            console.warn('[Feedback] Index creation warning:', err.message);
          }
          resolve();
        });
      }
    });
  });
}

/**
 * Log user feedback
 * 
 * @param {Object} feedback - Feedback data
 * @param {string} feedback.imageHash - Image hash
 * @param {string} feedback.finalRecordId - Final chosen record ID
 * @param {string} feedback.finalDiscogsId - Final chosen Discogs ID
 * @param {Array} feedback.candidates - Array of candidates with scores
 * @param {Object} feedback.visionSummary - Vision extraction summary
 * @param {Object} feedback.ocrSummary - OCR parsing summary
 * @param {Object} feedback.embeddingSummary - Embedding computation summary
 * @param {string} feedback.source - Source: 'scan', 'manual', 'multiple-choice'
 */
async function logFeedback(feedback) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const {
      imageHash,
      finalRecordId,
      finalDiscogsId,
      candidates = [],
      visionSummary = {},
      ocrSummary = {},
      embeddingSummary = {},
      source = 'scan',
    } = feedback;

    if (!imageHash) {
      reject(new Error('imageHash is required'));
      return;
    }

    const candidateData = JSON.stringify(candidates);
    const visionData = JSON.stringify(visionSummary);
    const ocrData = JSON.stringify(ocrSummary);
    const embeddingData = JSON.stringify(embeddingSummary);

    db.run(`
      INSERT OR REPLACE INTO identification_feedback 
      (image_hash, final_record_id, final_discogs_id, candidate_data, vision_summary, ocr_summary, embedding_summary, source, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [imageHash, finalRecordId || null, finalDiscogsId || null, candidateData, visionData, ocrData, embeddingData, source], (err) => {
      if (err) {
        console.error('[Feedback] Error logging feedback:', err.message);
        reject(err);
      } else {
        console.log(`[Feedback] ✅ Logged feedback for imageHash: ${imageHash.substring(0, 16)}...`);
        resolve();
      }
    });
  });
}

/**
 * Get feedback for an image hash
 * 
 * @param {string} imageHash - Image hash
 * @returns {Promise<Object|null>} Feedback data or null
 */
async function getFeedback(imageHash) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.get(`
      SELECT * FROM identification_feedback 
      WHERE image_hash = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [imageHash], (err, row) => {
      if (err) {
        reject(err);
      } else if (row) {
        resolve({
          imageHash: row.image_hash,
          finalRecordId: row.final_record_id,
          finalDiscogsId: row.final_discogs_id,
          candidates: JSON.parse(row.candidate_data || '[]'),
          visionSummary: JSON.parse(row.vision_summary || '{}'),
          ocrSummary: JSON.parse(row.ocr_summary || '{}'),
          source: row.source,
          timestamp: row.timestamp,
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Initialize feedback repository with database connection
 * 
 * @param {Object} database - SQLite database connection
 */
async function initFeedbackRepository(database) {
  db = database;
  await initFeedbackTable(database);
  console.log('[Feedback] ✅ Feedback repository initialized');
}

module.exports = {
  logFeedback,
  getFeedback,
  initFeedbackRepository,
};

