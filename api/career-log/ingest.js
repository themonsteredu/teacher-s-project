'use strict';

const { handleCareerLogIngest } = require('../../lib/career-log');

module.exports = async (req, res) => {
  try {
    let body = req.body ?? null;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    await handleCareerLogIngest(req, res, body);
  } catch (error) {
    console.error('Career Log Hub bridge failed', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify({ error: 'career_log_bridge_failed' }));
  }
};
