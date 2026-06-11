import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'KVM Share',
        short_name: 'KVM',
        description: 'Seamless IP-Agnostic Input & Clipboard Sync',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3616/3616238.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
