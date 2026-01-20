#!/usr/bin/env node

/**
 * Setup script for FLPerformance
 * Checks prerequisites and sets up the application
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🚀 FLPerformance Setup\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

console.log(`✓ Node.js version: ${nodeVersion}`);

if (majorVersion < 18) {
  console.error('❌ Node.js 18 or higher is required');
  process.exit(1);
}

// Check for Foundry Local
console.log('\n📦 Checking for Foundry Local...');

async function checkFoundryLocal() {
  const commands = ['foundry-local --version', 'foundry --version', 'fl --version'];
  
  for (const cmd of commands) {
    try {
      const { stdout } = await execAsync(cmd);
      console.log(`✓ Foundry Local found: ${stdout.trim()}`);
      return true;
    } catch (err) {
      // Continue to next command
    }
  }
  
  console.warn('⚠️  Foundry Local not found in PATH');
  console.warn('   Please install Foundry Local before running the application');
  console.warn('   Visit: https://aka.ms/foundry-local');
  return false;
}

// Create required directories
console.log('\n📁 Creating directories...');

const dirs = [
  'logs',
  'results',
  'results/example'
];

dirs.forEach(dir => {
  const dirPath = path.join(rootDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created ${dir}`);
  } else {
    console.log(`✓ ${dir} exists`);
  }
});

// Check npm
console.log('\n📦 Checking npm...');
try {
  const { stdout } = await execAsync('npm --version');
  console.log(`✓ npm version: ${stdout.trim()}`);
} catch (err) {
  console.error('❌ npm not found');
  process.exit(1);
}

// Run main setup
async function setup() {
  await checkFoundryLocal();
  
  console.log('\n📦 Installing dependencies...');
  console.log('   This may take a few minutes...\n');
  
  try {
    // Install root dependencies
    console.log('Installing server dependencies...');
    await execAsync('npm install', { cwd: rootDir });
    console.log('✓ Server dependencies installed\n');
    
    // Install client dependencies
    console.log('Installing client dependencies...');
    const clientDir = path.join(rootDir, 'src', 'client');
    await execAsync('npm install', { cwd: clientDir });
    console.log('✓ Client dependencies installed\n');
    
    console.log('✅ Setup complete!\n');
    console.log('📖 Next steps:');
    console.log('   1. Review the README.md for prerequisites');
    console.log('   2. Ensure Foundry Local is installed and configured');
    console.log('   3. Run "npm run dev" to start the application\n');
    console.log('🌐 The application will be available at:');
    console.log('   Frontend: http://localhost:3000');
    console.log('   API:      http://localhost:3001\n');
    
  } catch (err) {
    console.error('❌ Installation failed:', err.message);
    process.exit(1);
  }
}

setup();
