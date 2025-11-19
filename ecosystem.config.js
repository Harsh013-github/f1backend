module.exports = {
  apps: [
    {
      name: 'f1-cars-api',
      script: 'index.js',
      // Automatically restarts on crash or file changes (in dev)
      watch: process.env.NODE_ENV === 'development',

      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        API: '/api',
        SERVER_PUBLIC_URL: 'http://localhost:3000',
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_KEY: process.env.SUPABASE_KEY,
        JWT_SECRET: process.env.JWT_SECRET,
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        API: '/api',
        SERVER_PUBLIC_URL: 'http://localhost:3000',
        ALLOWED_ORIGINS: '',
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_KEY: process.env.SUPABASE_KEY,
        JWT_SECRET: process.env.JWT_SECRET,
      },
    },
  ],
};
