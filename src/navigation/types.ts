export type RootTabParamList = {
  Library: undefined;
  Stands: undefined;
  Modes: undefined;
  Batch: undefined;
  Settings: undefined;
};

export type StandsStackParamList = {
  RowsHome: undefined;
  RowDetail: { rowId: string; rowName: string };
  UnitLayout: { unitId: string; unitName?: string };
};

export type LibraryStackParamList = {
  LibraryHome: { returnToTab?: 'ALBUMS' | 'ARTISTS' | 'SONGS' | 'ALL' } | undefined;
  AddRecord: { 
    imageUri?: string; 
    initialArtist?: string; 
    initialTitle?: string; 
    initialYear?: number;
    identifiedImageUrl?: string;
  };
  ScanRecord: undefined;
  RecordDetail: { recordId: string; returnToTab?: 'ALBUMS' | 'ARTISTS' | 'SONGS' | 'ALL' };
  EditRecord: { recordId: string };
  SongDetail: { trackTitle: string; returnToTab?: 'ALBUMS' | 'ARTISTS' | 'SONGS' | 'ALL' };
  CSVImport: undefined;
  BatchScan: undefined;
  BatchReview: { photoIds?: string[]; jobId?: string; autoStart?: boolean };
  DevTest: undefined; // Dev-only test screen
};

export type ModesStackParamList = {
  ModesHome: undefined;
  LoadModeStart: undefined;
  LoadModeFlow: {
    rowId: string;
    rowName: string;
    organizationRule: 'title' | 'artist' | 'artistLastName' | 'year';
  };
  CleanupModeHome: undefined;
  CleanupModeFlow: {
    sessionIds: string[];
  };
  ReorganizeModeStart: undefined;
  ReorganizeModeFlow: {
    rowId: string;
    rowName: string;
    organizationRule: 'title' | 'artist' | 'artistLastName' | 'year';
  };
};

