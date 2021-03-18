import {FeedId} from 'ssb-typescript';
import RoomObserver from './room-observer';
import {Callback, SSB, SSBConfig} from './types';
const Ref = require('ssb-ref');
const ssbKeys = require('ssb-keys');

module.exports = {
  name: 'roomClient',
  version: '1.0.0',
  manifest: {
    registerAlias: 'async',
  },
  permissions: {
    anonymous: {},
  },
  init(ssb: SSB, config: SSBConfig) {
    if (!ssb.tunnel.getRoomsMap) throw new Error('missing tunnel plugin');

    return {
      registerAlias(roomKey: FeedId, alias: string, cb: Callback<string>) {
        const rooms = ssb.tunnel.getRoomsMap() as Map<FeedId, RoomObserver>;
        if (!Ref.isFeed(roomKey)) {
          cb(new Error(`cannot register alias at unknown room ${roomKey}`));
          return;
        }
        if (!rooms.has(roomKey)) {
          cb(new Error(`cannot register alias at offline room ${roomKey}`));
          return;
        }
        const body = `=room-alias-registration:${roomKey}:${ssb.id}:${alias}`;
        const sig = ssbKeys.sign(config.keys, body);
        rooms.get(roomKey)!.rpc.room.registerAlias(alias, sig, cb);
      },

      revokeAlias(roomKey: FeedId, alias: string, cb: Callback<true>) {
        const rooms = ssb.tunnel.getRoomsMap() as Map<FeedId, RoomObserver>;
        if (!Ref.isFeed(roomKey)) {
          cb(new Error(`cannot revoke alias at unknown room ${roomKey}`));
          return;
        }
        if (!rooms.has(roomKey)) {
          cb(new Error(`cannot revoke alias at offline room ${roomKey}`));
          return;
        }
        rooms.get(roomKey)!.rpc.room.revokeAlias(alias, cb);
      },
    };
  },
};
