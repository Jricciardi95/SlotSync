import React, { createContext, useContext, useState, ReactNode } from 'react';

export type PendingPhoto = {
  id: string;
  uri: string;
  timestamp: number;
};

type BatchScanContextType = {
  pendingPhotos: PendingPhoto[];
  addPhoto: (photo: PendingPhoto) => void;
  removePhoto: (photoId: string) => void;
  clearPhotos: () => void;
  getPhotoById: (photoId: string) => PendingPhoto | undefined;
};

const BatchScanContext = createContext<BatchScanContextType | undefined>(undefined);

export const BatchScanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  const addPhoto = (photo: PendingPhoto) => {
    setPendingPhotos((prev) => [...prev, photo]);
  };

  const removePhoto = (photoId: string) => {
    setPendingPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const clearPhotos = () => {
    setPendingPhotos([]);
  };

  const getPhotoById = (photoId: string) => {
    return pendingPhotos.find((p) => p.id === photoId);
  };

  return (
    <BatchScanContext.Provider
      value={{
        pendingPhotos,
        addPhoto,
        removePhoto,
        clearPhotos,
        getPhotoById,
      }}
    >
      {children}
    </BatchScanContext.Provider>
  );
};

export const useBatchScan = () => {
  const context = useContext(BatchScanContext);
  if (!context) {
    throw new Error('useBatchScan must be used within BatchScanProvider');
  }
  return context;
};

