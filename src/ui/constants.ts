import { BodySystem, CuttingAxis } from "../types";

export const CUTTING_AXES: Array<{ axis: CuttingAxis; label: string }> = [
  { axis: "vertical", label: "Von oben nach unten" },
  { axis: "rightLeft", label: "Von rechts nach links" },
  { axis: "frontBack", label: "Von vorne nach hinten" },
];

export const SYSTEM_LABELS: Record<BodySystem, string> = {
  skeletal: "Skelett",
  muscular: "Muskulatur",
  articular: "Gelenke",
  nervous: "Nervensystem",
  cardiovascular: "Herz und Gefäße",
  respiratory: "Atmungssystem",
  digestive: "Verdauungssystem",
  urinary: "Harnsystem",
  reproductive: "Fortpflanzungssystem",
  lymphatic: "Lymphsystem",
  endocrine: "Hormonsystem",
  integumentary: "Haut",
  sensory: "Sinnesorgane",
  visceral: "Innere Organe",
  regions: "Körperregionen",
  insertions: "Muskelansätze",
  unknown: "Weitere Strukturen",
};

export const SYSTEM_ORDER: BodySystem[] = [
  "skeletal", "articular", "muscular", "insertions", "cardiovascular",
  "lymphatic", "nervous", "visceral", "regions",
];

export const REGION_LABELS: Record<string, string> = {
  head: "Kopf",
  neck: "Hals",
  thorax: "Brustkorb",
  abdomen: "Bauch",
  pelvis: "Becken",
  back: "Rücken",
  unknown: "Nicht regional zugeordnet",
};

export const REGION_ORDER = ["head", "neck", "thorax", "abdomen", "pelvis", "back", "unknown"];

export interface StructureLayerFilter {
  id: string;
  label: string;
  matches: RegExp;
  excludes?: RegExp;
}

export const STRUCTURE_LAYERS: Partial<Record<BodySystem, StructureLayerFilter[]>> = {
  muscular: [
    { id: "muscles", label: "Muskeln und Begleitstrukturen", matches: /./i, excludes: /tendon|tendinous/i },
    { id: "tendons", label: "Sehnen", matches: /tendon|tendinous/i },
  ],
  cardiovascular: [
    { id: "arteries", label: "Arterien", matches: /artery|arterial|arteries|aort|pulmonary trunk/i },
    { id: "veins", label: "Venen", matches: /vein|venous|sinus|plexus/i },
    {
      id: "heart",
      label: "Herz",
      matches: /heart|cardiac|ventricle|atrium|valve|leaflet|papillary|septum|sulcus|apex|border|surface|base|notch|atrio|valvular/i,
      excludes: /artery|arterial|arteries|aort|pulmonary trunk|vein|venous|sinus|plexus/i,
    },
  ],
};

/** Systeme, deren Kopfzeile einen Schicht-Slider statt eines Deckkraft-Sliders erhält. */
export const LAYERED_SYSTEMS: BodySystem[] = ["muscular"];

/** Sortiert Werte nach einer Vorgabeliste; unbekannte Werte kommen ans Ende. */
export function sortByOrder<T>(values: T[], order: readonly T[]): T[] {
  const rank = (value: T) => {
    const index = order.indexOf(value);
    return index < 0 ? order.length : index;
  };
  return [...values].sort((a, b) => rank(a) - rank(b));
}

export function systemLabel(system: string): string {
  return SYSTEM_LABELS[system as BodySystem] ?? system;
}

export function regionLabel(region: string): string {
  return REGION_LABELS[region] ?? region;
}
