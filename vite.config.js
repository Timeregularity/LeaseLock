import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment:'jsdom', setupFiles:'./src/test/setup.js', include:['src/**/*.test.{js,jsx}'] },
  server: {
    port: 3000,
    proxy: {
      '/v1': { target: 'http://localhost:8080', changeOrigin: true }
    }
  }
})
