// knowledgeBundle.js — Build-time imports for all knowledge/agent files.
// Replaces runtime readFileSync calls in aiResearch.js, onePagerGenerator.js,
// and pipelineManager.js so the pipeline can run in the browser.
//
// Vite ?raw imports resolve at build time — the file contents become string
// constants in the JavaScript bundle. No filesystem access needed at runtime.

// ─── Curriculum & Context Files (16 unique paths from agent configs) ────────

import advancedFinancialAnalysis from '../../knowledge/research-references/advanced-financial-analysis.md?raw';
import buffettWritingStyleGuide from '../../knowledge/research-references/buffett-writing-style-guide.md?raw';
import capexCashFlowExplained from '../../knowledge/research-references/capex-cash-flow-explained.md?raw';
import equityBondResearch from '../../knowledge/research-references/equity-bond-research.md?raw';
import fgr from '../../knowledge/research-references/fgr.md?raw';
import guruList from '../../knowledge/research-references/guru-list.md?raw';
import rule1Workflow from '../../knowledge/research-references/rule-1-workflow.md?raw';
import ruleOneFundamentals from '../../knowledge/research-references/rule-one-fundamentals.md?raw';
import toolsForAnalysis from '../../knowledge/research-references/tools-for-analysis.md?raw';
import onePagerCurriculum from '../../knowledge/stage-1-one-pager/one-pager.md?raw';
import onePagerTemplate from '../../knowledge/stage-1-one-pager/template.md?raw';
import pitchDeckI from '../../knowledge/stage-2-pitch-deck/pitch-deck-I.md?raw';
import pitchDeckII from '../../knowledge/stage-2-pitch-deck/pitch-deck-II.md?raw';
import pitchDeckIII from '../../knowledge/stage-2-pitch-deck/pitch-deck-III.md?raw';
import pitchDeckIV from '../../knowledge/stage-2-pitch-deck/pitch-deck-IV.md?raw';
import storyFormI from '../../knowledge/stage-3-full-story/story-form-I.md?raw';
import storyFormII from '../../knowledge/stage-3-full-story/story-form-II.md?raw';

// Path→content map. Agent configs reference curriculum by file path string,
// so loadCurriculum() needs to resolve paths to content.
export const CURRICULUM_MAP = {
  'knowledge/research-references/advanced-financial-analysis.md': advancedFinancialAnalysis,
  'knowledge/research-references/buffett-writing-style-guide.md': buffettWritingStyleGuide,
  'knowledge/research-references/capex-cash-flow-explained.md': capexCashFlowExplained,
  'knowledge/research-references/equity-bond-research.md': equityBondResearch,
  'knowledge/research-references/fgr.md': fgr,
  'knowledge/research-references/guru-list.md': guruList,
  'knowledge/research-references/rule-1-workflow.md': rule1Workflow,
  'knowledge/research-references/rule-one-fundamentals.md': ruleOneFundamentals,
  'knowledge/research-references/tools-for-analysis.md': toolsForAnalysis,
  'knowledge/stage-1-one-pager/one-pager.md': onePagerCurriculum,
  'knowledge/stage-1-one-pager/template.md': onePagerTemplate,
  'knowledge/stage-2-pitch-deck/pitch-deck-I.md': pitchDeckI,
  'knowledge/stage-2-pitch-deck/pitch-deck-II.md': pitchDeckII,
  'knowledge/stage-2-pitch-deck/pitch-deck-III.md': pitchDeckIII,
  'knowledge/stage-2-pitch-deck/pitch-deck-IV.md': pitchDeckIV,
  'knowledge/stage-3-full-story/story-form-I.md': storyFormI,
  'knowledge/stage-3-full-story/story-form-II.md': storyFormII,
};

// ─── Agent Configs (JSON) ──────────────────────────────────────────────────

import annualReaderConfig from '../../agents/annual-reader/config.json';
import businessAnalystConfig from '../../agents/business-analyst/config.json';
import competitorEvaluatorConfig from '../../agents/competitor-evaluator/config.json';
import dataAssemblerConfig from '../../agents/data-assembler/config.json';
import financialAnalystConfig from '../../agents/financial-analyst/config.json';
import managementEvaluatorConfig from '../../agents/management-evaluator/config.json';
import primarySourceReaderConfig from '../../agents/primary-source-reader/config.json';
import quarterlyReaderConfig from '../../agents/quarterly-reader/config.json';
import riskAnalystConfig from '../../agents/risk-analyst/config.json';
import synthesisWriterConfig from '../../agents/synthesis-writer/config.json';
import valuationSpecialistConfig from '../../agents/valuation-specialist/config.json';

export const AGENT_CONFIGS = {
  'annual-reader': annualReaderConfig,
  'business-analyst': businessAnalystConfig,
  'competitor-evaluator': competitorEvaluatorConfig,
  'data-assembler': dataAssemblerConfig,
  'financial-analyst': financialAnalystConfig,
  'management-evaluator': managementEvaluatorConfig,
  'primary-source-reader': primarySourceReaderConfig,
  'quarterly-reader': quarterlyReaderConfig,
  'risk-analyst': riskAnalystConfig,
  'synthesis-writer': synthesisWriterConfig,
  'valuation-specialist': valuationSpecialistConfig,
};

// ─── Agent Prompts (base + stage overlays) ─────────────────────────────────

import annualReaderPrompt from '../../agents/annual-reader/prompt.md?raw';
import businessAnalystPrompt from '../../agents/business-analyst/prompt.md?raw';
import competitorEvaluatorPrompt from '../../agents/competitor-evaluator/prompt.md?raw';
import financialAnalystPrompt from '../../agents/financial-analyst/prompt.md?raw';
import managementEvaluatorPrompt from '../../agents/management-evaluator/prompt.md?raw';
import primarySourceReaderPrompt from '../../agents/primary-source-reader/prompt.md?raw';
import quarterlyReaderPrompt from '../../agents/quarterly-reader/prompt.md?raw';
import riskAnalystPrompt from '../../agents/risk-analyst/prompt.md?raw';
import synthesisWriterPrompt from '../../agents/synthesis-writer/prompt.md?raw';
import valuationSpecialistPrompt from '../../agents/valuation-specialist/prompt.md?raw';

// Stage-specific overlays (appended to base prompt for that stage)
import businessAnalystFullStory from '../../agents/business-analyst/prompts/fullStory.md?raw';
import competitorEvaluatorFullStory from '../../agents/competitor-evaluator/prompts/fullStory.md?raw';
import financialAnalystFullStory from '../../agents/financial-analyst/prompts/fullStory.md?raw';
import managementEvaluatorFullStory from '../../agents/management-evaluator/prompts/fullStory.md?raw';
import riskAnalystFullStory from '../../agents/risk-analyst/prompts/fullStory.md?raw';
import synthesisWriterFullStory from '../../agents/synthesis-writer/prompts/fullStory.md?raw';
import valuationSpecialistFullStory from '../../agents/valuation-specialist/prompts/fullStory.md?raw';

// { role: { base, fullStory? } }
export const AGENT_PROMPTS = {
  'annual-reader': { base: annualReaderPrompt },
  'business-analyst': { base: businessAnalystPrompt, fullStory: businessAnalystFullStory },
  'competitor-evaluator': { base: competitorEvaluatorPrompt, fullStory: competitorEvaluatorFullStory },
  'financial-analyst': { base: financialAnalystPrompt, fullStory: financialAnalystFullStory },
  'management-evaluator': { base: managementEvaluatorPrompt, fullStory: managementEvaluatorFullStory },
  'primary-source-reader': { base: primarySourceReaderPrompt },
  'quarterly-reader': { base: quarterlyReaderPrompt },
  'risk-analyst': { base: riskAnalystPrompt, fullStory: riskAnalystFullStory },
  'synthesis-writer': { base: synthesisWriterPrompt, fullStory: synthesisWriterFullStory },
  'valuation-specialist': { base: valuationSpecialistPrompt, fullStory: valuationSpecialistFullStory },
};

// ─── Dispatch Table ────────────────────────────────────────────────────────

export { default as DISPATCH_TABLE } from '../../agents/orchestrator/dispatch-table.json';

// ─── Named Exports for One-Pager Generator ─────────────────────────────────
// onePagerGenerator.js references these directly by name, not by path.

export {
  onePagerCurriculum,
  onePagerTemplate,
  buffettWritingStyleGuide,
};
