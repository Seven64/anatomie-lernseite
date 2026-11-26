import { BodySystem, Structure } from "../types";
import { formatGroupLabel } from "../utils/text";
import { REGION_LABELS, REGION_ORDER, StructureLayerFilter, sortByOrder } from "./constants";

/**
 * Reine Gruppierungslogik für den Strukturbaum (ohne DOM, unit-getestet).
 */

export function groupBySystem(structures: Structure[]): Map<BodySystem, Structure[]> {
  const groups = new Map<BodySystem, Structure[]>();
  structures.forEach(structure => {
    const list = groups.get(structure.system);
    if (list) list.push(structure);
    else groups.set(structure.system, [structure]);
  });
  return groups;
}

export function matchLayerFilter(structures: Structure[], filter: StructureLayerFilter): string[] {
  return structures
    .filter(structure => {
      const name = `${structure.nameLatin} ${structure.objectName}`;
      return filter.matches.test(name) && !filter.excludes?.test(name);
    })
    .map(structure => structure.id);
}

/** Regionen in fester anatomischer Reihenfolge (Kopf → Rücken → unbekannt). */
export function groupByRegion(structures: Structure[]): Array<[string, Structure[]]> {
  const regions = new Map<string, Structure[]>();
  structures.forEach(structure => {
    const region = structure.region || "unknown";
    const list = regions.get(region);
    if (list) list.push(structure);
    else regions.set(region, [structure]);
  });
  return sortByOrder([...regions.keys()], REGION_ORDER).map(region => [region, regions.get(region)!]);
}

export function countChildrenByParent(structures: Structure[]): Map<string, number> {
  const counts = new Map<string, number>();
  structures.forEach(structure => {
    if (structure.parentId) counts.set(structure.parentId, (counts.get(structure.parentId) ?? 0) + 1);
  });
  return counts;
}

export interface AreaGrouping {
  subgroups: Array<{ parentId: string; structures: Structure[] }>;
  individual: Structure[];
}

/**
 * Teilt die Strukturen einer Region in Untergruppen (gemeinsamer Elternknoten)
 * und Einzelstrukturen auf. Z-Anatomy-Gruppen enden auf „g“.
 */
export function groupArea(system: BodySystem, structures: Structure[], parentCounts: Map<string, number>): AreaGrouping {
  const byParent = new Map<string, Structure[]>();
  structures.forEach(structure => {
    const parentId = structure.parentId || "";
    const list = byParent.get(parentId);
    if (list) list.push(structure);
    else byParent.set(parentId, [structure]);
  });

  const result: AreaGrouping = { subgroups: [], individual: [] };
  byParent.forEach((items, parentId) => {
    const grouped = Boolean(parentId) && (
      system === "insertions" || parentId.endsWith("g") || (parentCounts.get(parentId) ?? 0) > 1
    );
    if (grouped) result.subgroups.push({ parentId, structures: items });
    else result.individual.push(...items);
  });
  return result;
}

export function parentGroupLabel(parentId: string, parent: Structure | undefined, label: (structure: Structure) => string): string {
  if (parent) return label(parent);
  return formatGroupLabel(parentId.endsWith("g") ? parentId.slice(0, -1) : parentId);
}

export function areaLabel(system: BodySystem, region: string): string {
  if (region === "unknown" && system === "insertions") return "Zuordnungen nach Knochen";
  return REGION_LABELS[region] || formatGroupLabel(region);
}
