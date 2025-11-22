# SlotSync Record Identification Flow

This document outlines the identification process implemented in the SlotSync backend.

## Priority Order

1.  **Local Database (Cache)**: Fastest, stores previously identified records.
2.  **Google Vision API**: Used for text extraction (OCR) from album covers.
3.  **Discogs API**: Primary external source, comprehensive vinyl database.

---

## Detailed Flow

```mermaid
graph TD
    A[User Scans Album Cover] --> B{Image Captured};

    B --> C{Generate Image Hash};
    C --> D{Extract Text with Google Vision OCR};

    D --> E{Parse Artist & Title};

    E --> F{Search Local Database (Cache)};
    F -- Match Found --> G[Return Cached Result];
    F -- No Match --> H{Search Discogs API (Primary)};

    H -- Match Found --> I[Store in Local DB & Return Discogs Result];
    H -- No Match --> L[Return Error: Manual Entry Suggested];

    G --> M[App Displays Result];
    I --> M;
    L --> M;
```

---

## Explanation of Steps

1.  **User Scans Album Cover**: The mobile app captures an image of the album cover.
2.  **Generate Image Hash**: A unique hash is generated from the image buffer. This is used for quick lookups in the local database.
3.  **Extract Text with Google Vision OCR**:
    *   The image is sent to Google Cloud Vision API to perform Optical Character Recognition (OCR).
    *   This step is crucial for extracting readable text (artist, title, etc.) from the album cover.
    *   **Note**: Google Vision is used *only* for text extraction. It does not perform direct image-to-album matching.
4.  **Parse Artist & Title**: The extracted text is parsed to identify potential artist and album title.
5.  **Search Local Database (Cache)**:
    *   The system first checks its local SQLite database using the parsed artist/title and image hash.
    *   If a match is found, it's returned instantly (`G`). This is the fastest path.
6.  **Search Discogs API (Primary)**:
    *   If no match is found in the local cache, the system queries the Discogs API using the extracted artist and title.
    *   Discogs is prioritized due to its extensive database of vinyl releases and rich metadata.
    *   If a match is found, it's stored in the local database for future fast access and returned (`I`).
7.  **Return Error / Manual Entry**:
    *   If all automated identification methods (Local DB, Discogs) fail, an error is returned to the app (`L`).
    *   The app then prompts the user to enter the record details manually.

---

## Benefits of this Flow

*   **Speed**: Local cache provides instant results for repeated scans.
*   **Accuracy**: Discogs API offers highly accurate and detailed vinyl-specific data.
*   **User Experience**: Automated text extraction (Google Vision) reduces manual input.
*   **Compliance**: Data is stored only for the user's collection, not duplicating external databases.
