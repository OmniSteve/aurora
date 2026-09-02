// BASE44 ADAPTER — SDK client instantiation.
// This file stays at src/api/base44Client.js because the Base44 tooling expects
// it here. It is imported ONLY by src/api/backend/base44.js. Delete on migration.
import { createClient } from '@base44/sdk';
import { appParams } from '@/api/backend/appParams';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
});