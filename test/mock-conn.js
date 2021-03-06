// SPDX-FileCopyrightText: 2021 Andre Staltz
//
// SPDX-License-Identifier: Unlicense

const pull = require('pull-stream');

module.exports = {
  name: 'conn',
  version: '1.0.0',
  manifest: {
    connect: 'async',
    stage: 'sync',
    unstage: 'sync',
    db: 'sync',
    hub: 'sync',
    staging: 'sync',
  },
  permissions: {
    anonymous: {allow: ['connect']},
  },
  init: (ssb, config) => {
    config.mockConn = config.mockConn || {};
    return {
      remember: () => {},
      connect: () => {},
      disconnect: () => {},
      stage: () => {},
      unstage: () => {},
      ...config.mockConn,
      db: () => ({
        entries: () => [],
        get: () => {},
        update: () => {},
        ...(config.mockConn.db ? config.mockConn.db() : null),
      }),
      hub: () => ({
        entries: () => [],
        update: () => {},
        listen: () => pull.empty(),
        ...(config.mockConn.hub ? config.mockConn.hub() : null),
      }),
      staging: () => ({
        entries: () => [],
        ...(config.mockConn.staging ? config.mockConn.staging() : null),
      }),
    };
  },
};
