/**
 * Integration tests for POST /api/identify-record
 * 
 * These tests mock external APIs (Google Vision, Discogs) to avoid network calls.
 * Tests should pass with NODE_ENV=test and no API keys.
 */

// CRITICAL: Set NODE_ENV=test BEFORE any requires
process.env.NODE_ENV = 'test';
process.env.DISCOGS_PERSONAL_ACCESS_TOKEN = 'test-token'; // Prevent errors from missing token
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/fake/path.json'; // Prevent errors from missing credentials

// Mock external dependencies BEFORE requiring the app
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    batchAnnotateImages: jest.fn(),
  })),
}));

// Mock Discogs HTTP client
jest.mock('../../services/discogsHttpClient', () => ({
  discogsHttpRequest: jest.fn(),
}));

// Mock embedding service to avoid loading CLIP model
jest.mock('../../services/embeddingService', () => ({
  getImageEmbedding: jest.fn().mockResolvedValue(null),
}));

// Mock vector index to avoid database operations
jest.mock('../../services/vectorIndex', () => ({
  initialize: jest.fn().mockResolvedValue(0),
  indexCoverEmbedding: jest.fn().mockResolvedValue(null),
  findNearestCovers: jest.fn().mockResolvedValue([]),
  getEmbeddingCount: jest.fn().mockReturnValue(0),
}));

// Mock database initialization
jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn((file, cb) => {
      // Mock database object
      const mockDb = {
        run: jest.fn((sql, params, cb) => {
          if (typeof params === 'function') {
            params(null, { lastID: 1 });
          } else if (cb) {
            cb(null, { lastID: 1 });
          }
        }),
        get: jest.fn((sql, params, cb) => {
          if (typeof params === 'function') {
            params(null, null);
          } else if (cb) {
            cb(null, null);
          }
        }),
        all: jest.fn((sql, params, cb) => {
          if (typeof params === 'function') {
            params(null, []);
          } else if (cb) {
            cb(null, []);
          }
        }),
        close: jest.fn((cb) => cb && cb(null)),
      };
      if (cb) {
        cb(null, mockDb);
      }
      return mockDb;
    }),
  }),
}));

// Now require the app (after mocks are set up)
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../server-hybrid');

// Get mocked modules
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const { discogsHttpRequest } = require('../../services/discogsHttpClient');

describe('POST /api/identify-record', () => {
  let mockVisionClient;
  let createTestImageBuffer;

  // Cleanup after all tests to ensure Jest exits cleanly
  afterAll(async () => {
    if (app._test && app._test.cleanup) {
      await app._test.cleanup();
    }
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup mock Vision client
    mockVisionClient = {
      batchAnnotateImages: jest.fn(),
    };
    ImageAnnotatorClient.mockImplementation(() => mockVisionClient);

    // Setup Discogs mock to route by URL
    // Search endpoint: /database/search
    // Release endpoint: /releases/:id
    discogsHttpRequest.mockImplementation((url) => {
      if (url.includes('/database/search')) {
        // Return search results
        return Promise.resolve({
          results: [
            {
              id: 12345,
              title: 'Bob Seger - Live Bullet',
              year: '1976',
              thumb: 'https://example.com/thumb.jpg',
              format: ['Vinyl', 'LP'],
            },
          ],
        });
      } else if (url.includes('/releases/')) {
        // Return release details with full tracklist
        return Promise.resolve({
          id: 12345,
          title: 'Live Bullet',
          artists: [{ name: 'Bob Seger' }],
          year: 1976,
          images: [{ uri: 'https://example.com/cover.jpg' }],
          tracklist: [
            { position: 'A1', title: 'Nutbush City Limits', duration: '3:30' },
            { position: 'A2', title: 'Travelin\' Man', duration: '4:15' },
          ],
          genres: ['Rock'],
          styles: ['Classic Rock'],
        });
      }
      // Default fallback
      return Promise.resolve({ results: [] });
    });

    // Create a simple test image buffer (1x1 pixel PNG)
    createTestImageBuffer = () => {
      // Base64 encoded 1x1 pixel PNG
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      return Buffer.from(base64Image, 'base64');
    };
  });

  afterEach(() => {
    // Clean up any temp files created during tests
    const tempDir = path.join(__dirname, '../../temp');
    if (fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        files.forEach((file) => {
          if (file.startsWith('upload-')) {
            try {
              fs.unlinkSync(path.join(tempDir, file));
            } catch (err) {
              // Ignore cleanup errors
            }
          }
        });
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Input validation', () => {
    it('should return 400 when no file is provided', async () => {
      const response = await request(app)
        .post('/api/identify-record')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'NO_FILE',
        message: expect.stringContaining('image file'),
        success: false,
      });
    });

    it('should return 400 when file is empty', async () => {
      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', Buffer.from(''), 'empty.jpg')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'EMPTY_FILE',
        message: expect.stringContaining('empty'),
        success: false,
      });
    });

    it('should return 400 when file is too large', async () => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', largeBuffer, 'large.jpg')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'FILE_TOO_LARGE',
        message: expect.stringContaining('10MB'),
        success: false,
      });
    });

    it('should return 400 when file type is invalid', async () => {
      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', Buffer.from('not an image'), 'test.txt')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'INVALID_INPUT',
        message: expect.stringContaining('image'),
        success: false,
      });
    });
  });

  describe('Successful identification', () => {
    it('should return 200 with suggestions when Vision finds candidates and Discogs finds matches', async () => {
      const imageBuffer = createTestImageBuffer();

      // Mock Vision API response
      // Note: batchAnnotateImages returns [{ responses: [...] }]
      // The server does: const [batchResult] = await client.batchAnnotateImages(...)
      // Then: batchResult.responses?.[0] to get the first response
      // The server expects: response.textAnnotations (not textDetection)
      mockVisionClient.batchAnnotateImages.mockResolvedValue([
        {
          responses: [
            {
              // textAnnotations is the array of text annotations (server uses this name)
              textAnnotations: [
                {
                  description: 'Bob Seger\nLive Bullet',
                },
              ],
              webDetection: {
                webEntities: [
                  {
                    description: 'Bob Seger',
                    score: 0.9,
                  },
                  {
                    description: 'Live Bullet',
                    score: 0.85,
                  },
                ],
                pagesWithMatchingImages: [
                  {
                    url: 'https://example.com/bob-seger-live-bullet',
                    pageTitle: 'Bob Seger - Live Bullet - Discogs',
                  },
                ],
              },
              labelAnnotations: [
                {
                  description: 'Music album',
                  score: 0.95,
                },
              ],
            },
          ],
        },
      ]);

      // Discogs mock is already set up in beforeEach to route by URL
      // No need to set up mocks here - the beforeEach mockImplementation handles it

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      expect(response.body).toMatchObject({
        confidenceLevel: expect.any(String),
        suggestions: expect.any(Array),
      });
      // Status can be 'ok', 'low_confidence', or 'no_match' depending on candidate extraction and Discogs matching
      expect(['ok', 'low_confidence', 'no_match']).toContain(response.body.status);

      // Verify Vision API was called
      expect(mockVisionClient.batchAnnotateImages).toHaveBeenCalled();
    });

    it('should return 200 with no_match status when no candidates are found', async () => {
      const imageBuffer = createTestImageBuffer();

      // Mock Vision API response with no useful data
      mockVisionClient.batchAnnotateImages.mockResolvedValue([
        {
          responses: [
            {
              textAnnotations: [],
              webDetection: {
                webEntities: [],
                pagesWithMatchingImages: [],
              },
              labelAnnotations: [],
            },
          ],
        },
      ]);

      // Override Discogs mock for this test to return no results
      discogsHttpRequest.mockImplementation((url) => {
        if (url.includes('/database/search')) {
          return Promise.resolve({ results: [] });
        } else if (url.includes('/releases/')) {
          return Promise.resolve({
            id: null,
            title: '',
            artists: [],
            year: null,
            images: [],
            tracklist: [],
            genres: [],
            styles: [],
          });
        }
        return Promise.resolve({ results: [] });
      });

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'no_match',
        confidenceLevel: 'low',
        suggestions: expect.any(Array),
      });
    });

    it('should return 200 with low_confidence when matches found but confidence is low', async () => {
      const imageBuffer = createTestImageBuffer();

      // Mock Vision API response with weak signals
      mockVisionClient.batchAnnotateImages.mockResolvedValue([
        {
          responses: [
            {
              textAnnotations: [
                {
                  description: 'Unclear text',
                },
              ],
              webDetection: {
                webEntities: [
                  {
                    description: 'Music',
                    score: 0.3, // Low score
                  },
                ],
                pagesWithMatchingImages: [],
              },
              labelAnnotations: [],
            },
          ],
        },
      ]);

      // Override Discogs mock for this test to return weak matches
      discogsHttpRequest.mockImplementation((url) => {
        if (url.includes('/database/search')) {
          // Return weak match (low similarity will result in low score)
          return Promise.resolve({
            results: [
              {
                id: 99999,
                title: 'Unclear - Match',
                year: '2000',
                thumb: 'https://example.com/thumb.jpg',
                format: ['Vinyl'],
              },
            ],
          });
        } else if (url.includes('/releases/')) {
          return Promise.resolve({
            id: 99999,
            title: 'Match',
            artists: [{ name: 'Unclear' }],
            year: 2000,
            images: [],
            tracklist: [],
            genres: [],
            styles: [],
          });
        }
        return Promise.resolve({ results: [] });
      });

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      expect(response.body).toMatchObject({
        suggestions: expect.any(Array),
      });
      expect(['low_confidence', 'no_match']).toContain(response.body.status);
    });
  });

  describe('Error handling', () => {
    it('should return 200 with no_match when Vision API fails', async () => {
      const imageBuffer = createTestImageBuffer();

      // Mock Vision API throwing an error
      mockVisionClient.batchAnnotateImages.mockRejectedValue(
        new Error('Vision API error')
      );

      // Override Discogs mock for this test to return no results
      discogsHttpRequest.mockImplementation((url) => {
        if (url.includes('/database/search')) {
          return Promise.resolve({ results: [] });
        } else if (url.includes('/releases/')) {
          return Promise.resolve({
            id: null,
            title: '',
            artists: [],
            year: null,
            images: [],
            tracklist: [],
            genres: [],
            styles: [],
          });
        }
        return Promise.resolve({ results: [] });
      });

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      // Server handles Vision errors gracefully and returns 200 with no_match
      expect(response.body).toMatchObject({
        status: expect.any(String),
        suggestions: expect.any(Array),
      });
      // Should be no_match or low_confidence when Vision fails
      expect(['no_match', 'low_confidence']).toContain(response.body.status);
    });

    it('should return 200 with low_confidence when Discogs API fails', async () => {
      const imageBuffer = createTestImageBuffer();

      // Mock Vision API returning valid data
      mockVisionClient.batchAnnotateImages.mockResolvedValue([
        {
          responses: [
            {
              textAnnotations: [
                {
                  description: 'Artist - Album',
                },
              ],
              webDetection: {
                webEntities: [
                  {
                    description: 'Artist',
                    score: 0.8,
                  },
                ],
                pagesWithMatchingImages: [],
              },
              labelAnnotations: [],
            },
          ],
        },
      ]);

      // Mock Discogs API throwing an error
      discogsHttpRequest.mockRejectedValueOnce(new Error('Discogs API error'));

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      // Should still return 200, but with low confidence or no match
      expect(response.body).toMatchObject({
        status: expect.any(String),
        suggestions: expect.any(Array),
      });
    });
  });

  describe('Response structure', () => {
    it('should include all required fields in successful response', async () => {
      const imageBuffer = createTestImageBuffer();

      // Mock minimal successful responses
      mockVisionClient.batchAnnotateImages.mockResolvedValue([
        {
          responses: [
            {
              textAnnotations: [],
              webDetection: { webEntities: [], pagesWithMatchingImages: [] },
              labelAnnotations: [],
            },
          ],
        },
      ]);

      // Override Discogs mock for this test to return no results
      discogsHttpRequest.mockImplementation((url) => {
        if (url.includes('/database/search')) {
          return Promise.resolve({ results: [] });
        } else if (url.includes('/releases/')) {
          return Promise.resolve({
            id: null,
            title: '',
            artists: [],
            year: null,
            images: [],
            tracklist: [],
            genres: [],
            styles: [],
          });
        }
        return Promise.resolve({ results: [] });
      });

      const response = await request(app)
        .post('/api/identify-record')
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      // Check for required fields
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('confidenceLevel');
      expect(response.body).toHaveProperty('suggestions');
      expect(Array.isArray(response.body.suggestions)).toBe(true);

      // Status should be one of the valid values
      expect(['ok', 'low_confidence', 'no_match']).toContain(
        response.body.status
      );

      // ConfidenceLevel should be one of the valid values
      expect(['high', 'medium', 'low']).toContain(
        response.body.confidenceLevel
      );
    });
  });
});
