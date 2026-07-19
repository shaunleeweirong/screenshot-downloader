export type Tool =
  | 'select' | 'arrow' | 'rect' | 'ellipse' | 'line'
  | 'text' | 'highlight' | 'blur' | 'step' | 'crop';

export interface Point { x: number; y: number; }
export interface Box { x: number; y: number; w: number; h: number; }

export interface Style {
  stroke: string;      // stroke / text / step-badge color
  strokeWidth: number;
  fill: string;        // 'none' or a color
  opacity: number;     // 0..1, used by highlight + fills
  fontSize: number;    // text size / step badge radius
}

interface Id { id: string; }
export interface ArrowAnnot     extends Id { type: 'arrow';     x1: number; y1: number; x2: number; y2: number; style: Style; }
export interface LineAnnot      extends Id { type: 'line';      x1: number; y1: number; x2: number; y2: number; style: Style; }
export interface RectAnnot      extends Id { type: 'rect';      x: number; y: number; w: number; h: number; style: Style; }
export interface EllipseAnnot   extends Id { type: 'ellipse';   x: number; y: number; w: number; h: number; style: Style; }
export interface HighlightAnnot extends Id { type: 'highlight'; x: number; y: number; w: number; h: number; style: Style; }
export interface BlurAnnot      extends Id { type: 'blur';      x: number; y: number; w: number; h: number; block: number; }
export interface TextAnnot      extends Id { type: 'text';      x: number; y: number; text: string; style: Style; }
export interface StepAnnot      extends Id { type: 'step';      x: number; y: number; n: number; style: Style; }

export type Annotation =
  | ArrowAnnot | LineAnnot | RectAnnot | EllipseAnnot
  | HighlightAnnot | BlurAnnot | TextAnnot | StepAnnot;

export interface Scene { annotations: Annotation[]; nextStep: number; }

export const emptyScene = (): Scene => ({ annotations: [], nextStep: 1 });

export const DEFAULT_STYLE: Style = {
  stroke: '#ef4444', strokeWidth: 4, fill: 'none', opacity: 0.35, fontSize: 24,
};
