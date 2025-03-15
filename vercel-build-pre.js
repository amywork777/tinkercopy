import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('VERCEL BUILD: Pre-build verification starting...');

// Check for zustand and other critical dependencies
const dependencies = ['zustand', 'three', 'react', 'react-dom'];
const nodeModulesPath = path.resolve(__dirname, 'node_modules');

dependencies.forEach(dep => {
  const depPath = path.join(nodeModulesPath, dep);
  const exists = fs.existsSync(depPath);
  console.log(`VERCEL BUILD: Checking ${dep} - ${exists ? 'FOUND' : 'MISSING'}`);

  if (!exists) {
    console.error(`VERCEL BUILD ERROR: ${dep} is missing!`);
  }
});

// Check if the hooks directory exists
const hooksPath = path.resolve(__dirname, 'client', 'src', 'hooks');
if (fs.existsSync(hooksPath)) {
  console.log('VERCEL BUILD: hooks directory exists');
  
  // List files in the hooks directory
  const files = fs.readdirSync(hooksPath);
  console.log('VERCEL BUILD: hooks directory contents:', files);
  
  // Check specific files
  const useScenePath = path.join(hooksPath, 'use-scene.ts');
  if (fs.existsSync(useScenePath)) {
    console.log('VERCEL BUILD: use-scene.ts file exists');
    const content = fs.readFileSync(useScenePath, 'utf8');
    console.log('VERCEL BUILD: use-scene.ts first line:', content.split('\n')[0]);
  } else {
    console.log('VERCEL BUILD: use-scene.ts file is missing!');
  }
} else {
  console.log('VERCEL BUILD: hooks directory is missing!');
}

console.log('VERCEL BUILD: Pre-build verification completed'); 