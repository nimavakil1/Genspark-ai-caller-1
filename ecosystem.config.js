// PM2 Ecosystem Configuration for AI Sales System
module.exports = {
  apps: [
    {
      name: 'main-app',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/main-app-error.log',
      out_file: './logs/main-app-out.log',
      log_file: './logs/main-app-combined.log',
      time: true
    },
    {
      name: 'livekit-agent',
      script: 'python3',
      args: 'livekit_agent.py dev',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 5,
      min_uptime: '15s',
      env: {
        PATH: '/home/ubuntu/Genspark-ai-caller-1/livekit-env/bin:' + process.env.PATH,
        VIRTUAL_ENV: '/home/ubuntu/Genspark-ai-caller-1/livekit-env',
        LIVEKIT_URL: 'ws://localhost:7880',
        LIVEKIT_API_KEY: 'stable_key_2024',
        LIVEKIT_API_SECRET: 'stable_secret_that_is_long_enough_for_livekit_requirements_32chars',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'your_openai_api_key_here'
      },
      error_file: './logs/livekit-agent-error.log',
      out_file: './logs/livekit-agent-out.log',
      log_file: './logs/livekit-agent-combined.log',
      time: true
    }
  ]
};