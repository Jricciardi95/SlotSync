const randomChunk = () => Math.random().toString(36).slice(2, 8);

export const generateId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${randomChunk()}`;

