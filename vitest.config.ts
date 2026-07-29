import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for DOM testing
    environment: 'jsdom',
    
    // Global test setup
    globals: true,
    
    // Include test files
    include: ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    
    // Exclude node_modules and other directories
    exclude: ['node_modules', 'dist', '.next', 'build'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'tests/**',
        '**/*.config.*',
        '.next/**',
        'dist/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Hook timeout
    hookTimeout: 10000,
    
    // Setup files
    setupFiles: ['./tests/setup.ts'],
    
    // CSS modules support
    css: {
      modules: {
        classNameStrategy: 'non-scoped'
      }
    },
    
    // Resolve aliases
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/domains': path.resolve(__dirname, './src/domains'),
        '@/infrastructure': path.resolve(__dirname, './src/infrastructure'),
        '@/shared': path.resolve(__dirname, './src/shared'),
        '@/app': path.resolve(__dirname, './src/app')
      }
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/domains': path.resolve(__dirname, './src/domains'),
      '@/infrastructure': path.resolve(__dirname, './src/infrastructure'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/app': path.resolve(__dirname, './src/app')
    }
  }
});