import {Callback} from './types';

/**
 * The sole purpose of this plugin is to declare the remote manifest,
 * nothing else.
 */
module.exports = {
  name: 'room',
  version: '1.0.0',
  manifest: {
    registerAlias: 'async',
    revokeAlias: 'async',
  },
  init() {
    return {
      registerAlias(_alias: string, _sig: string, cb: Callback) {
        cb(new Error('not implemented on the client'));
      },

      revokeAlias(_alias: string, cb: Callback) {
        cb(new Error('not implemented on the client'));
      },
    };
  },
};
