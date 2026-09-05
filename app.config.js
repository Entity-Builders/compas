const { createAppConfig } = require('@entity-builders/expo-config');

module.exports = createAppConfig({
  name: 'compas',
  slug: 'compas',
  version: '0.1.0',
  projectId: '2db67b29-cd37-412d-ba48-82f99f711150',
  scheme: 'compas',
  bundleIdentifier: {
    ios: 'com.entitybuilders.compas',
    android: 'com.entitybuilders.compas',
  },
  extra: {
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV || process.env.APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_SUPABASE_SCHEMA:
      process.env.EXPO_PUBLIC_SUPABASE_SCHEMA || 'compas',
  },
});
