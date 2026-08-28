export const WAREHOUSE_WORKER_TEXTURES = {
  original: undefined,
  'tomas-2': '@project/assets/textures/Tomas_mat_2.jpg',
  'tomas-3': '@project/assets/textures/Tomas_mat_3.jpg',
  'tomas-4': '@project/assets/textures/Tomas_mat_4.jpg',
} as const;

export type WarehouseWorkerAppearance = keyof typeof WAREHOUSE_WORKER_TEXTURES;
