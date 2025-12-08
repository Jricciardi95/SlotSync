export type Row = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Unit = {
  id: string;
  name: string;
  rowId: string | null;
  positionIndex: number;
  ipAddress: string;
  totalSlots: number;
  createdAt: string;
  updatedAt: string;
};

export type ShelfSlotGroup = {
  id: string;
  unitId: string;
  physicalSlots: number[];
  recordId?: string | null;
};

// Alias as RecordModel to avoid clashing with TS utility type
export type RecordModel = {
  id: string;
  title: string;
  artist: string;
  artistLastName?: string | null;
  year?: number | null;
  genre?: string | null;
  notes?: string | null;
  coverImageLocalUri?: string | null;
  coverImageRemoteUrl?: string | null;
  discogsId?: string | null;
  musicbrainzId?: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Image hash entry for caching identified albums
 */
export type ImageHash = {
  id: string;
  imageHash: string;
  recordId: string;
  submittedImageUri?: string | null;
  createdAt: string;
};

export type SlotSyncRecord = RecordModel;

export type RecordLocation = {
  id: string;
  recordId: string;
  unitId: string;
  slotNumbers: number[];
};

export type RecordLocationDetails = RecordLocation & {
  unitName: string;
  rowName: string | null;
};

export type Session = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  cleanedUp: boolean;
};

export type SessionRecord = {
  id: string;
  sessionId: string;
  recordId: string;
  pulledAt: string;
  returnedAt?: string | null;
};

export type Track = {
  id: string;
  recordId: string;
  title: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  side?: string | null;
  durationSeconds?: number | null;
};

export type BatchJob = {
  id: string;
  createdAt: string;
  completedAt?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
};

export type BatchPhoto = {
  id: string;
  jobId: string;
  photoUri: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  resultData?: string | null;
  errorMessage?: string | null;
  processedAt?: string | null;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaylistItem = {
  id: string;
  playlistId: string;
  itemType: 'record' | 'track';
  recordId: string | null;
  trackId: string | null;
  position: number;
  addedAt: string;
};

// Legacy type alias for backward compatibility
export type PlaylistRecord = PlaylistItem;

