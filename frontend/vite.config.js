import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const certPath = path.resolve(__dirname, env.VITE_DEV_SSL_CERT || "certs/dev-cert.pem");
    const keyPath = path.resolve(__dirname, env.VITE_DEV_SSL_KEY || "certs/dev-key.pem");
    const hasHttpsCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

    return {
        plugins: [react(), tailwindcss()],
        server: {
            host: true,
            https: hasHttpsCerts
                ? {
                    cert: fs.readFileSync(certPath),
                    key: fs.readFileSync(keyPath),
                }
                : false,
            proxy: {
                "/api": {
                    target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
    };
});
