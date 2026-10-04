/** Estado visual compartilhado entre a simulação e o modelo do veículo. */
export type VehicleFx = {
  /** 0..1, intensidade do propulsor */
  thrust: number;
  nitro: boolean;
};

export const createFx = (): VehicleFx => ({ thrust: 0, nitro: false });
