import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CelPipeline, type CelFrameOptions } from './celPipeline';

export type CelRendererProps = CelFrameOptions;

/**
 * Assume o render da cena: useFrame com prioridade 1 desliga o render
 * automático do R3F. Atualiza uResolution / uPixelRatio / uTime todo quadro.
 * - edges=false: gl.render direto na tela (qualidade Low).
 * - edges=true: cena -> alvo MRT (cor, normal+máscara, profundidade) e um
 *   composite de tela cheia desenha a tinta e a vinheta. Detalhes de cor /
 *   tone mapping em celPipeline.ts.
 * O tamanho do alvo segue o drawing buffer (size × dpr × edgeScale) e é
 * conferido a cada quadro, então resize e troca de dpr são automáticos.
 */
export function CelRenderer(props: CelRendererProps) {
  const gl = useThree((s) => s.gl);
  const pipeline = useMemo(() => new CelPipeline(), [gl]);

  // libera os alvos ao desligar as bordas (qualidade Low) e ao desmontar
  useEffect(() => {
    if (!props.edges) pipeline.releaseTargets();
  }, [props.edges, pipeline]);
  useEffect(() => () => pipeline.dispose(), [pipeline]);

  useFrame((state) => {
    pipeline.render(gl, state.scene, state.camera, props, state.clock.elapsedTime);
  }, 1);

  return null;
}
