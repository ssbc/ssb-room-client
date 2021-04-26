import {ListenEvent} from 'ssb-conn-hub/lib/types';
const debug = require('debug')('ssb:room-client');
const pull = require('pull-stream');
const Ref = require('ssb-ref');
import {Callback, ConnectOpts, SSBWithConn} from './types';
import RoomObserver from './room-observer';
import {FeedId} from 'ssb-typescript';

type Rooms = Map<FeedId, RoomObserver>;

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
        pull.drain(({address, key, details}: ListenEvent) => {
          if (!key) return;
          if (rooms.has(key)) return;
          if (!details?.rpc) return;
          const rpc = details.rpc;
          debug('will try to call tunnel.isRoom() on the peer %s', key);
          rpc.tunnel.isRoom((err: any, res: any) => {
            if (err || !res) return;
            debug('is connected to an actual ssb-room');
            rooms.set(
              key,
              new RoomObserver(ssb, key, address, rpc, res, onConnect),
            );
          });
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

    client(addr: string | ConnectOpts, cb: Callback) {
      debug(`we wish to connect to %o`, addr);
      const opts = self.parse(addr);
      if (!opts) {
        cb(new Error(`invalid tunnel address ${addr}`));
        return;
      }
      const {portal, target} = opts;
      if (!rooms.has(portal)) {
        cb(new Error(`room ${portal} is offline`));
        return;
      }

      const rpc = rooms.get(portal)!.rpc;
      debug(`will call tunnel.connect at ${target} via room ${portal}`);
      const duplex = rpc.tunnel.connect({target, portal}, (err) => {
        if (err)
          debug(
            'tunnel duplex broken with %o because %s',
            addr,
            err.message || err,
          );
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
