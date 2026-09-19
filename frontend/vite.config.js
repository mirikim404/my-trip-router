import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0으로 열어야 같은 Wi-Fi의 폰에서 http://<PC-IP>:5173 으로 접속돼요.
    host: true,
    port: 5173,
    // ngrok / cloudflared 같은 터널 주소로 열 때 필요해요.
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.trycloudflare.com', '.loca.lt'],
    // /api 요청은 백엔드(3001)로 넘겨요. 폰에서도 localhost 걱정이 없어져요.
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
