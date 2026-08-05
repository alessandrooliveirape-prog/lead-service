module.exports = {
  apps: [
    {
      name: 'lead-service',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        AUTOPILOT_AUTOSTART: 'true'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        AUTOPILOT_AUTOSTART: 'false'
      }
    }
  ]
};
