import type { MutableRefObject } from 'react';
import type { VehicleSpec } from '../../game/vehicles';
import type { VehicleFx } from './fx';
import GtrModel from './GtrModel';
import HoverShip from './HoverShip';

export default function VehicleModel({
  spec,
  fxRef,
}: {
  spec: VehicleSpec;
  fxRef: MutableRefObject<VehicleFx>;
}) {
  if (spec.kind === 'car') return <GtrModel fxRef={fxRef} />;
  return <HoverShip livery={spec.colors} fxRef={fxRef} />;
}
