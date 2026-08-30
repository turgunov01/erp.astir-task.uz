/**
 * Default animation pipeline (spec 11).
 *
 * `weight` drives project progress: a stage contributes proportionally to
 * its weight rather than every stage counting equally (spec 56). Rendering
 * and animation carry the most schedule risk, so they weigh heaviest.
 */
export interface PipelineStageTemplate {
  name: string
  order: number
  weight: number
  /** Department that normally owns this stage; matched by name at seed time. */
  department?: string
}

export const DEFAULT_PIPELINE: readonly PipelineStageTemplate[] = [
  { name: 'Brief', order: 1, weight: 1, department: 'Management' },
  { name: 'Script', order: 2, weight: 1, department: 'Management' },
  { name: 'Storyboard', order: 3, weight: 2, department: '2D' },
  { name: 'Animatic', order: 4, weight: 2, department: '2D' },
  { name: 'Concept Art', order: 5, weight: 2, department: '2D' },
  { name: 'Character Design', order: 6, weight: 2, department: '2D' },
  { name: 'Environment Design', order: 7, weight: 2, department: '2D' },
  { name: 'Modeling', order: 8, weight: 3, department: 'Modeling' },
  { name: 'Rigging', order: 9, weight: 3, department: 'Rigging' },
  { name: 'Layout', order: 10, weight: 2, department: '3D' },
  { name: 'Animation', order: 11, weight: 5, department: 'Animation' },
  { name: 'Simulation / FX', order: 12, weight: 3, department: '3D' },
  { name: 'Lighting', order: 13, weight: 3, department: 'Lighting' },
  { name: 'Rendering', order: 14, weight: 4, department: 'Rendering' },
  { name: 'Compositing', order: 15, weight: 3, department: 'Compositing' },
  { name: 'Sound', order: 16, weight: 2, department: 'Sound' },
  { name: 'Editing', order: 17, weight: 2, department: 'Editing' },
  { name: 'Internal Review', order: 18, weight: 1, department: 'Production' },
  { name: 'Client Review', order: 19, weight: 1, department: 'Production' },
  { name: 'Corrections', order: 20, weight: 2, department: 'Production' },
  { name: 'Final Render', order: 21, weight: 2, department: 'Rendering' },
  { name: 'Delivery', order: 22, weight: 1, department: 'Production' }
]

/** Departments seeded on a fresh studio (spec 30). */
export const DEFAULT_DEPARTMENTS: readonly string[] = [
  'Production',
  '2D',
  '3D',
  'Animation',
  'Modeling',
  'Rigging',
  'Lighting',
  'Rendering',
  'Compositing',
  'Sound',
  'Editing',
  'Management',
  'Finance'
]

/**
 * Project templates (spec 84). Each names the subset of DEFAULT_PIPELINE
 * that applies; anything not listed is skipped for that project type.
 */
export const PROJECT_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  '2D Animation': [
    'Brief', 'Script', 'Storyboard', 'Animatic', 'Concept Art',
    'Character Design', 'Environment Design', 'Animation', 'Compositing',
    'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections',
    'Final Render', 'Delivery'
  ],
  '3D Animation': [
    'Brief', 'Script', 'Storyboard', 'Animatic', 'Concept Art',
    'Character Design', 'Environment Design', 'Modeling', 'Rigging', 'Layout',
    'Animation', 'Simulation / FX', 'Lighting', 'Rendering', 'Compositing',
    'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections',
    'Final Render', 'Delivery'
  ],
  'Commercial': [
    'Brief', 'Script', 'Storyboard', 'Animatic', 'Animation', 'Compositing',
    'Sound', 'Editing', 'Internal Review', 'Client Review', 'Corrections',
    'Final Render', 'Delivery'
  ],
  'Motion Design': [
    'Brief', 'Script', 'Storyboard', 'Animation', 'Compositing', 'Sound',
    'Editing', 'Internal Review', 'Client Review', 'Corrections', 'Delivery'
  ],
  'Series Episode': [
    'Brief', 'Storyboard', 'Animatic', 'Layout', 'Animation', 'Lighting',
    'Rendering', 'Compositing', 'Sound', 'Editing', 'Internal Review',
    'Client Review', 'Corrections', 'Final Render', 'Delivery'
  ]
}
