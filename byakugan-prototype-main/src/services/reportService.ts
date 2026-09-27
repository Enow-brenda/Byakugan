// Byakugan Report Service — Connects application data to the report-generation layer
// @ts-ignore - Raw text template import via Vite
import htmlTemplate from '../../reports/template/report.html?raw';
// @ts-ignore - Raw text template import via Vite
import cssTemplate from '../../reports/template/report.css?raw';
// @ts-ignore - Report generator module
import { generateReport, buildDefaultAnalysisData } from '../../reports/report.js';

export interface GenerateReportOptions {
  targetFile?: string;
  download?: boolean;
  openTab?: boolean;
}

/**
 * Generates the full HTML report using structured Byakugan analysis data
 * and the official Byakugan HTML & CSS report templates.
 */
export function createByakuganReport(targetFile: string = 'src/services/PaymentProcessor.ts'): string {
  // 1. Structured Analysis Data
  const structuredData = buildDefaultAnalysisData(targetFile);

  // 2. Report Generator + Template -> Rendered Report
  const renderedHtml = generateReport(structuredData, {
    htmlTemplate,
    cssTemplate
  });

  return renderedHtml;
}

/**
 * Downloads the rendered HTML report as a standalone .html file
 */
export function downloadByakuganReport(targetFile: string = 'src/services/PaymentProcessor.ts', fileName: string = 'byakugan-report.html') {
  const html = createByakuganReport(targetFile);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Opens the rendered HTML report in a new browser tab/window
 */
export function openByakuganReportInNewTab(targetFile: string = 'src/services/PaymentProcessor.ts') {
  const html = createByakuganReport(targetFile);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
