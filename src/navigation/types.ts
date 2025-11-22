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
  LibraryHome: undefined;
  AddRecord: { imageUri?: string };
  ScanRecord: undefined;
  RecordDetail: { recordId: string };
  SongDetail: { trackTitle: string };
  CSVImport: undefined;
  BatchScan: undefined;
  BatchReview: { photoIds?: string[]; jobId?: string };
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

