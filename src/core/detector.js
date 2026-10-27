'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read } = require('./fs');

const DEPENDENCY_STACK_MAP = [
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['nuxt', 'Nuxt'],
  ['svelte', 'Svelte'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['astro', 'Astro'],
  ['@nestjs/core', 'NestJS'],
  ['express', 'Express'],
  ['hono', 'Hono'],
  ['fastify', 'Fastify'],
  ['@tauri-apps/api', 'Tauri'],
  ['electron', 'Electron'],
  ['expo', 'Expo'],
  ['react-native', 'React Native'],
  ['typescript', 'TypeScript'],
  ['tailwindcss', 'Tailwind'],
  ['prisma', 'Prisma'],
  ['drizzle-orm', 'Drizzle'],
  ['@supabase/supabase-js', 'Supabase']
];

/**
 * The package manager a Node project uses, from its lockfile.
 *
 * @param {string} root
 * @returns {'pnpm'|'yarn'|'bun'|'npm'}
 */
function getPackageManager(root) {
  const hasFile = file => exists(path.join(root, file));
  if (hasFile('pnpm-lock.yaml')) return 'pnpm';
  if (hasFile('yarn.lock')) return 'yarn';
  if (hasFile('bun.lockb') || hasFile('bun.lock')) return 'bun';
  return 'npm';
}

/**
 * How to run a package.json script with the project's package manager.
 * `bun test` is bun's own test runner, so bun scripts always go through `bun run`.
 *
 * @param {string} root
 * @returns {(script: string) => string}
 */
function getPackageRunner(root) {
  const manager = getPackageManager(root);
  return script => {
    if (manager === 'npm') return script === 'test' ? 'npm test' : `npm run ${script}`;
    if (manager === 'bun') return `bun run ${script}`;
    return `${manager} ${script}`;
  };
}

/**
 * Detects project name, tech stacks, and runner commands (run, test, lint).
 *
 * @param {string} root - Project root directory
 * @returns {{ name: string, stacks: string[], run: string, test: string, lint: string }}
 */
function detectProject(root) {
  const hasFile = file => exists(path.join(root, file));
  const stacks = [];
  let runCommand = 'TODO';
  let testCommand = 'TODO';
  let lintCommand = 'TODO';

  const addStack = stack => {
    if (!stacks.includes(stack)) {
      stacks.push(stack);
    }
  };

  // Node.js ecosystems
  if (hasFile('package.json')) {
    let pkg = {};
    try {
      pkg = JSON.parse(read(path.join(root, 'package.json')) || '{}');
    } catch {
      // Ignore malformed package.json
    }

    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    addStack('Node.js');

    for (const [dep, stackName] of DEPENDENCY_STACK_MAP) {
      if (dependencies[dep]) {
        addStack(stackName);
      }
    }

    const scripts = pkg.scripts || {};
    const runner = getPackageRunner(root);

    if (scripts.dev) {
      runCommand = runner('dev');
    } else if (scripts.start) {
      runCommand = runner('start');
    }

    if (scripts.test) {
      testCommand = runner('test');
    }

    if (scripts.lint) {
      lintCommand = runner('lint');
    }
  }

  // PHP / Composer
  if (hasFile('composer.json')) {
    const composerJson = read(path.join(root, 'composer.json')) || '';
    addStack('PHP');

    if (composerJson.includes('laravel/framework')) {
      addStack('Laravel');
      if (runCommand === 'TODO') runCommand = 'php artisan serve';
      if (testCommand === 'TODO') testCommand = 'php artisan test';
    }
    if (composerJson.includes('symfony/')) {
      addStack('Symfony');
    }
  }

  // Python
  const pythonConfig = (read(path.join(root, 'pyproject.toml')) || '') + (read(path.join(root, 'requirements.txt')) || '');
  if (pythonConfig || hasFile('setup.py')) {
    addStack('Python');
    const lowerConfig = pythonConfig.toLowerCase();

    for (const [key, name] of [['django', 'Django'], ['fastapi', 'FastAPI'], ['flask', 'Flask']]) {
      if (lowerConfig.includes(key)) {
        addStack(name);
      }
    }
    if (testCommand === 'TODO') {
      testCommand = 'pytest';
    }
  }

  // Go
  if (hasFile('go.mod')) {
    addStack('Go');
    if (testCommand === 'TODO') testCommand = 'go test ./...';
    if (runCommand === 'TODO') runCommand = 'go run .';
  }

  // Rust
  if (hasFile('Cargo.toml')) {
    addStack('Rust');
    if (testCommand === 'TODO') testCommand = 'cargo test';
    if (runCommand === 'TODO') runCommand = 'cargo run';
  }

  if (hasFile('src-tauri')) {
    addStack('Tauri');
  }

  // Java / Kotlin
  if (hasFile('pom.xml')) {
    addStack('Java (Maven)');
    if (testCommand === 'TODO') testCommand = 'mvn test';
  }

  if (hasFile('build.gradle') || hasFile('build.gradle.kts')) {
    addStack('Java/Kotlin (Gradle)');
    if (testCommand === 'TODO') testCommand = './gradlew test';
  }

  // Ruby
  if (hasFile('Gemfile')) {
    addStack('Ruby');
    const gemfile = read(path.join(root, 'Gemfile')) || '';
    if (gemfile.includes('rails')) {
      addStack('Rails');
    }
  }

  // Flutter / Dart
  if (hasFile('pubspec.yaml')) {
    addStack('Flutter/Dart');
    if (testCommand === 'TODO') testCommand = 'flutter test';
  }

  // .NET
  try {
    const rootFiles = fs.readdirSync(root);
    if (rootFiles.some(f => /\.(csproj|sln)$/.test(f))) {
      addStack('.NET');
      if (testCommand === 'TODO') testCommand = 'dotnet test';
    }
  } catch {
    // Ignore directory read failure
  }

  // Docker
  if (hasFile('Dockerfile') || hasFile('docker-compose.yml') || hasFile('compose.yaml')) {
    addStack('Docker');
  }

  return {
    name: path.basename(path.resolve(root)),
    stacks,
    run: runCommand,
    test: testCommand,
    lint: lintCommand
  };
}

module.exports = {
  getPackageManager,
  getPackageRunner,
  detectProject,
  detect: detectProject
};
