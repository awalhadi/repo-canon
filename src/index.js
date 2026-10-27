'use strict';

// Core modules
const constants = require('./core/constants');
const errors = require('./core/errors');
const git = require('./core/git');
const fs = require('./core/fs');
const frontmatter = require('./core/frontmatter');
const blocks = require('./core/blocks');
const config = require('./core/config');
const tokens = require('./core/tokens');
const detector = require('./core/detector');
const presets = require('./core/presets');
const modules = require('./core/modules');
const targets = require('./core/targets');

// Services
const initService = require('./services/init.service');
const analyzeService = require('./services/analyze.service');
const doctorService = require('./services/doctor.service');
const statusService = require('./services/status.service');
const syncService = require('./services/sync.service');
const packService = require('./services/pack.service');
const promptService = require('./services/prompt.service');
const factsService = require('./services/facts.service');
const hookService = require('./services/hook.service');
const targetsService = require('./services/targets.service');
const inferableService = require('./services/inferable.service');
const adoptService = require('./services/adopt.service');
const skillsService = require('./services/skills.service');

// CLI & MCP
const cli = require('./cli/router');
const mcp = require('./mcp/server');

module.exports = {
  // Domain Services
  init: initService.initProject,
  analyze: analyzeService.analyzeProject,
  overview: analyzeService.getProjectOverview,
  doctor: doctorService.runDoctor,
  status: statusService.getDocStatus,
  stamp: statusService.stampDocs,
  sync: syncService.syncProject,
  formatSyncReport: syncService.formatSyncReport,
  pack: packService.packContext,
  moduleMap: packService.getModuleMap,
  buildFill: promptService.buildFillPrompt,
  facts: factsService.collectProjectFacts,
  installHook: hookService.installPreCommitHook,
  planTargets: targetsService.planTargets,
  applyTargets: targetsService.applyTargets,
  findInferable: inferableService.findInferableContent,
  adopt: adoptService.adoptProject,
  planSkills: skillsService.planSkills,
  applySkills: skillsService.applySkills,

  // Infrastructure & Core
  core: {
    constants,
    errors,
    git,
    fs,
    frontmatter,
    blocks,
    config,
    tokens,
    detector,
    presets,
    modules,
    targets
  },

  // CLI & MCP
  cli,
  mcp
};
