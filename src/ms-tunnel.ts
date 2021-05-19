import {ListenEvent} from 'ssb-conn-hub/lib/types';
const debug = require('debug')('ssb:room-client');
const pull = require('pull-stream');
const Ref = require('ssb-ref');
import run = require('promisify-tuple');
import {Callback, ConnectOpts, RPC, SSBWithConn} from './types';
import RoomObserver from './room-observer';
import {FeedId} from 'ssb-typescript';
import {toTunnelAddress} from './utils';

type Rooms = Map<FeedId, RoomObserver>;

function roomMetadataMuxrpcMissing(err: any) {
  if (!err) return false;
  const errString: string =
    typeof err.message === 'string'
      ? err.message
      : typeof err === 'string'
      ? err
      : '';
  return errString.endsWith('not in list of allowed methods');
}

export default (rooms: Rooms, ssb: SSBWithConn) => (msConfig: any) => {
  const self = {
    name: 'tunnel',

    scope() {
      return msConfig.scope;
    },

    server(onConnect: (stream: any) => void, startedCB: Callback) {
      // Once a peer connects, detect rooms, and setup room portals
      pull(
        ssb.conn.hub().listen(),
        pull.filter(({type}: ListenEvent) => type === 'connected'),
        pull.drain(async ({address, key, details}: ListenEvent) => {
          if (!key) return;
          if (rooms.has(key)) return;
          if (!details?.rpc) return;
          if (address.startsWith('tunnel:')) return;
          const rpc: RPC = details.rpc;
          debug('will try to call room.metadata() on the peer %s', key);
          var [err, res] = await run(rpc.room.metadata)();
          if (roomMetadataMuxrpcMissing(err)) {
            debug('will try to call tunnel.isRoom() on the peer %s', key);
            [err, res] = await run(rpc.tunnel.isRoom)();
            if (!err && res && typeof res === 'object') res._isRoom1 = true;
          }
          if (err || !res) return;
          debug('is connected to an actual ssb-room');
          if (rooms.has(key)) {
            rooms.get(key)!.cancel();
            rooms.delete(key);
          }
          const obs = new RoomObserver(ssb, key, address, rpc, res, onConnect);
          rooms.set(key, obs);
        }),
      );

      // Once a room disconnects, teardown
      pull(
        ssb.conn.hub().listen(),
        pull.filter(({type}: ListenEvent) => type === 'disconnected'),
        pull.drain(({key}: ListenEvent) => {
          if (!key) return;
          if (!rooms.has(key)) return;
          rooms.get(key)!.close();
          rooms.delete(key);
        }),
      );

      startedCB();

      // close this ms plugin
      return () => {
        rooms.forEach((roomObserver) => {
          roomObserver.close();
        });
        rooms.clear();
      };
    },

    async client(addr: string | ConnectOpts, cb: Callback) {
      debug(`we wish to connect to %o`, addr);
      const opts = self.parse(addr);
      if (!opts) {
        cb(new Error(`invalid tunnel address ${addr}`));
        return;
      }
      const {portal, target} = opts;
      const addrStr = JSON.stringify(addr);

      // Grab the rpc of the `portal` room
      let roomRPC: RPC | null = null;
      if (rooms.has(portal)) {
        roomRPC = rooms.get(portal)!.rpc;
      }
      // If no room found, look up room in connDB and connect to it
      if (!roomRPC) {
        for (const [msaddr] of ssb.conn.db().entries()) {
          const key = Ref.getKeyFromAddress(msaddr);
          if (key === portal) {
            debug(
              `to connect to ${addrStr} we first have to connect to ${portal}`,
            );
            const [err, rpc] = await run(ssb.conn.connect)(msaddr);
            if (err) {
              cb(
                new Error(
                  `cant connect to ${addrStr} because ` +
                    `cant reach the room ${portal} due to: ` +
                    err.message ?? err,
                ),
              );
              return;
            }
            roomRPC = rpc;
          }
        }
      }
      // If no room found, find tunnel addr in connDB and connect to its `room`
      if (!roomRPC) {
        const addrPlusShs = toTunnelAddress(portal, target);
        const peerData = ssb.conn.db().get(addrPlusShs);
        if (peerData?.room === portal && peerData?.roomAddress) {
          debug(
            `to connect to ${addrStr} we first have to connect to ${portal}`,
          );
          const [err, rpc] = await run(ssb.conn.connect)(peerData.roomAddress);
          if (err) {
            cb(
              new Error(
                `cant connect to ${addrStr} because ` +
                  `cant reach the room ${portal} due to: ` +
                  err.message ?? err,
              ),
            );
            return;
          }
          roomRPC = rpc;
        }
      }
      // If still no room is found, consider it unknown
      if (!roomRPC) {
        cb(
          new Error(
            `cant connect to ${addrStr} because ` +
              `room ${portal} is offline or unknown`,
          ),
        );
        return;
      }

      debug(`will call tunnel.connect at ${target} via room ${portal}`);
      const duplex = roomRPC.tunnel.connect({target, portal}, (err) => {
        if (err) {
          debug(
            'tunnel duplex broken with %o because %s',
            addr,
            err.message ?? err,
          );
        }
      });
      cb(null, duplex);
    },

    parse(addr: string | ConnectOpts) {
      let opts;
      if (typeof addr === 'object') {
        opts = addr;
      } else {
        const [name, portal, target] = addr.split(':');
        if (name !== 'tunnel') return;
        opts = {name, portal, target};
      }
      if (!Ref.isFeed(opts.portal)) return;
      if (!Ref.isFeed(opts.target)) return;
      return opts;
    },

    stringify() {
      return undefined;
    },
  };

  return self;
};
