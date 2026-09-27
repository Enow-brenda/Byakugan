export type TabType = 'overview' | 'impact' | 'files' | 'chakra' | 'techniques';

export type SkillLevel = 'beginner' | 'intermediate' | 'senior';

export interface CodebaseNode {
  id: string;
  name: string;
  path: string;
  type: 'Service' | 'Controller' | 'Repository' | 'Model' | 'Worker' | 'Database' | 'Utility/Cache' | 'Queue' | 'External API' | 'Test';
  category: 'Services' | 'Controllers' | 'Repositories' | 'Models' | 'External';
  color: string;
  loc: number;
  role: string;
  riskScore: string;
  riskLevel: 'HIGH IMPACT' | 'MODERATE' | 'ELEVATED' | 'LOW RISK' | 'CRITICAL OUTLET' | 'INFRA CRITICAL' | 'TEST HARNESS' | 'HIGH VOLUME';
  complexity: string;
  astFlag: string;
  x: number;
  y: number;
  r: number;
  isFocal?: boolean;
  beginner?: {
    tagline: string;
    role: string;
    badge: string;
    whatItDoes: string;
    whoUsesIt: string;
    whatItUses: string;
    whyItMatters: string;
  };
  senior?: {
    archRole: string;
    stateMutation: string;
    uncoveredFailures: string[];
    propagationRadius: string;
    concerns: string[];
    safeMigration: string[];
  };
}

export interface CodebaseEdge {
  source: string;
  target: string;
  relation: 'calls' | 'writes' | 'reads' | 'publishes' | 'tests';
  loc: number;
  contract: string;
  beginner?: string;
  senior?: string;
}

export interface ArchitecturePattern {
  id: string;
  name: string;
  category: 'structural' | 'creational' | 'behavioral' | 'concurrency';
  categoryLabel: string;
  astScore: string;
  healthStatus?: string;
  occurrences: { file: string; line: number }[];
  plainDefinition: string;
  whyItMatters: string;
  withoutItRisk: string;
  codeSnippetTitle: string;
  codeSnippetFile: string;
  codeSnippet: string;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  badge?: string;
  badgeType?: 'core' | 'ts' | 'count';
  count?: number;
  children?: FileTreeNode[];
  lines?: number;
}
