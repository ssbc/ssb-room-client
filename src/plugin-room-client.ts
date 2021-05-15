import {FeedId} from 'ssb-typescript';
const Ref = require('ssb-ref');
const ssbKeys = require('ssb-keys');
import RoomObserver from './room-observer';
import run = require('promisify-tuple');
import {Callback, RPC, SSBConfig, SSBWithConn} from './types';
import {makeRequest} from '@minireq/node';

const minireq: ReturnType<typeof makeRequest> =
  typeof window !== 'undefined'
    ? require('@minireq/browser').makeRequest()
    : require('@minireq/node').makeRequest();

interface ConsumeOpts {
  multiserverAddress: string;
  roomId: string;
  userId: string;
  alias: string;
  signature: string;
}

type Nulls<T> = {
  [P in keyof T]: T[P] | null;
};

function sleep(period: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, period, null);
  });
}

const ALIAS_URI_ACTION = 'consume-alias';

module.exports = {
  name: 'roomClient',
  version: '1.0.0',
  manifest: {
    consumeAliasUri: 'async',
    registerAlias: 'async',
    revokeAlias: 'async',
  },
  permissions: {
    anonymous: {},
  },
  init(ssb: SSBWithConn, config: SSBConfig) {
    if (!ssb.tunnel.getRoomsMap) throw new Error('missing tunnel plugin');

    function jsonResponseFailed(data: any) {
      return (
        typeof data.status === 'string' &&
        data.status !== 'successful' &&
        data.error
      );
    }

    async function consumeAlias(opts: Nulls<ConsumeOpts>, cb: Callback<RPC>) {
      if (!Ref.isAddress(opts.multiserverAddress)) {
        cb(new Error(`bad multiserverAddress: ${opts.multiserverAddress}`));
        return;
      }
      if (!Ref.isFeed(opts.roomId)) {
        cb(new Error(`bad roomId: ${opts.roomId}`));
        return;
      }
      if (!Ref.isFeed(opts.userId)) {
        cb(new Error(`bad userId: ${opts.userId}`));
        return;
      }
      if (!opts.alias || typeof opts.alias !== 'string') {
        cb(new Error(`bad alias: ${opts.alias}`));
        return;
      }
      if (!opts.signature || typeof opts.signature !== 'string') {
        cb(new Error(`bad signature: ${opts.signature}`));
        return;
      }

      const {multiserverAddress, roomId, userId, alias, signature} =
        opts as Required<ConsumeOpts>;
      // Let's assume that `signature` is Base64 RFC 4648
      const sig = signature.replace(/_/g, '/').replace(/-/g, '+');

      const body = `=room-alias-registration:${roomId}:${userId}:${alias}`;
      const ok = ssbKeys.verify(userId, sig, body);
      if (!ok) {
        cb(new Error(`cannot consumeAlias because the signature is wrong`));
        return;
      }

      const rooms = ssb.tunnel.getRoomsMap() as Map<FeedId, RoomObserver>;

      // Connect to the room
      const [err] = await run(ssb.conn.connect)(multiserverAddress);
      if (err) {
        cb(
          new Error(
            `cannot consumeAlias ${alias} because ` +
              `cannot connect to room ${roomId} due to: ` +
              err.message ?? err,
          ),
        );
        return;
      }

      // Wait until room is connected
      let period = 32; // milliseconds
      while (!rooms.has(roomId)) {
        if (period < 8000) {
          await sleep((period = period * 2));
        } else {
          cb(
            new Error(
              `cannot consumeAlias ${alias} because room ${roomId} ` +
                `is missing from our internal cache`,
            ),
          );
          return;
        }
      }

      // Connect to the alias owner in this room
      const shs = userId.slice(1, -8);
      const tunnelAddr = `tunnel:${roomId}:${userId}~shs:${shs}`;
      const [err2, aliasRpc] = await run<RPC>(ssb.conn.connect)(tunnelAddr);
      if (err2) {
        cb(
          new Error(
            `alias appears to be offline (${alias}): ` + err2.message ?? err2,
          ),
        );
        return;
      }
      ssb.conn.remember(tunnelAddr, {
        type: 'room-endpoint',
        key: userId,
        room: roomId,
        roomAddress: multiserverAddress,
        alias,
        autoconnect: true,
      });
      cb(null, aliasRpc);
    }

    async function consumeAliasUri(input: string, cb: Callback<RPC>) {
      if (!input) {
        cb(new Error('missing URI input'));
        return;
      }
      if (typeof input !== 'string') {
        cb(new Error('URI input should be a string'));
        return;
      }
      let url: URL;
      try {
        const coolURL = /^(\w+\.\w+\.\w+|\w+\.\w+\/\w+)$/;
        if (input.match(coolURL)) {
          // `alice.room.com` or `room.com/alice`
          url = new URL(`https://${input}`);
        } else {
          url = new URL(input);
        }
      } catch (err) {
        cb(err);
        return;
      }

      if (url.protocol.startsWith('http')) {
        url.searchParams.set('encoding', 'json');
        const jsonUrl = url.toString();
        try {
          const {status, data} = await minireq({
            url: jsonUrl,
            method: 'GET',
            accept: 'application/json',
            timeout: 10e3,
          }).promise;
          if (!(status >= 200 && status < 300)) {
            cb(new Error(`failed (${status}) to get alias from ${jsonUrl}`));
            return;
          }
          if (jsonResponseFailed(data)) {
            cb(new Error(data.error));
            return;
          }
          consumeAlias(data, cb);
        } catch (err) {
          cb(err);
          return;
        }
      } else if (url.protocol === 'ssb:') {
        if (url.pathname !== 'experimental' && url.host !== 'experimental') {
          cb(new Error('SSB URI input isnt experimental'));
          return;
        }
        const action = url.searchParams.get('action');
        if (action !== ALIAS_URI_ACTION) {
          cb(new Error(`SSB URI input isnt ${ALIAS_URI_ACTION}: ${input}`));
          return;
        }
        const data = {
          multiserverAddress: url.searchParams.get('multiserverAddress'),
          roomId: url.searchParams.get('roomId'),
          userId: url.searchParams.get('userId'),
          alias: url.searchParams.get('alias'),
          signature: url.searchParams.get('signature'),
        };
        consumeAlias(data, cb);
      } else {
        cb(new Error(`unsupported URI input: ${input}`));
        return;
      }
    }

    function registerAlias(
      roomKey: FeedId,
      alias: string,
      cb: Callback<string>,
    ) {
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
    }

    function revokeAlias(roomKey: FeedId, alias: string, cb: Callback<true>) {
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
    }

    return {
      consumeAliasUri,
      registerAlias,
      revokeAlias,
    };
  },
};
