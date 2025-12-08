/**
 * Vision Service Type Definitions
 * 
 * These types define the structure of Google Vision API results and
 * identification candidates extracted from those results.
 * 
 * Note: The actual Google Vision API calls happen on the backend.
 * These types are used to structure requests and parse responses.
 */

/**
 * Web entity from Google Vision Web Detection
 */
export interface WebEntity {
  description: string;
  score: number;
  url?: string;
}

/**
 * Page title from Google Vision Web Detection
 * Often contains album information from web pages
 */
export interface PageTitle {
  pageTitle: string;
  url?: string;
}

/**
 * Label from Google Vision Label Detection
 * Generic categories (e.g., "Album Cover", "Music")
 */
export interface Label {
  description: string;
  score: number;
}

/**
 * Structured result from Google Vision API
 * 
 * This is what the backend returns after processing an image
 * with Google Vision. The frontend uses this to extract candidates.
 */
export interface VisionResult {
  /** Web entities found by Vision (album names, artist names, etc.) */
  webEntities: WebEntity[];
  
  /** Page titles from web pages with matching images */
  pageTitles: PageTitle[];
  
  /** OCR text blocks extracted from the image */
  ocrTextBlocks: string[];
  
  /** Full OCR text (concatenated blocks) */
  extractedText?: string;
  
  /** Generic labels/categories detected */
  labels: Label[];
  
  /** URLs of visually similar images */
  similarImageUrls?: string[];
}

/**
 * Identification candidate extracted from Vision results
 * 
 * These candidates will be passed to Discogs + MusicBrainz
 * for final verification and metadata enrichment.
 * 
 * IMPORTANT: Suggestions must never surface Wikipedia-style list pages.
 * We only want real album titles at the end of the pipeline.
 */
export interface IdentificationCandidate {
  /** Artist name (optional - may be extracted from title) */
  artist?: string;
  
  /** Album title */
  album: string;
  
  /** Raw text that this candidate was extracted from */
  rawText: string;
  
  /** Source of the candidate */
  source: 'web_entity' | 'ocr' | 'label' | 'combined' | 'page_title';
  
  /** Confidence score (0-1) based on extraction heuristics */
  confidence: number;
  
  /** Additional metadata */
  metadata?: {
    /** Original entity score (if from web entity) */
    entityScore?: number;
    /** Line number in OCR (if from OCR) */
    lineNumber?: number;
  };
}

/**
 * Options for image preprocessing
 */
export interface ImagePreprocessingOptions {
  /** Maximum width (maintains aspect ratio) */
  maxWidth?: number;
  
  /** Maximum height (maintains aspect ratio) */
  maxHeight?: number;
  
  /** JPEG quality (0-1) */
  quality?: number;
  
  /** Whether to enhance contrast for better OCR */
  enhanceContrast?: boolean;
  
  /** Whether to convert to grayscale */
  convertToGrayscale?: boolean;
}

/**
 * Options for candidate extraction
 */
export interface CandidateExtractionOptions {
  /** Maximum number of candidates to return */
  maxCandidates?: number;
  
  /** Minimum confidence threshold */
  minConfidence?: number;
  
  /** Whether to filter out non-album content */
  filterNonAlbums?: boolean;
}

