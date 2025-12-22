
export interface ModelAnalysis {
  bodyType: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  pose: string;
  currentClothing: {
    bodyPartId: string;
    description: string;
    isPresent: boolean;
  }[];
  distinctiveFeatures: string[];
  background: string;
}

export interface ClothingAnalysis {
  type: string;
  category: string;
  bodyPartId: string;
  color: string;
  material: string;
  pattern: string;
  style: string;
  fit: string;
  details: string[];
}

export interface ClothingItem {
  id: string;
  slotId: string; // The UI slot this item occupies
  file: File;
  base64: string;
  analysis: ClothingAnalysis | null;
  customModifier?: string; // User defined style overrides (e.g. "baggy", "tucked in")
}

export interface AnalysisState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  ANALYSIS = 'ANALYSIS',
  PROMPT = 'PROMPT',
  RESULT = 'RESULT'
}

export type AspectRatio = 'Auto' | '9:16' | '2:3' | '3:4' | '1:1' | '4:3' | '3:2' | '16:9';
