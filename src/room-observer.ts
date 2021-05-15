import {FeedId} from 'ssb-typescript';
import {RPC, SSB} from './types';
const debug = require('debug')('ssb:room-client');
const pull = require('pull-stream');

const BENIGN_STREAM_END = {
  // stream closed okay, ssb-js variant
  'unexpected end of parent stream': true,

  // stream closed okay, go-ssb variant
  'muxrpc: session terminated': true,
};

// FIXME: this should be in muxrpc or packet-stream or somewhere generic
const STREAM_ERRORS = {
  ...BENIGN_STREAM_END,
  'unexpected hangup': true, // stream closed probably okay
  'read EHOSTUNREACH': true,
  'read ECONNRESET': true,
  'read ENETDOWN': true,
  'read ETIMEDOUT': true,
  'write ECONNRESET': true,
  'write EPIPE': true,
  'stream is closed': true, // rpc method called after stream ended
  'parent stream is closing': true,
};

export default class RoomObserver {
  public readonly rpc: RPC;
  public readonly handler: (stream: any, id: FeedId) => void;
  private readonly ssb: SSB & Required<Pick<SSB, 'conn'>>;
  private readonly roomKey: FeedId;
  private readonly address: string;
  private readonly roomMetadata: {name?: string; features?: Array<string>};
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

    // if is plain object with at least one field
    if (
      typeof this.roomMetadata === 'object' &&
      this.roomMetadata &&
      Object.keys(this.roomMetadata).length >= 1
    ) {
      const metadata: Record<string, any> = {};
      const {name, features} = this.roomMetadata;
      if (name) metadata.name = name;
      if (Array.isArray(features)) {
        if (features.includes('room1')) metadata.type = 'room';
        if (features.includes('room2')) metadata.supportsRoom2 = true;
        if (features.includes('alias')) metadata.supportsAliases = true;
        if (features.includes('httpAuth')) metadata.supportsHttpAuth = true;
        if (features.includes('httpInvite')) metadata.supportsHttpInvite = true;
      }
      this.ssb.conn.db().update(this.address, metadata);
      this.ssb.conn.hub().update(this.address, metadata);
    }

    debug('announcing to portal: %s', this.roomKey);
    pull(
      this.rpc.tunnel.endpoints(),
      (this.endpointsDrain = pull.drain(
        this.endpointsUpdated,
        this.endpointsEnded,
      )),
    );
  }

  private endpointsUpdated = (endpoints: Array<FeedId>) => {
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
        roomName: this.roomMetadata?.name,
      });
    }
  };

  private endpointsEnded = (err?: Error | true) => {
    if (err && err !== true) {
      const msg = err.message;
      if (msg in STREAM_ERRORS) {
        debug(`error getting updates from room ${this.roomKey} because ${msg}`);
        if (msg in BENIGN_STREAM_END) {
          if (err instanceof Error) {
            // stream closed okay locally
          } else {
            // pre-emptively destroy the stream, assuming the other
            // end is packet-stream 2.0.0 sending end messages.
            this.close();
          }
        }
      } else {
        console.error(
          `error getting updates from room ${this.roomKey} because ${msg}`,
        );
      }
    }
  };

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

  /**
   * Similar to close(), but just destroys this "observer", not the
   * underlying connections.
   */
  public cancel() {
    this.endpointsDrain?.abort();
  }

  /**
   * Similar to cancel(), but also closes connection with the room server.
   */
  public close() {
    this.endpointsDrain?.abort();
    for (const [addr, data] of this.ssb.conn.staging().entries()) {
      if (data.room === this.roomKey) {
        this.ssb.conn.unstage(addr);
      }
    }
    this.rpc.close(true, (err: any) => {
      if (err) debug('error when closing connection with room: %o', err);
    });
    this.ssb.conn.disconnect(this.address, () => {});
  }
}
