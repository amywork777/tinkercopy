import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import { resolve } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure critical dependencies are properly resolved
function ensureResolvePlugin() {
  return {
    name: 'ensure-resolve',
    resolveId(id: string) {
      // Special handling for zustand
      if (id === 'zustand' || id.startsWith('zustand/')) {
        try {
          // First try the base package
          const zustandBasePath = path.resolve(__dirname, 'node_modules/zustand');
          if (id === 'zustand') {
            // Try different possible entry points
            const possibleEntries = [
              path.join(zustandBasePath, 'dist/index.mjs'),
              path.join(zustandBasePath, 'dist/index.js'),
              path.join(zustandBasePath, 'index.mjs'),
              path.join(zustandBasePath, 'index.js'),
              path.join(zustandBasePath, 'esm/index.js'),
              zustandBasePath // fallback to the package itself
            ];
            
            for (const entry of possibleEntries) {
              try {
                if (fs.existsSync(entry)) {
                  console.log(`VITE: Found zustand at ${entry}`);
                  return entry;
                }
              } catch (e) {
                // Continue to next path
              }
            }
            
            // If we couldn't find a specific file, return the package directory
            console.log(`VITE: Using zustand base path: ${zustandBasePath}`);
            return zustandBasePath;
          }
        } catch (e) {
          console.error(`VITE: Failed to resolve zustand:`, e);
        }
      }
      
      // Handle three.js special cases
      if (id.startsWith('three/examples/') || id.startsWith('three/addons/')) {
        const threeBasePath = path.resolve(__dirname, 'node_modules/three');
        const relativePath = id.replace('three/', '');
        const fullPath = path.join(threeBasePath, relativePath);
        console.log(`VITE: Resolving Three.js path ${id} to ${fullPath}`);
        return fullPath;
      }
      
      // Explicitly handle these modules to prevent resolution issues
      if (['three', 'three-csg-ts', 'framer-motion'].includes(id)) {
        try {
          const resolvedPath = resolve(`./node_modules/${id}`);
          console.log(`VITE: Explicitly resolved ${id} to ${resolvedPath}`);
          return resolvedPath;
        } catch (e) {
          console.error(`VITE: Failed to resolve ${id}:`, e);
        }
      }
      
      return null;
    }
  };
}

export default defineConfig({
  optimizeDeps: {
    include: [
      'zustand', 
      'three', 
      'three-csg-ts', 
      'framer-motion',
      'three/examples/jsm/loaders/STLLoader.js',
      'three/examples/jsm/exporters/STLExporter.js',
      'three/examples/jsm/controls/OrbitControls.js',
      'three/examples/jsm/loaders/SVGLoader.js',
      'three/examples/jsm/loaders/FontLoader.js',
      'three/examples/jsm/geometries/TextGeometry.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js'
    ],
    force: true,
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis'
      },
    }
  },
  plugins: [
    ensureResolvePlugin(),
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "three": path.resolve(__dirname, "node_modules/three"),
      "three-csg-ts": path.resolve(__dirname, "node_modules/three-csg-ts/lib/esm"),
      "framer-motion": path.resolve(__dirname, "node_modules/framer-motion/dist/framer-motion.js")
    },
    dedupe: ['zustand', 'three', 'react', 'react-dom', 'framer-motion'],
    preserveSymlinks: true
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
      requireReturnsDefault: 'auto',
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs']
    },
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "client/index.html"),
      },
      external: [], // Keep no externals
      output: {
        manualChunks: (id: string) => {
          // Put all node_modules code in vendor chunk for better caching
          if (id.includes('node_modules')) {
            if (id.includes('zustand') || 
                id.includes('three') || 
                id.includes('framer-motion')) {
              return 'vendor-critical';
            }
            return 'vendor';
          }
          return null;
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    assetsDir: "assets"
  },
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
    proxy: {
      "/api": {
        target: "http://localhost:9090",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
});
