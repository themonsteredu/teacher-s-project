'use strict';
const { Client } = require('pg');

// Use the same parser as the real pg connection (including URI query overrides).
// Return only allowlisted metadata; never return a host, user, URI or password.
function databaseTarget(connectionString) {
  if (!connectionString) return { kind: 'missing' };
  try {
    const params = new Client({ connectionString }).connectionParameters;
    const direct = /^db\.([a-z]{20})\.supabase\.co$/.exec(params.host || '');
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(params.host || '');
    if (!direct && !pooler) return { kind: 'unrecognized' };
    const userProject = /^[a-z][a-z0-9_]*\.([a-z]{20})$/.exec(params.user || '');
    const password = params.password;
    const placeholder = ['[YOUR-PASSWORD]', '[YOUR_PASSWORD]', '[PASSWORD]'].includes(password);
    return {
      kind: direct ? 'supabase_direct' : 'supabase_pooler',
      projectRef: direct ? direct[1] : (userProject ? userProject[1] : 'unrecognized'),
      port: Number.isInteger(params.port) && params.port > 0 && params.port <= 65535 ? params.port : 'invalid',
      credential: !password ? 'missing' : (placeholder ? 'placeholder' : 'present'),
    };
  } catch { return { kind: 'invalid' }; }
}

module.exports = { databaseTarget };
