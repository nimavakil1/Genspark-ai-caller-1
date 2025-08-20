module.exports = {
  apps: [
    {
      name: 'ai-sales-agent',
      script: 'python3',
      args: 'run_sales_agent.py',
      cwd: '/home/user/webapp/ai-sales-agent',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8000,
        PYTHONPATH: '/home/user/webapp/ai-sales-agent/src'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 4000,
      autorestart: true
    }
  ]
}