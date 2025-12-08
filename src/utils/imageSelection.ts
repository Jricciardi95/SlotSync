/**
 * Image Selection Utilities
 * 
 * Unified rule for album cover image selection:
 * 1. ALWAYS prefer coverImageRemoteUrl (HD from APIs) if it exists
 * 2. ONLY use coverImageLocalUri (user photo) if no remote URL exists
 * 3. Use placeholder if neither exists
 */

/**
 * Determines if we should use a remote cover image
 * Returns true if coverImageRemoteUrl exists and is valid
 */
export function shouldUseRemoteCoverImage(coverImageRemoteUrl: string | null | undefined): boolean {
  return !!(coverImageRemoteUrl && coverImageRemoteUrl.trim().length > 0);
}

/**
 * Gets the display URI for an album cover
 * Priority: coverImageRemoteUrl > coverImageLocalUri > null
 */
export function getCoverImageUri(
  coverImageRemoteUrl: string | null | undefined,
  coverImageLocalUri: string | null | undefined
): string | null {
  if (shouldUseRemoteCoverImage(coverImageRemoteUrl)) {
    return coverImageRemoteUrl!;
  }
  if (coverImageLocalUri && coverImageLocalUri.trim().length > 0) {
    return coverImageLocalUri;
  }
  return null;
}

/**
 * Prepares image fields for record creation/update
 * 
 * Rule: If coverImageRemoteUrl exists, DO NOT save coverImageLocalUri
 * Only save coverImageLocalUri if no remote URL exists
 * 
 * @param coverImageRemoteUrl - HD cover image from metadata API (Discogs/MusicBrainz/CAA)
 * @param coverImageLocalUri - User-submitted photo (camera/library)
 * @returns Object with coverImageRemoteUrl and coverImageLocalUri properly set
 */
export function prepareImageFields(
  coverImageRemoteUrl: string | null | undefined,
  coverImageLocalUri: string | null | undefined
): {
  coverImageRemoteUrl: string | null;
  coverImageLocalUri: string | null;
} {
  const hasRemote = shouldUseRemoteCoverImage(coverImageRemoteUrl);
  
  if (hasRemote) {
    // CRITICAL: If remote URL exists, DO NOT save local image
    // The HD image from API takes precedence
    console.log('[ImageSelection] ✅ Using HD cover art from API, ignoring user photo');
    return {
      coverImageRemoteUrl: coverImageRemoteUrl!,
      coverImageLocalUri: null, // Explicitly set to null - user photo is overridden
    };
  }
  
  // No remote URL - use local image if available
  if (coverImageLocalUri && coverImageLocalUri.trim().length > 0) {
    console.log('[ImageSelection] 📸 Using user photo (no metadata match found)');
    return {
      coverImageRemoteUrl: null,
      coverImageLocalUri: coverImageLocalUri,
    };
  }
  
  // No image available
  console.log('[ImageSelection] ⚠️  No cover image available');
  return {
    coverImageRemoteUrl: null,
    coverImageLocalUri: null,
  };
}

