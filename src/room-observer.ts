import {FeedId} from 'ssb-typescript';
import {RPC, SSB} from './types';
const debug = require('debug')('ssb:room-client');
const pull = require('pull-stream');

export default class RoomObserver {
  public readonly rpc: RPC;
  public readonly handler: (stream: any, id: FeedId) => void;
  private readonly ssb: SSB & Required<Pick<SSB, 'conn'>>;
  private readonly roomKey: FeedId;
  private readonly address: string;
  private readonly roomMetadata: {name?: string};
  private endpointsDrain?: {abort: () => void};

  constructor(
    ssb: RoomObserver['ssb'],
    serverKey: RoomObserver['roomKey'],
    address: RoomObserver['address'],
    rpc: RoomObserver['rpc'],
    roomMetadata: RoomObserver['roomMetadata'],
    onConnect: (stream: any) => void,
  ) {
    this.ssb = ssb;
    this.roomKey = serverKey;
    this.address = address;
    this.rpc = rpc;
    this.roomMetadata = roomMetadata;
    this.handler = (stream: any, id: FeedId) => {
      stream.address = `tunnel:${this.roomKey}:${id}`;
      debug(
        'handler will call onConnect for the stream.address: %s',
        stream.address,
      );
      onConnect(stream);
    };

    const roomName = this.roomMetadata?.name;
    if (roomName) {
      this.ssb.conn.db().update(this.address, {name: roomName});
      this.ssb.conn.hub().update(this.address, {name: roomName});
    }

    debug('announcing to portal: %s', this.roomKey);
    pull(
      this.rpc.tunnel.endpoints(),
      (this.endpointsDrain = pull.drain((endpoints: Array<FeedId>) => {
        const room = this.roomKey;
        debug('got endpoints from %s: %s', room, JSON.stringify(endpoints));

        // Update onlineCount metadata for this room
        const onlineCount = endpoints.length;
        this.ssb.conn.hub().update(this.address, {onlineCount});

        // Detect removed endpoints, unstage them
        for (const entry of this.ssb.conn.staging().entries()) {
          const [addr, data] = entry;
          if (data.room === room && data.key && !endpoints.includes(data.key)) {
            debug('will conn.unstage("%s")', addr);
            this.ssb.conn.unstage(addr);
          }
        }

        // Stage all the new endpoints
        for (const key of endpoints) {
          if (key === room) continue;
          if (key === this.ssb.id) continue;
          if (this.isAlreadyConnected(key)) continue;
          const address = this.getAddress(key);
          debug('will conn.stage("%s")', address);
          this.ssb.conn.stage(address, {
            type: 'room-endpoint',
            key,
            room,
            roomName,
          });
        }
      })),
    );
  }

  private isAlreadyConnected(key: FeedId) {
    for (const [, data] of this.ssb.conn.hub().entries()) {
      if (data.key === key) return true;
    }
    return false;
  }

  private getAddress(key: FeedId) {
    const shs = key.substr(1, key.length - 9);
    return `tunnel:${this.roomKey}:${key}~shs:${shs}`;
  }

  public close() {
    this.endpointsDrain?.abort();
    for (const [addr, data] of this.ssb.conn.staging().entries()) {
      if (data.room === this.roomKey) {
        this.ssb.conn.unstage(addr);
      }
    }
    this.rpc.close(true, (err: any) => {
      if (err) debug('error when closing connection with room: %s', err);
    });
  }
}
