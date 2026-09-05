'use strict';

const { handleScienceE2E } = require('../lib/e2e-science');

module.exports = async (_req, res) => {
  const url = new URL('http://internal');
  url.searchParams.set('action', 'create');
  await handleScienceE2E(res, url);
};
