import {FeedId} from 'ssb-typescript';
import RoomObserver from './room-observer';
import {Callback, SSBConfig, SSBWithConn} from './types';
const Ref = require('ssb-ref');
const ssbKeys = require('ssb-keys');

interface ConsumeOpts {
  address: string;
  roomId: string;
  userId: string;
  alias: string;
  signature: string;
}

module.exports = {
  name: 'roomClient',
  version: '1.0.0',
  manifest: {
    registerAlias: 'async',
    revokeAlias: 'async',
    consumeAlias: 'async',
  },
  permissions: {
    anonymous: {},
  },
  init(ssb: SSBWithConn, config: SSBConfig) {
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

      consumeAlias(opts: ConsumeOpts, cb: Callback<any>) {
        if (!Ref.isAddress(opts.address)) {
          cb(new Error(`cannot consumeAlias with address: ${opts.address}`));
          return;
        }
        if (!Ref.isFeed(opts.roomId)) {
          cb(new Error(`cannot consumeAlias with bad roomId: ${opts.roomId}`));
          return;
        }
        if (!Ref.isFeed(opts.userId)) {
          cb(new Error(`cannot consumeAlias with bad userId: ${opts.userId}`));
          return;
        }
        if (!opts.alias || typeof opts.alias !== 'string') {
          cb(new Error(`cannot consumeAlias with alias: ${opts.alias}`));
          return;
        }
        if (!opts.signature || typeof opts.signature !== 'string') {
          cb(new Error(`cannot consumeAlias signed as: ${opts.signature}`));
          return;
        }

        const {address, roomId, userId, alias, signature} = opts;

        const body = `=room-alias-registration:${roomId}:${userId}:${alias}`;
        const ok = ssbKeys.verify(userId, signature, body);
        if (!ok) {
          cb(new Error(`cannot consumedAlias because the signature is wrong`));
          return;
        }

        const rooms = ssb.tunnel.getRoomsMap() as Map<FeedId, RoomObserver>;

        let period = 32; // milliseconds
        ssb.conn.connect(address, function tryAgain(err: any) {
          if (err) {
            cb(err);
            return;
          }

          if (!rooms.has(roomId)) {
            if (period < 8000) setTimeout(tryAgain, (period = period * 2));
            else cb(new Error('cannot connect to alias owner via the room'))
            return;
          }

          ssb.conn.connect(
            `tunnel:${roomId}:${userId}`,
            (err2: any, aliasRpc: any) => {
              if (err2) {
                cb(err2);
                return;
              }
              cb(null, aliasRpc);
            },
          );
        });
      },
    };
  },
};
