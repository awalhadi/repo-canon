'use strict';

/**
 * Standard generic module folders searched when no specific preset matches.
 */
const GENERIC_MODULE_ROOTS = [
  'src/modules',
  'src/features',
  'src/domains',
  'modules',
  'packages',
  'apps',
  'services',
  'internal',
  'cmd',
  'lib'
];

/**
 * Fallback folders inspected if no modules are identified through presets or generic roots.
 */
const FALLBACK_MODULE_ROOTS = [
  'src',
  'app',
  'server',
  'client',
  'backend',
  'frontend',
  'api',
  'web'
];

/**
 * Helper to check if a stack list contains a specific name.
 * @param {string[]} stacks
 * @param {string} target
 * @returns {boolean}
 */
function hasStack(stacks, target) {
  return Array.isArray(stacks) && stacks.includes(target);
}

/**
 * Presets mapping tech stacks to module discovery root folders or marker patterns.
 */
const PRESETS = {
  laravel: {
    match: stacks => hasStack(stacks, 'Laravel'),
    roots: [
      'app/Modules',
      'app/Domain',
      'app/Domains',
      'app/Services',
      'app/Actions',
      'app/Http/Controllers',
      'app/Models',
      'app/Policies',
      'app/Jobs',
      'resources/js/Pages',
      'resources/js/pages',
      'resources/views',
      'resources/js/features',
      'resources/js/views',
      'resources/js/modules',
      'resources/js/store/modules',
      'packages'
    ]
  },
  nextjs: {
    match: stacks => hasStack(stacks, 'Next.js') || hasStack(stacks, 'Nuxt'),
    roots: [
      'src/features',
      'src/modules',
      'src/app',
      'app',
      'features',
      'modules'
    ]
  },
  react: {
    match: stacks => hasStack(stacks, 'React') && !hasStack(stacks, 'Next.js'),
    roots: [
      'src/features',
      'src/pages',
      'src/modules'
    ]
  },
  vue: {
    match: stacks => hasStack(stacks, 'Vue') && !hasStack(stacks, 'Nuxt'),
    roots: [
      'src/views',
      'src/features',
      'src/modules',
      'src/store/modules',
      'resources/js/views',
      'resources/js/Pages'
    ]
  },
  nestjs: {
    match: stacks => hasStack(stacks, 'NestJS'),
    marker: /\.module\.ts$/
  },
  node: {
    match: stacks => hasStack(stacks, 'Express') || hasStack(stacks, 'Hono') || hasStack(stacks, 'Fastify'),
    roots: [
      'src/modules',
      'src/routes',
      'src/services',
      'src/controllers',
      'src/features'
    ]
  },
  django: {
    match: stacks => hasStack(stacks, 'Django'),
    marker: /(^|\/)(apps|models)\.py$/
  },
  rails: {
    match: stacks => hasStack(stacks, 'Rails'),
    roots: [
      'app/services',
      'app/models',
      'app/controllers',
      'app/jobs',
      'engines'
    ]
  },
  go: {
    match: stacks => hasStack(stacks, 'Go'),
    roots: [
      'internal',
      'cmd',
      'pkg'
    ]
  },
  tauri: {
    match: stacks => hasStack(stacks, 'Tauri'),
    roots: [
      'src-tauri/src',
      'src/features'
    ]
  }
};

module.exports = {
  PRESETS,
  GENERIC_MODULE_ROOTS,
  FALLBACK_MODULE_ROOTS,
  GENERIC: GENERIC_MODULE_ROOTS,
  FALLBACK: FALLBACK_MODULE_ROOTS
};
