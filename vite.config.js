import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: './',
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        imports: ['vue', 'vue-router', 'pinia'],
      }),
      Components({
        resolvers: [ElementPlusResolver()],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5174,
      host: '0.0.0.0',
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://192.168.31.91:30002',
          changeOrigin: true,
          secure: true,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
            })
            proxy.on('proxyRes', (proxyRes) => {
              const cookies = proxyRes.headers['set-cookie']
              if (!cookies) return
              proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
                cookie.replace(/;\s*Secure/gi, ''))
            })
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'element-plus'
            if (id.includes('vue-router')) return 'vue-router'
            if (id.includes('pinia')) return 'pinia'
            if (id.includes('node_modules/vue/')) return 'vue'
            return 'vendor'
          },
        },
      },
    },
    /**
     * 单测超时：本仓有若干「源码扫描」守卫用例（terms / admin-copy / currency-guard / media），
     * 单个文件要遍历 src/**，机器并行跑后端 Maven/容器时容易超过 vitest 默认 5s 而**假失败**
     * （同一状态用 --testTimeout=60000 即全绿）。这里统一放宽到 20s，避免把机器负载误报成回归。
     */
    test: {
      testTimeout: 20000,
    },
  }
})
