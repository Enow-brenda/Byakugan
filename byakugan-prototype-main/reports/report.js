/**
 * Byakugan Report Generation Layer
 * 
 * Reusable report-generation module for Byakugan Codebase Intelligence.
 * Accepts structured analysis data and produces a complete, standalone,
 * styled HTML report using the Byakugan report template and CSS.
 */

// Helper to escape text and prevent raw tag injection or broken markup
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats inline text content safely:
 * - Strips any accidental raw markup tags (table, tr, td, div, span) to prevent unrendered markup
 * - Strips leading markdown header hashes (###)
 * - Converts markdown bold (**text**) to <strong>text</strong>
 * - Converts markdown inline backticks (`code`) to <code class="code-inline">code</code>
 * - Converts markdown italic (*text*) to <em>text</em>
 */
function formatInlineContent(str) {
  if (str === null || str === undefined) return '';
  let text = String(str);

  // Strip accidental raw block elements that might appear in raw strings
  text = text.replace(/<\/?(?:table|tbody|thead|tfoot|tr|td|th|div|span|p|ul|ol|li)[^>]*>/gi, ' ');

  // Remove markdown headers like ### or ##
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Escape HTML special characters
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Now safely convert Markdown bold **text** to <strong>text</strong>
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Safely convert Markdown inline backticks `code` to <code class="code-inline">$1</code>
  text = text.replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>');

  // Safely convert Markdown italic *text* to <em>text</em>
  text = text.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  return text.trim();
}

/**
 * Render codebase metrics section
 */
function renderCodebaseMetrics(metrics) {
  if (!metrics) return '';
  return `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">Total Files</span>
          <span class="badge badge-indigo">Filesystem</span>
        </div>
        <div class="metric-value text-indigo">${escapeHtml(metrics.totalFiles || 247)}</div>
        <div class="metric-sub text-muted">
          <span>${escapeHtml(metrics.linesOfCode || '34.2k')} LOC total</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">Active Modules</span>
          <span class="badge badge-emerald">0 Loops</span>
        </div>
        <div class="metric-value text-emerald">${escapeHtml(metrics.activeModules || 12)}</div>
        <div class="metric-sub text-emerald">
          <span>Optimal DAG structure</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">Dependencies</span>
          <span class="badge badge-cyan">AST Graph</span>
        </div>
        <div class="metric-value text-cyan">${escapeHtml(metrics.dependencies || 47)}</div>
        <div class="metric-sub text-cyan">
          <span>${escapeHtml(metrics.astEdges || 112)} AST direct edges</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">Design Patterns</span>
          <span class="badge badge-amber">Synthesized</span>
        </div>
        <div class="metric-value text-amber">${escapeHtml(metrics.designPatterns || 9)}</div>
        <div class="metric-sub text-amber">
          <span>2 flagged fragile</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render technology stack section
 */
function renderTechStack(techStack) {
  if (!techStack || !Array.isArray(techStack)) return '';
  const cards = techStack.map(item => `
    <div class="tech-stack-card">
      <div class="tech-icon-box">${escapeHtml(item.category || 'LIB').slice(0, 3).toUpperCase()}</div>
      <div class="tech-details">
        <div class="tech-name">
          <span>${escapeHtml(item.name)}</span>
          ${item.version ? `<span class="badge badge-slate">${escapeHtml(item.version)}</span>` : ''}
        </div>
        <div class="tech-role">${escapeHtml(item.role)}</div>
      </div>
    </div>
  `).join('');

  return `<div class="tech-stack-grid">${cards}</div>`;
}

/**
 * Render Impact Sight & Blast Radius analysis
 */
function renderImpactSight(impact) {
  if (!impact) return '';
  
  const stepsHtml = (impact.verificationSteps || []).map((step, idx) => `
    <div class="checklist-item">
      <span class="check-icon">${step.completed ? '&#10003;' : (idx + 1)}</span>
      <div class="checklist-content">
        <div class="checklist-title">
          ${formatInlineContent(step.title)}
          <span class="badge badge-slate" style="margin-left: 0.5rem;">${escapeHtml(step.tag || 'VERIFY')}</span>
        </div>
        <div class="checklist-desc">${formatInlineContent(step.description)}</div>
      </div>
    </div>
  `).join('');

  return `
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      <div class="card" style="background: linear-gradient(135deg, rgba(244, 63, 94, 0.08), rgba(19, 27, 46, 0.95)); border-color: rgba(244, 63, 94, 0.35);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <span class="badge badge-rose" style="margin-bottom: 0.5rem;">
              <span class="badge-dot"></span>
              ${escapeHtml(impact.riskLevel || 'HIGH IMPACT')}
            </span>
            <h3 style="font-size: 1.2rem; font-weight: 700; color: #ffffff;">
              Focal Target: <span class="mono text-cyan">${escapeHtml(impact.targetFile)}</span>
            </h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.25rem;">
              Direct ripple radius spans ${escapeHtml(impact.directNodes || 7)} ingress/egress modules and ${escapeHtml(impact.indirectNodes || 19)} downstream consumers.
            </p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Blast Radius Score</div>
            <div class="mono text-rose" style="font-size: 2.2rem; font-weight: 800; line-height: 1;">
              ${escapeHtml(impact.blastRadiusScore || '8.8')} / 10
            </div>
          </div>
        </div>

        <div class="progress-bar-container">
          <div class="progress-bar">
            <div class="progress-segment" style="width: ${impact.criticalPathPercent || 68}%; background: var(--accent-rose);" title="Critical Path"></div>
            <div class="progress-segment" style="width: ${impact.secondaryConsumersPercent || 20}%; background: var(--accent-cyan);" title="Secondary Consumers"></div>
            <div class="progress-segment" style="width: ${impact.telemetryPercent || 12}%; background: var(--accent-emerald);" title="Telemetry & Audit"></div>
          </div>
          <div class="progress-legend">
            <span class="legend-item"><span style="width:8px; height:8px; background:var(--accent-rose); border-radius:50%;"></span> Critical Path (${impact.criticalPathPercent || 68}%)</span>
            <span class="legend-item"><span style="width:8px; height:8px; background:var(--accent-cyan); border-radius:50%;"></span> Secondary Consumers (${impact.secondaryConsumersPercent || 20}%)</span>
            <span class="legend-item"><span style="width:8px; height:8px; background:var(--accent-emerald); border-radius:50%;"></span> Telemetry &amp; Audit (${impact.telemetryPercent || 12}%)</span>
          </div>
        </div>
      </div>

      <!-- Fragile Pattern Alert Callout -->
      <div class="warning-box">
        <div class="warning-header">
          <div class="warning-title">
            <span>&#9888; Flagged Pattern: ${escapeHtml(impact.astRuleFlag || 'SEC-204')}</span>
          </div>
          <span class="badge badge-rose">State Mutation Hazard</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary);">
          ${formatInlineContent(impact.flagDescription || 'Direct mutation of transaction context inside catch handler without compensating ledger journal entry.')}
        </p>
        ${impact.vulnerableCode ? `
          <div class="code-diff">
            <div class="diff-comment">// Vulnerable implementation in ${escapeHtml(impact.targetFile.split('/').pop() || impact.targetFile)}</div>
            <div class="diff-del">- ${escapeHtml(impact.vulnerableCode)}</div>
            <div class="diff-add">+ ${escapeHtml(impact.remediatedCode || 'const safeRecord = Object.freeze({ ...payload, state: "MUTATED" });')}</div>
          </div>
        ` : ''}
      </div>

      <!-- Pre-Commit Verification Sequence -->
      <div class="card">
        <h4 class="card-title">Pre-Commit Verification Sequence</h4>
        <div class="checklist-grid">
          ${stepsHtml}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Files Explorer summary
 */
function renderFilesExplorer(filesSummary) {
  if (!filesSummary) return '';
  const dirRows = (filesSummary.directories || []).map(dir => `
    <tr>
      <td class="mono text-cyan">${escapeHtml(dir.path)}</td>
      <td>${escapeHtml(dir.name)}</td>
      <td class="mono">${escapeHtml(dir.fileCount)} files</td>
      <td><span class="badge badge-slate">Structured</span></td>
    </tr>
  `).join('');

  const coreRows = (filesSummary.coreFiles || []).map(file => `
    <tr>
      <td class="mono font-bold text-primary">${escapeHtml(file.name)}</td>
      <td class="mono text-muted" style="font-size: 0.75rem;">${escapeHtml(file.path)}</td>
      <td class="mono text-indigo font-bold">${escapeHtml(file.lines)} LOC</td>
      <td>
        <span class="badge ${file.badge === 'CORE' ? 'badge-rose' : 'badge-cyan'}">
          ${escapeHtml(file.badge || 'MODULE')}
        </span>
      </td>
      <td style="font-size: 0.8rem;">${escapeHtml(file.role || 'Service component')}</td>
    </tr>
  `).join('');

  return `
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      <div class="card">
        <h4 class="card-title">Core Architecture Files</h4>
        <div class="table-wrapper">
          <table class="report-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>File Path</th>
                <th>Lines</th>
                <th>Classification</th>
                <th>System Responsibility</th>
              </tr>
            </thead>
            <tbody>
              ${coreRows}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h4 class="card-title">Directory Structure Footprint</h4>
        <div class="table-wrapper">
          <table class="report-table">
            <thead>
              <tr>
                <th>Directory Path</th>
                <th>Domain Category</th>
                <th>File Count</th>
                <th>AST Status</th>
              </tr>
            </thead>
            <tbody>
              ${dirRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Chakra Network summary
 */
function renderChakraNetwork(chakra) {
  if (!chakra) return '';
  
  const categoryBadges = (chakra.categories || []).map(cat => `
    <span class="badge" style="background: rgba(30, 41, 59, 0.6); color: ${cat.color}; border-color: ${cat.color}40;">
      <span class="badge-dot" style="background: ${cat.color};"></span>
      ${escapeHtml(cat.name)} (${cat.count})
    </span>
  `).join('');

  const nodeRows = (chakra.nodes || []).slice(0, 10).map(node => `
    <tr>
      <td class="mono font-bold text-primary">${escapeHtml(node.name)}</td>
      <td><span class="badge badge-slate">${escapeHtml(node.type)}</span></td>
      <td class="mono">${escapeHtml(node.loc > 0 ? node.loc + ' LOC' : 'Infra')}</td>
      <td>
        <span class="badge ${node.riskLevel.includes('HIGH') ? 'badge-rose' : (node.riskLevel.includes('MODERATE') ? 'badge-amber' : 'badge-emerald')}">
          ${escapeHtml(node.riskLevel)}
        </span>
      </td>
      <td style="font-size: 0.8rem;">${escapeHtml(node.role)}</td>
    </tr>
  `).join('');

  return `
    <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h4 class="card-title" style="margin-bottom: 0.25rem;">Network Topology Summary</h4>
          <p class="text-muted" style="font-size: 0.8rem;">
            Total Nodes: <strong class="text-primary">${escapeHtml(chakra.totalNodes || 22)}</strong> &bull;
            Total Relations: <strong class="text-primary">${escapeHtml(chakra.totalEdges || 34)}</strong> &bull;
            Central Focal Hub: <strong class="text-cyan">${escapeHtml(chakra.centralHub || 'RefundService.js')}</strong>
          </p>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${categoryBadges}
        </div>
      </div>

      <div class="table-wrapper">
        <table class="report-table">
          <thead>
            <tr>
              <th>Node Identifier</th>
              <th>Archetype</th>
              <th>Volume</th>
              <th>Risk Assessment</th>
              <th>Functional Description</th>
            </tr>
          </thead>
          <tbody>
            ${nodeRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Render Techniques and Patterns section
 */
function renderTechniques(techniques) {
  if (!techniques || !Array.isArray(techniques)) return '';
  const cards = techniques.map(p => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
        <div>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: #ffffff;">${escapeHtml(p.name)}</h4>
          <span class="text-dim mono" style="font-size: 0.75rem;">${escapeHtml(p.categoryLabel)}</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <span class="badge badge-indigo">${escapeHtml(p.astScore || 'Active')}</span>
          ${p.healthStatus ? `<span class="badge badge-emerald">${escapeHtml(p.healthStatus)}</span>` : ''}
        </div>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
        ${escapeHtml(p.plainDefinition)}
      </p>
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.75rem; font-size: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
        <div><strong class="text-emerald">Why it matters:</strong> <span class="text-muted">${escapeHtml(p.whyItMatters)}</span></div>
        <div><strong class="text-rose">Without it risk:</strong> <span class="text-muted">${escapeHtml(p.withoutItRisk)}</span></div>
        ${p.occurrencesCount ? `<div class="mono text-cyan" style="font-size: 0.7rem; margin-top: 0.25rem;">Detected across ${escapeHtml(p.occurrencesCount)} codebase locations</div>` : ''}
      </div>
    </div>
  `).join('');

  return `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1rem;">${cards}</div>`;
}

/**
 * Render Risk Information & Fragile Patterns
 */
function renderRisks(risks) {
  if (!risks || !Array.isArray(risks)) return '';
  const rows = risks.map(r => `
    <tr>
      <td>
        <span class="badge ${r.severity === 'CRITICAL' ? 'badge-rose' : (r.severity === 'HIGH' ? 'badge-amber' : 'badge-slate')}">
          ${escapeHtml(r.severity)}
        </span>
      </td>
      <td class="mono font-bold text-primary">${escapeHtml(r.title)}</td>
      <td class="mono text-cyan" style="font-size: 0.75rem;">${escapeHtml(r.affectedFile)}</td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(r.description)}</td>
      <td style="font-size: 0.8rem; color: var(--accent-emerald-light); font-family: var(--font-mono);">${escapeHtml(r.remediation)}</td>
    </tr>
  `).join('');

  return `
    <div class="card">
      <div class="table-wrapper">
        <table class="report-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Risk Category</th>
              <th>Affected Module</th>
              <th>Hazard Description</th>
              <th>Recommended Remediation</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Render Dependency Information
 */
function renderDependencies(deps) {
  if (!deps) return '';
  const internalRows = (deps.internal || []).slice(0, 10).map(d => `
    <tr>
      <td class="mono text-cyan">${escapeHtml(d.from)}</td>
      <td>
        <span class="badge badge-slate">${escapeHtml(d.type || 'calls')}</span>
      </td>
      <td class="mono text-indigo">${escapeHtml(d.to)}</td>
      <td class="mono text-muted" style="font-size: 0.75rem;">${escapeHtml(d.contract)}</td>
    </tr>
  `).join('');

  const externalCards = (deps.external || []).map(ext => `
    <div class="tech-stack-card">
      <div class="tech-icon-box" style="color: var(--accent-indigo);">&#9741;</div>
      <div class="tech-details">
        <div class="tech-name">
          <span>${escapeHtml(ext.name)}</span>
          <span class="badge badge-emerald">${escapeHtml(ext.status || 'Active')}</span>
        </div>
        <div class="tech-role">${escapeHtml(ext.usage)}</div>
      </div>
    </div>
  `).join('');

  return `
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      <div class="card">
        <h4 class="card-title">External Infrastructure Integrations</h4>
        <div class="tech-stack-grid">
          ${externalCards}
        </div>
      </div>

      <div class="card">
        <h4 class="card-title">Internal Call Graph &amp; Contract Bindings</h4>
        <div class="table-wrapper">
          <table class="report-table">
            <thead>
              <tr>
                <th>Caller (Source)</th>
                <th>Relation</th>
                <th>Target Module</th>
                <th>Contract Interface / AST Binding</th>
              </tr>
            </thead>
            <tbody>
              ${internalRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Test Coverage Information
 */
function renderTestCoverage(coverage) {
  if (!coverage) return '';
  const breakdownRows = (coverage.breakdown || []).map(item => `
    <tr>
      <td class="font-bold text-primary">${escapeHtml(item.layer)}</td>
      <td class="mono">
        <span class="badge ${item.percentage >= 85 ? 'badge-emerald' : (item.percentage >= 70 ? 'badge-cyan' : 'badge-amber')}">
          ${escapeHtml(item.percentage)}%
        </span>
      </td>
      <td>
        <div class="progress-bar" style="height: 6px; width: 100%; max-width: 250px;">
          <div class="progress-segment" style="width: ${item.percentage}%; background: ${item.percentage >= 85 ? 'var(--accent-emerald)' : (item.percentage >= 70 ? 'var(--accent-cyan)' : 'var(--accent-amber)')};"></div>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
        <div>
          <span class="badge badge-emerald" style="margin-bottom: 0.5rem;">Regression Suite Active</span>
          <h4 style="font-size: 1.2rem; font-weight: 700; color: #ffffff;">Overall Codebase Coverage</h4>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.25rem;">
            Synthesized across ${escapeHtml(coverage.testSuitesCount || 42)} automated test suites (${escapeHtml(coverage.totalTestsCount || 318)} unit &amp; integration tests).
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Line &amp; Branch Coverage</div>
          <div class="mono text-emerald" style="font-size: 2.4rem; font-weight: 800; line-height: 1;">
            ${escapeHtml(coverage.overallPercentage || 84.6)}%
          </div>
        </div>
      </div>

      <div class="card">
        <h4 class="card-title">Coverage Breakdown by Architectural Layer</h4>
        <div class="table-wrapper">
          <table class="report-table">
            <thead>
              <tr>
                <th>System Layer</th>
                <th>Coverage Metric</th>
                <th>Harness Density</th>
              </tr>
            </thead>
            <tbody>
              ${breakdownRows}
            </tbody>
          </table>
        </div>
      </div>

      ${coverage.criticalUncovered ? `
        <div class="warning-box" style="border-left-color: var(--accent-amber); background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(19, 27, 46, 0.95));">
          <div class="warning-header">
            <div class="warning-title" style="color: var(--accent-amber-light);">
              <span>&#9888; Critical Uncovered Scenario</span>
            </div>
            <span class="badge badge-amber">Coverage Gap</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">
            ${escapeHtml(coverage.criticalUncovered)}
          </p>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Universal Template Loader
 * Loads template HTML & CSS from filesystem if running in Node.js,
 * or accepts custom template strings passed in options.
 */
function resolveTemplateAssets(options = {}) {
  let htmlTemplate = options.htmlTemplate || '';
  let cssTemplate = options.cssTemplate || '';

  // If templates are not provided and we are in Node.js, read from reports/template/
  if ((!htmlTemplate || !cssTemplate) && typeof window === 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      let req = null;
      if (typeof require !== 'undefined') {
        req = require;
      } else if (typeof process.getBuiltinModule === 'function') {
        const nodeModule = process.getBuiltinModule('node:module');
        if (nodeModule && typeof nodeModule.createRequire === 'function') {
          req = nodeModule.createRequire(process.cwd() + '/');
        }
      }

      if (req) {
        const fs = req('node:fs') || req('fs');
        const path = req('node:path') || req('path');
        const templateDir = path.resolve(process.cwd(), 'reports', 'template');

        if (!htmlTemplate) {
          const htmlPath = path.join(templateDir, 'report.html');
          if (fs.existsSync(htmlPath)) {
            htmlTemplate = fs.readFileSync(htmlPath, 'utf-8');
          }
        }
        if (!cssTemplate) {
          const cssPath = path.join(templateDir, 'report.css');
          if (fs.existsSync(cssPath)) {
            cssTemplate = fs.readFileSync(cssPath, 'utf-8');
          }
        }
      }
    } catch {
      // In bundlers or environments without synchronous require
    }
  }

  // Fallback template if file reading was not available or empty
  if (!htmlTemplate) {
    htmlTemplate = getDefaultHtmlTemplate();
  }
  if (!cssTemplate) {
    cssTemplate = getDefaultCssTemplate();
  }

  return { htmlTemplate, cssTemplate };
}

function getDefaultHtmlTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Byakugan Report — {{PROJECT_NAME}}</title>
  <style>{{REPORT_STYLES}}</style>
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <div class="report-header-top">
        <div>
          <div class="report-brand">
            <span class="report-logo-badge">BYAKUGAN</span>
            <span class="badge badge-emerald">{{HEALTH_STATUS}}</span>
            <span class="badge badge-indigo">AST Scan v3.4.1</span>
          </div>
          <h1 class="report-title">{{PROJECT_NAME}}</h1>
          <p class="report-subtitle">{{PROJECT_DESCRIPTION}}</p>
        </div>
        <div class="report-header-actions">
          <button type="button" class="btn-action btn-secondary" onclick="window.print()">Print / Save PDF</button>
        </div>
      </div>
      <div class="report-meta-grid">
        <div class="meta-item"><span class="meta-label">Branch Target</span><span class="meta-val">{{BRANCH}}</span></div>
        <div class="meta-item"><span class="meta-label">Generated At</span><span class="meta-val">{{GENERATED_DATE}}</span></div>
        <div class="meta-item"><span class="meta-label">Architecture Health</span><span class="meta-val text-indigo">{{HEALTH_SCORE}}</span></div>
        <div class="meta-item"><span class="meta-label">Integrity Status</span><span class="meta-val text-emerald">{{SCAN_MODE}}</span></div>
      </div>
    </header>
    <section class="report-section" id="codebase-metrics">
      <div class="section-title-wrap"><h2 class="section-title">Codebase Metrics</h2></div>
      {{CODEBASE_METRICS}}
    </section>
    <section class="report-section" id="tech-stack">
      <div class="section-title-wrap"><h2 class="section-title">Technology Stack</h2></div>
      {{TECH_STACK_SECTION}}
    </section>
    <section class="report-section" id="impact-sight">
      <div class="section-title-wrap"><h2 class="section-title">Impact Sight &amp; Blast Radius</h2></div>
      {{IMPACT_SIGHT_SECTION}}
    </section>
    <section class="report-section" id="files-summary">
      <div class="section-title-wrap"><h2 class="section-title">Files Explorer Summary</h2></div>
      {{FILES_EXPLORER_SECTION}}
    </section>
    <section class="report-section" id="chakra-network">
      <div class="section-title-wrap"><h2 class="section-title">Chakra Network Summary</h2></div>
      {{CHAKRA_NETWORK_SECTION}}
    </section>
    <section class="report-section" id="techniques-patterns">
      <div class="section-title-wrap"><h2 class="section-title">Techniques &amp; Design Patterns</h2></div>
      {{TECHNIQUES_PATTERNS_SECTION}}
    </section>
    <section class="report-section" id="risk-information">
      <div class="section-title-wrap"><h2 class="section-title">Risk Information &amp; Fragility Analysis</h2></div>
      {{RISK_INFORMATION_SECTION}}
    </section>
    <section class="report-section" id="dependency-information">
      <div class="section-title-wrap"><h2 class="section-title">Dependency Information</h2></div>
      {{DEPENDENCY_INFORMATION_SECTION}}
    </section>
    <section class="report-section" id="test-coverage">
      <div class="section-title-wrap"><h2 class="section-title">Test Coverage &amp; Verification</h2></div>
      {{TEST_COVERAGE_SECTION}}
    </section>
    <footer class="report-footer">
      <div>Byakugan Codebase Intelligence &amp; Blast-Radius Telemetry Engine</div>
      <div>Deterministic AST Analysis &bull; Confidential Engineering Report</div>
    </footer>
  </div>
</body>
</html>`;
}

function getDefaultCssTemplate() {
  return `:root {
  --bg-primary: #0b1326; --bg-secondary: #060e20; --bg-card: #131b2e;
  --border-color: #2a374f; --text-primary: #f8fafc; --text-secondary: #dae2fd;
  --text-muted: #94a3b8; --accent-indigo: #6366f1; --accent-cyan: #06b6d4;
  --accent-emerald: #10b981; --accent-rose: #f43f5e; --accent-amber: #f59e0b;
}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-primary); color: var(--text-secondary); margin: 0; padding: 2rem; }
.report-container { max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
.report-header, .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.5rem; }
.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.metric-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; }
.metric-value { font-size: 2rem; font-weight: 800; }
.badge { display: inline-flex; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.badge-emerald { background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); }
.badge-rose { background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); }
.badge-indigo { background: rgba(99, 102, 241, 0.15); color: var(--accent-indigo); }
.report-table { width: 100%; border-collapse: collapse; }
.report-table th, .report-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); text-align: left; }
@media print { body { background: #fff !important; color: #000 !important; } }`;
}

/**
 * Main Report Generator Function
 * 
 * @param {Object} data - Structured Byakugan analysis data
 * @param {Object} [options] - Template options, custom CSS/HTML strings
 * @returns {string} Fully generated HTML document string
 */
function generateReport(data, options = {}) {
  if (!data) {
    throw new Error('Byakugan Report Generator requires structured analysis data.');
  }

  const { htmlTemplate, cssTemplate } = resolveTemplateAssets(options);
  if (!htmlTemplate) {
    throw new Error('Report HTML template could not be loaded. Please provide htmlTemplate in options.');
  }

  const project = data.project || {};
  const metrics = data.metrics || {};
  const techStack = data.techStack || [];
  const impactSight = data.impactSight || {};
  const filesSummary = data.filesSummary || {};
  const chakraNetwork = data.chakraNetwork || {};
  const techniques = data.techniques || [];
  const risks = data.risks || [];
  const dependencies = data.dependencies || {};
  const testCoverage = data.testCoverage || {};

  // Render each section into semantic HTML
  const renderedMetrics = renderCodebaseMetrics(metrics);
  const renderedTechStack = renderTechStack(techStack);
  const renderedImpactSight = renderImpactSight(impactSight);
  const renderedFiles = renderFilesExplorer(filesSummary);
  const renderedChakra = renderChakraNetwork(chakraNetwork);
  const renderedTechniques = renderTechniques(techniques);
  const renderedRisks = renderRisks(risks);
  const renderedDeps = renderDependencies(dependencies);
  const renderedCoverage = renderTestCoverage(testCoverage);

  // Perform placeholder interpolation
  let finalHtml = htmlTemplate
    .replace(/\{\{PROJECT_NAME\}\}/g, escapeHtml(project.name || 'payments-backend'))
    .replace(/\{\{PROJECT_DESCRIPTION\}\}/g, escapeHtml(project.description || 'High-throughput transactional microservice powering multi-gateway card settlement.'))
    .replace(/\{\{BRANCH\}\}/g, escapeHtml(project.branch || 'main'))
    .replace(/\{\{GENERATED_DATE\}\}/g, escapeHtml(project.generatedAt || new Date().toUTCString()))
    .replace(/\{\{HEALTH_SCORE\}\}/g, escapeHtml(project.healthScore || '98.4%'))
    .replace(/\{\{HEALTH_STATUS\}\}/g, escapeHtml(project.healthStatus || 'Optimal DAG Structure'))
    .replace(/\{\{SCAN_MODE\}\}/g, escapeHtml(project.scanMode || 'Production Grade (Plan Mode Sealed)'))
    .replace(/\{\{REPORT_STYLES\}\}/g, cssTemplate || '')
    .replace(/\{\{CODEBASE_METRICS\}\}/g, renderedMetrics)
    .replace(/\{\{TECH_STACK_SECTION\}\}/g, renderedTechStack)
    .replace(/\{\{IMPACT_SIGHT_SECTION\}\}/g, renderedImpactSight)
    .replace(/\{\{FILES_EXPLORER_SECTION\}\}/g, renderedFiles)
    .replace(/\{\{CHAKRA_NETWORK_SECTION\}\}/g, renderedChakra)
    .replace(/\{\{TECHNIQUES_PATTERNS_SECTION\}\}/g, renderedTechniques)
    .replace(/\{\{RISK_INFORMATION_SECTION\}\}/g, renderedRisks)
    .replace(/\{\{DEPENDENCY_INFORMATION_SECTION\}\}/g, renderedDeps)
    .replace(/\{\{TEST_COVERAGE_SECTION\}\}/g, renderedCoverage);

  return finalHtml;
}

/**
 * Factory helper: Build canonical structured analysis data from Byakugan application data
 */
function buildDefaultAnalysisData(focalTarget = 'src/services/PaymentProcessor.ts') {
  return {
    project: {
      name: 'payments-backend',
      branch: 'main',
      description: 'High-throughput transactional microservice powering multi-gateway card settlement, idempotency mutex locks, and atomic double-entry balance updates.',
      generatedAt: new Date().toUTCString(),
      healthScore: '98.4%',
      healthStatus: 'Optimal DAG Structure',
      scanMode: 'Production Grade (Plan Mode Sealed)'
    },
    metrics: {
      totalFiles: 247,
      linesOfCode: '34.2k',
      activeModules: 12,
      dependencies: 47,
      astEdges: 112,
      designPatterns: 9,
      circularLoops: 0,
      averageComplexity: '5.4'
    },
    techStack: [
      { name: 'Node.js', role: 'Runtime Environment', category: 'RUN', version: 'v20.11 LTS' },
      { name: 'Express', role: 'HTTP Transport & Routing', category: 'API', version: 'v4.21.2' },
      { name: 'TypeScript', role: 'Static Typing & AST Analysis', category: 'LANG', version: 'v5.4' },
      { name: 'PostgreSQL', role: 'Double-Entry Balance Ledger', category: 'DB', version: 'v16.2' },
      { name: 'Redis Cluster', role: 'Distributed Mutex & Rate Limiting', category: 'CACHE', version: 'v7.2' },
      { name: 'Apache Kafka', role: 'Streaming Audit & Settlement Events', category: 'QUEUE', version: 'v3.6' },
      { name: 'Stripe Gateway SDK', role: 'Payment Gateway Adapter', category: 'SDK', version: 'v14.1' },
      { name: 'Jest Harness', role: 'Unit & Regression Test Runner', category: 'TEST', version: 'v29.7' }
    ],
    impactSight: {
      targetFile: focalTarget,
      blastRadiusScore: '8.8',
      riskLevel: 'HIGH IMPACT',
      directNodes: 7,
      indirectNodes: 19,
      criticalPathPercent: 68,
      secondaryConsumersPercent: 20,
      telemetryPercent: 12,
      astRuleFlag: 'SEC-204 (State Mutation Hazard)',
      flagDescription: 'Direct mutation of transaction context inside catch handler without compensating ledger journal entry. Mutex lock on Redis key may leak if network timeout triggers upstream gateway disconnect.',
      vulnerableCode: "context.txPayload.state = 'MUTATED'; // Direct mutation",
      remediatedCode: "const safeRecord = Object.freeze({ ...context.txPayload, state: 'MUTATED' });",
      verificationSteps: [
        { id: 's1', title: 'Signature Isolation', tag: 'TS-AST-01', description: 'Wrap parameter changes in PaymentIntentConfig interface before mutating controller routes.', completed: true },
        { id: 's2', title: 'Atomic Distributed Locking', tag: 'SEC-REDIS', description: 'Reserve idempotency key using Redis SETNX with lease extension prior to gateway call.', completed: false },
        { id: 's3', title: 'Correlation Telemetry', tag: 'OTEL-EVT', description: 'Emit payment.attempted with distributed traceparent context.', completed: false },
        { id: 's4', title: 'Execute Payment Regression', tag: 'CI-E2E', description: 'Run test suite with mocked Adyen latency spikes and network partition scenarios.', completed: false }
      ]
    },
    filesSummary: {
      totalFiles: 247,
      directories: [
        { name: 'Services', path: 'src/services', fileCount: 4 },
        { name: 'Controllers', path: 'src/controllers', fileCount: 4 },
        { name: 'Models', path: 'src/models', fileCount: 5 },
        { name: 'Repositories', path: 'src/repositories', fileCount: 4 },
        { name: 'Workers', path: 'src/workers', fileCount: 3 },
        { name: 'Middleware', path: 'src/middleware', fileCount: 3 },
        { name: 'Config', path: 'src/config', fileCount: 2 }
      ],
      coreFiles: [
        { name: 'PaymentProcessor.ts', path: 'src/services/PaymentProcessor.ts', lines: 412, badge: 'CORE', role: 'Central payment coordination and state orchestration' },
        { name: 'StripeGateway.ts', path: 'src/services/StripeGateway.ts', lines: 245, badge: 'GATEWAY', role: 'External card reversal and authorization adapter' },
        { name: 'RefundService.js', path: 'src/services/RefundService.js', lines: 184, badge: 'CORE', role: 'Customer card refunds, idempotency, and ledger writes' },
        { name: 'TokenVault.ts', path: 'src/services/TokenVault.ts', lines: 142, badge: 'SECURITY', role: 'PCI-compliant card tokenization and KMS integration' },
        { name: 'CheckoutController.ts', path: 'src/controllers/CheckoutController.ts', lines: 112, badge: 'INGRESS', role: 'Public API entry point for card capture and refunds' }
      ],
      languages: [
        { name: 'TypeScript', percent: 68 },
        { name: 'JavaScript', percent: 32 }
      ]
    },
    chakraNetwork: {
      totalNodes: 22,
      totalEdges: 34,
      centralHub: 'RefundService.js (11 direct edge bindings)',
      categories: [
        { name: 'Services', count: 5, color: '#ec4899' },
        { name: 'Controllers', count: 4, color: '#38bdf8' },
        { name: 'Repositories', count: 4, color: '#34d399' },
        { name: 'Models', count: 5, color: '#fbbf24' },
        { name: 'External Infrastructure', count: 4, color: '#f43f5e' }
      ],
      nodes: [
        { name: 'RefundService.js', type: 'Service', loc: 184, role: 'Central refund and ledger settlement coordination', riskScore: '8.8 / 10', riskLevel: 'HIGH IMPACT' },
        { name: 'PaymentProcessor.ts', type: 'Service', loc: 412, role: 'Checkout payment capture pipeline', riskScore: '7.4 / 10', riskLevel: 'HIGH IMPACT' },
        { name: 'RefundController.js', type: 'Controller', loc: 112, role: 'Public API router POST /api/v1/refunds', riskScore: '4.2 / 10', riskLevel: 'MODERATE' },
        { name: 'AdminPanel.js', type: 'Controller', loc: 96, role: 'CSR administrative override router', riskScore: '5.5 / 10', riskLevel: 'ELEVATED' },
        { name: 'LedgerRepository.js', type: 'Repository', loc: 145, role: 'Atomic double-entry SQL ledger accounting', riskScore: '8.2 / 10', riskLevel: 'HIGH IMPACT' },
        { name: 'StripeGateway.ts', type: 'Service', loc: 245, role: 'External TLS round-trip card gateway client', riskScore: '6.8 / 10', riskLevel: 'ELEVATED' },
        { name: 'RedisCache', type: 'External', loc: 0, role: 'Redlock distributed mutex and token bucket cache', riskScore: '7.0 / 10', riskLevel: 'HIGH IMPACT' },
        { name: 'Database (PostgreSQL)', type: 'External', loc: 0, role: 'Persistent ACID relational storage for ledger', riskScore: '9.0 / 10', riskLevel: 'INFRA CRITICAL' }
      ],
      edges: [
        { source: 'RefundController.js', target: 'RefundService.js', relation: 'calls', contract: 'invokeProcessRefund(req.body, req.user)' },
        { source: 'AdminPanel.js', target: 'RefundService.js', relation: 'calls', contract: 'forceAuthorizeRefund(overrideToken, refundId)' },
        { source: 'RefundService.js', target: 'LedgerRepository.js', relation: 'writes', contract: 'commitDoubleEntryDebit(txPayload)' },
        { source: 'RefundService.js', target: 'StripeGateway.ts', relation: 'calls', contract: 'createChargeReversal(ctx.chargeId, ctx.cents)' },
        { source: 'RefundService.js', target: 'RedisCache', relation: 'calls', contract: 'acquireRedlock(ctx.idempotencyKey, 15000)' }
      ]
    },
    techniques: [
      {
        name: 'Repository Pattern',
        categoryLabel: 'Structural / Data Access',
        astScore: '94/100',
        healthStatus: 'Healthy (99/100)',
        plainDefinition: 'Decouples database query mechanics from business logic using typed collection-like interfaces.',
        whyItMatters: 'Enables frictionless mocking in unit tests and cleanly isolates database schema migrations from service logic.',
        withoutItRisk: 'Direct SQL/Knex calls leak into HTTP controllers, making testing require a live database setup and increasing fragility.',
        occurrencesCount: 4
      },
      {
        name: 'Dependency Injection',
        categoryLabel: 'Creational',
        astScore: '99/100',
        healthStatus: 'Healthy (95/100)',
        plainDefinition: 'Supplies gateway clients and database connections through constructor arguments rather than hardcoded new instances.',
        whyItMatters: 'Essential for seamlessly swapping live Stripe with mock sandbox gateways in test suites and local staging.',
        withoutItRisk: 'Tight coupling makes testing edge cases, timeouts, and gateway failure cascades virtually impossible.',
        occurrencesCount: 2
      },
      {
        name: 'Idempotency Key Consumer',
        categoryLabel: 'Concurrency & Reliability',
        astScore: 'Mission Critical',
        healthStatus: 'Active',
        plainDefinition: 'Guarantees that repeating an identical payment request returns the cached result without double charging.',
        whyItMatters: 'Prevents duplicate charges during spotty mobile network re-transmissions or sudden upstream gateway timeouts.',
        withoutItRisk: 'Customers get billed multiple times for a single checkout tap, triggering high chargeback ratios and revenue leaks.',
        occurrencesCount: 2
      },
      {
        name: 'Saga Pattern (Compensating Actions)',
        categoryLabel: 'Behavioral / Distributed Transactions',
        astScore: 'Resilient',
        healthStatus: 'Compensating Actions Active',
        plainDefinition: 'Manages distributed multi-step transactions using explicit compensating rollbacks when any intermediate step fails.',
        whyItMatters: 'Enables multi-gateway card settlement and ledger balance adjustments without locking multiple databases via 2PC.',
        withoutItRisk: 'Partial failures leave external Stripe refunds processed while local merchant accounts remain un-debited.',
        occurrencesCount: 1
      }
    ],
    risks: [
      {
        title: 'In-Place Mutation Under Async Latency',
        severity: 'CRITICAL',
        affectedFile: 'src/services/RefundService.js:74',
        description: 'PaymentContext payload is mutated in-place prior to ledger write. Breaks idempotency if an unhandled promise rejection occurs during external gateway round-trip.',
        remediation: 'Extract paymentContext hydration into a pure, immutable value object builder using Object.freeze.'
      },
      {
        title: 'Distributed Lock Drift Hazard',
        severity: 'HIGH',
        affectedFile: 'src/services/RefundService.js:33',
        description: 'Redis Redlock TTL (15,000ms) could expire under heavy replica lag (>120ms), allowing concurrent double-capture if Stripe latency spikes.',
        remediation: 'Implement Redis Redlock lease renewal heartbeat background loop during active gateway TLS handshakes.'
      },
      {
        title: 'Non-Transactional Audit Emission',
        severity: 'MODERATE',
        affectedFile: 'src/services/RefundService.js:118',
        description: 'Audit log event is published to Kafka before database transaction commits, risking phantom audit logs if DB transaction rolls back.',
        remediation: 'Adopt the Transactional Outbox Pattern: write event to outbox table inside DB transaction and relay via CDC worker.'
      }
    ],
    dependencies: {
      internal: [
        { from: 'RefundController.js', to: 'RefundService.js', type: 'calls', contract: 'invokeProcessRefund(req.body, req.user)' },
        { from: 'AdminPanel.js', to: 'RefundService.js', type: 'calls', contract: 'forceAuthorizeRefund(overrideToken, refundId)' },
        { from: 'RefundService.js', to: 'LedgerRepository.js', type: 'writes', contract: 'commitDoubleEntryDebit(txPayload)' },
        { from: 'RefundService.js', to: 'StripeGateway.ts', type: 'calls', contract: 'createChargeReversal(ctx.chargeId, ctx.cents)' },
        { from: 'RefundService.js', to: 'RedisCache', type: 'calls', contract: 'acquireRedlock(ctx.idempotencyKey, 15000)' }
      ],
      external: [
        { name: 'PostgreSQL 16', type: 'Primary Relational Database', usage: 'Double-entry balance ledger with ACID transactions', status: 'Connected' },
        { name: 'Redis 7.2 Cluster', type: 'Distributed Key-Value Store', usage: 'Idempotency mutex locks & volatile-lru token bucket', status: 'Healthy' },
        { name: 'Apache Kafka', type: 'Event Bus', usage: 'Publishing audit and settlement event topics', status: 'Active' },
        { name: 'Stripe API v14.1', type: 'Payment Processor Gateway', usage: 'Card refund requests and webhook event verification', status: 'Operational' }
      ]
    },
    testCoverage: {
      overallPercentage: 84.6,
      breakdown: [
        { layer: 'Core Settlement Services', percentage: 92.1 },
        { layer: 'Repositories & SQL Models', percentage: 96.0 },
        { layer: 'HTTP Edge Controllers', percentage: 81.5 },
        { layer: 'External Gateway Adapters', percentage: 78.4 },
        { layer: 'Background Workers & Cron', percentage: 64.2 }
      ],
      criticalUncovered: 'Double-capture edge case when Redis lock fails concurrently during 3DS callback resolution under high network jitter.',
      testSuitesCount: 42,
      totalTestsCount: 318
    }
  };
}

// Universal export
const ByakuganReport = {
  generateReport,
  escapeHtml,
  buildDefaultAnalysisData,
  renderCodebaseMetrics,
  renderTechStack,
  renderImpactSight,
  renderFilesExplorer,
  renderChakraNetwork,
  renderTechniques,
  renderRisks,
  renderDependencies,
  renderTestCoverage
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ByakuganReport;
}

export default ByakuganReport;
export {
  generateReport,
  escapeHtml,
  buildDefaultAnalysisData,
  renderCodebaseMetrics,
  renderTechStack,
  renderImpactSight,
  renderFilesExplorer,
  renderChakraNetwork,
  renderTechniques,
  renderRisks,
  renderDependencies,
  renderTestCoverage
};
