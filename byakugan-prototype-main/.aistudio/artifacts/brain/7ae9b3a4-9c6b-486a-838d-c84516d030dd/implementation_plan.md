# Interactive File Browser & Expandable Sidebar System

A comprehensive upgrade to make every file in the Workspace Tree fully functional with live source code, dynamic AST telemetry, and metrics, coupled with fluid expand/contract controls for both the file browser pane and the application sidebar.

## User Review & Critical Decisions

> [!IMPORTANT]
> To provide maximum workspace flexibility, both the File Browser's tree pane and the main application navigation sidebar will feature smooth expand/contract controls.

- **Expanded File Registry**: We will map out interactive files across `controllers/`, `services/`, `gateways/`, `repositories/`, `middleware/`, and `workers/` so clicking any file instantly renders its real source code, line counts, function counts, and tailored AST intelligence.
- **Dual Expand/Contract Controls**:
  1. *File Tree Pane*: An in-pane collapse toggle button (`PanelLeftClose` / `PanelLeft`) that contracts the tree sidebar into a thin affordance rail, expanding the code editor to 100% width.
  2. *Main App Navigation Sidebar*: An expand/contract toggle button at the bottom of the sidebar allowing seamless switching between full navigation (256px) and an icon-only compact rail (64px).

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the File Browser from a static single-file showcase into a fully browsable repository workspace. Clicking any file across any folder in the directory tree loads its exact syntax-highlighted code, file statistics, and 3-tier Adaptive AST Insight (Junior, Mid-Level, Senior Architect). Users can expand and contract both sidebars to optimize screen real estate when reading code or inspecting complex systems.
- **Target Audience / Persona**: Staff engineers, backend developers, and system architects performing deep code reviews and blast-radius investigations.
- **Key Value**: Eliminates dead clicks in the tree and unlocks a distraction-free code reading experience by collapsing side panels on demand.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Browsing & Selecting Files**:
   - The user expands folders like `controllers`, `services`, or `gateways` in the directory tree.
   - Clicking any file (e.g. `CheckoutController.ts`, `RefundService.js`, `StripeGateway.ts`, `LedgerEntry.ts`) highlights the node with an active glow indicator.
   - The right canvas immediately transitions to display the selected file's breadcrumb path, LOC, function count, blast tier, 3-tier AST synthesis, and line-numbered syntax-highlighted code.
2. **Contracting & Expanding the File Tree Pane**:
   - The user clicks the collapse icon in the Workspace Tree header.
   - The tree pane smoothly slides closed (`w-80` to `w-0` / slim rail), while the code reader dynamically expands to utilize 100% of the canvas width.
   - A floating expand trigger button remains docked at the left border for instant single-click re-expansion.
3. **Contracting & Expanding the Main App Sidebar**:
   - The user clicks the collapse toggle at the bottom of the left sidebar.
   - The sidebar smoothly shrinks to a 64px icon rail with active tooltip indicators and the sliding indicator preserving workspace navigation.

### Visual Identity & Theme
- **Aesthetic Direction**: High-density engineering console with deep space slate tones (`#060e20`, `#0b1326`, `#0d1527`), hairline borders (`border-slate-800`), and cyan/indigo telemetry accents.
- **Typography & Hierarchy**: Monospace tabular numerals (`JetBrains Mono` / `font-mono`) for code, line numbers, and metric pills; crisp geometric sans (`Plus Jakarta Sans`) for headers and summaries.
- **Motion & Micro-interactions**: Compositor-only soft transitions using Framer Motion (`cubic-bezier(0.16, 1, 0.3, 1)`), smooth chevron rotations on folder toggles, and zero layout jitter.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side Rich File Catalog vs. Hardcoded Single File**:
  - *Chosen Approach*: Implement a structured, typed registry of source code files (`FileEntry` data structure) covering core services, controllers, gateways, and workers with authentic implementations.
  - *Why*: Delivers an immediate, responsive, zero-latency browsing experience with rich domain code without requiring external filesystem APIs.
- **Decision 2: Expand/Contract Scope (Dual Pane Collapse)**:
  - *Chosen Approach*: Support collapse/expand for both the file tree pane within Files Browser AND the primary application sidebar.
  - *Why*: Completely satisfies the user's intent regardless of which slide bar they had in mind, providing maximum ergonomic flexibility for code review.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Layout & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│ App Layout (App.tsx)                                                   │
│                                                                        │
│ ┌──────────────────────┐  ┌──────────────────────────────────────────┐ │
│ │ Main Sidebar         │  │ Workspace Main Viewport                  │ │
│ │ (Sidebar.tsx)        │  │                                          │ │
│ │                      │  │ ┌──────────────────────────────────────┐ │ │
│ │ • Full (256px)       │  │ │ FilesBrowserView.tsx                 │ │ │
│ │   vs. Compact (64px) │  │ │                                      │ │ │
│ │ • Slide bar collapse │  │ │ ┌──────────────────┐ ┌─────────────┐ │ │ │
│ │   toggle trigger     │  │ │ │ Directory Tree   │ │ Code Canvas │ │ │ │
│ │                      │  │ │ │ (w-80 / collapse)│ │ & Telemetry │ │ │ │
│ │                      │  │ │ │ • Search filter  │ │ • AST tabs  │ │ │ │
│ │                      │  │ │ │ • Folder toggles │ │ • Line view │ │ │ │
│ │                      │  │ │ │ • File click     │ │ • Copy tool │ │ │ │
│ └──────────────────────┘  │ └─┴──────────────────┴─┴─────────────┘ │ │ │
│                           └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Architecture
- `expandedFolders: Record<string, boolean>`: Tracks disclosure state for directory folders (`src`, `config`, `controllers`, `services`, `middleware`, `models`, `workers`).
- `selectedFilePath: string`: Currently focused file path passed down from `App` or managed internally.
- `isTreeCollapsed: boolean`: State for contracting/expanding the file tree sidebar.
- `isSidebarCollapsed: boolean`: State in `Sidebar.tsx` / `App.tsx` for expanding and contracting the primary navigation rail.
- `FILE_CATALOG: Record<string, FileDefinition>`: Comprehensive registry containing:
  - `path`: Full repository path
  - `name`: File basename
  - `language`: `typescript` | `javascript`
  - `loc`: Line count
  - `functionsCount`: Number of declared functions
  - `blastTier`: `Critical` | `High` | `Medium` | `Low`
  - `astInsights`: Mode-specific insights (`junior`, `mid`, `senior`)
  - `codeLines`: Array of formatted source code lines with AST annotations
