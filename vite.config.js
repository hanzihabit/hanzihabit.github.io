import { defineConfig } from 'vite';

// Relative paths let the same bundle work at username.github.io/repository/.
export default defineConfig({ base: './' });
