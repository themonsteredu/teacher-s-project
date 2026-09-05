'use strict';

const { one } = require('../lib/db');

module.exports = async (_req, res) => {
  const removed = await one(
    "DELETE FROM boards WHERE title = 'Career Log E2E · science observation' RETURNING id",
  );
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: true, removed: !!removed }));
};
