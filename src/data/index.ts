/**
 * Ghost Evaluator v15.3 - Data Collection Module
 * ===============================================
 * Exports all data collection and analysis functionality
 */

// Types
export * from './types';

// Play Logger
export {
  PlayLogger,
  createPlayLogger,
  generateSessionId,
} from './play-logger';

// Session Recorder
export {
  SessionRecorder,
  createSessionRecorder,
  loadSession,
  loadAllSessions,
  listSessionFiles,
  loadResearchData,
  loadResearchDataForSession,
  listResearchFiles,
} from './session-recorder';

// Research Logger (P1/B&S Data Collection)
export {
  ResearchLogger,
  createResearchLogger,
} from './research-logger';

// Research Types
export * from './research-types';

// Research Testing Framework
export {
  ResearchTestRunner,
  createResearchTestRunner,
  ALL_HYPOTHESES,
  P1_HYPOTHESES,
  BNS_HYPOTHESES,
  INDICATOR_HYPOTHESES,
} from './research-testing';
export type {
  Hypothesis,
  HypothesisResult,
  TestingData,
} from './research-testing';

// Recorded Session Manager
export {
  RecordedSessionManager,
  createRecordedSessionManager,
} from './recorded-session-manager';

// Analysis
export {
  DataLoader,
  filterPlays,
  analyzePatternPerformance,
  analyzeBySessionState,
  analyzeP1Mode,
  generateOverallAnalysis,
  exportAnalysisToJson,
  exportPlaysToCSV,
  findPatternPlays,
  findPreP1Plays,
  findUnplayablePeriods,
} from './analysis';
