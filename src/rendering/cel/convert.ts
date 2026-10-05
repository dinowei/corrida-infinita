import * as THREE from 'three';
import { CelMaterial, isCelMaterial, type CelMaterialOptions } from './celMaterial';
import { addOutline, createOutlineMaterial } from './outline';

export type CelifyOptions = {
  /** adiciona casco invertido aos meshes opacos (padrão true) */
  outline?: boolean;
  /** multiplicador de espessura do contorno (padrão 1) */
  outlineThickness?: number;
  /** rim aplicado aos materiais convertidos (padrão 0.6: pensado para veículos) */
  rim?: number;
  /**
   * Ajuste fino por material: recebe o material original e as opções já
   * deduzidas; o retorno é mesclado por cima.
   */
  override?: (source: THREE.Material, mesh: THREE.Mesh) => Partial<CelMaterialOptions> | void;
  /**
   * Opt-in: traduz PBR para destaques cel (metalness -> reflexo em faixas,
   * roughness < 0.5 -> mancha especular; Phong.specular -> especular).
   * Desligado por padrão: em GLB denso/high-poly isso vira "chuvisco cromado"
   * (centenas de ilhas de reflexo, cada uma com tinta em volta).
   */
  pbrHighlights?: boolean;
  /**
   * máscara de borda dos materiais OPACOS convertidos (padrão 1). Use 0 em
   * modelos densos para tirá-los da tinta de vincos/silhuetas do
   * pós-processo (o casco invertido, se `outline`, continua). Transparentes
   * ficam sempre em 0.
   */
  edgeMask?: 0 | 1;
  /** descarta os materiais originais após a troca (padrão false: podem ser compartilhados) */
  disposeOld?: boolean;
};

type ConvertibleMaterial =
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial
  | THREE.MeshBasicMaterial
  | THREE.MeshLambertMaterial
  | THREE.MeshPhongMaterial;

function isConvertible(m: THREE.Material): m is ConvertibleMaterial {
  const f = m as unknown as Record<string, boolean>;
  return !!(f.isMeshStandardMaterial || f.isMeshBasicMaterial || f.isMeshLambertMaterial || f.isMeshPhongMaterial);
}

/** deduz as opções cel a partir de um material nativo do three */
export function celOptionsFromMaterial(
  src: ConvertibleMaterial,
  rim: number,
  extra: { pbrHighlights?: boolean; edgeMask?: 0 | 1 } = {},
): CelMaterialOptions {
  const opts: CelMaterialOptions = {
    name: src.name ? `${src.name}_cel` : undefined,
    color: src.color.clone(),
    map: src.map ?? null,
    vertexColors: src.vertexColors,
    transparent: src.transparent,
    opacity: src.opacity,
    side: src.side,
    rim,
    depthWrite: src.depthWrite,
    // transparente: sempre fora do G-buffer (ver CelMaterialOptions.edgeMask)
    edgeMask: src.transparent ? 0 : (extra.edgeMask ?? 1),
  };

  if ((src as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    // MeshBasic já era "sem luz": continua chapado
    opts.unlit = true;
    opts.rim = 0;
    return opts;
  }

  const lit = src as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;
  opts.emissive = lit.emissive.clone();
  opts.emissiveIntensity = lit.emissiveIntensity;
  opts.flatShading = lit.flatShading;

  if (!extra.pbrHighlights) return opts;

  if ((src as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const std = src as THREE.MeshStandardMaterial;
    // metal vira reflexo em faixas; superfície lisa ganha a mancha especular
    opts.reflect = THREE.MathUtils.clamp(std.metalness * 0.55, 0, 0.55);
    opts.specular = std.roughness < 0.5 ? 0.6 : 0;
    opts.shininess = THREE.MathUtils.lerp(96, 24, THREE.MathUtils.clamp(std.roughness * 2, 0, 1));
  } else if ((src as THREE.MeshPhongMaterial).isMeshPhongMaterial) {
    const phong = src as THREE.MeshPhongMaterial;
    opts.specular = phong.specular.getHSL({ h: 0, s: 0, l: 0 }).l > 0.15 ? 0.5 : 0;
    opts.shininess = Math.max(8, phong.shininess);
  }
  return opts;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  const pos = geometry.getAttribute('position');
  if (!pos) return 0;
  const total = index ? index.count : pos.count;
  const drawn = Math.min(total, geometry.drawRange.count === Infinity ? total : geometry.drawRange.count);
  return Math.floor(drawn / 3);
}

/**
 * Troca os materiais nativos (Standard/Physical/Basic/Lambert/Phong) de toda a
 * hierarquia por CelMaterial, preservando cor, textura, emissivo, cor por
 * vértice, transparência/opacidade e lado; e adiciona contorno de casco
 * invertido aos meshes opacos. Feito para o GLB legado do carro.
 * Materiais compartilhados são convertidos uma vez só. Devolve o próprio objeto.
 */
export function celify<T extends THREE.Object3D>(object: T, opts: CelifyOptions = {}): T {
  const rim = opts.rim ?? 0.6;
  const wantOutline = opts.outline ?? true;
  const converted = new Map<THREE.Material, THREE.Material>();
  const outlineMaterial = wantOutline ? createOutlineMaterial({ thicknessPx: opts.outlineThickness ?? 1 }) : null;

  // coleta antes de mexer: o traversal não pode ver os contornos recém-criados
  const meshes: THREE.Mesh[] = [];
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.celOutline !== true) meshes.push(o as THREE.Mesh);
  });

  const convert = (m: THREE.Material, mesh: THREE.Mesh): THREE.Material => {
    if (isCelMaterial(m) || !isConvertible(m)) return m;
    const cached = converted.get(m);
    if (cached) return cached;
    const base = celOptionsFromMaterial(m, rim, { pbrHighlights: opts.pbrHighlights, edgeMask: opts.edgeMask });
    const extra = opts.override?.(m, mesh) ?? {};
    const cel = new CelMaterial({ ...base, ...extra });
    converted.set(m, cel);
    return cel;
  };

  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => convert(m, mesh));
    mesh.material = Array.isArray(mesh.material) ? next : next[0];

    if (!outlineMaterial) continue;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) continue; // casco não acompanha ossos
    if (triangleCount(mesh.geometry) === 0) continue;
    if (next.every((m) => m.transparent)) continue; // vidro sem contorno
    addOutline(mesh, { material: outlineMaterial });
  }

  if (opts.disposeOld) {
    for (const old of converted.keys()) old.dispose();
  }
  return object;
}
