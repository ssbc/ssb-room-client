// SPDX-FileCopyrightText: 2021 Andre Staltz
//
// SPDX-License-Identifier: LGPL-3.0-only

import {FeedId} from 'ssb-typescript';
import {AttendantsEvent, RoomMetadata, RPC, SSB} from './types';
import {muxrpcMissing} from './utils';
const debug = require('debug')('ssb:room-client');
const pull = require('pull-stream');
const getSeverity = require('ssb-network-errors');

export default class RoomObserver {
  public readonly rpc: RPC;
  public readonly handler: (stream: any, id: FeedId) => void;
  private readonly ssb: SSB & Required<Pick<SSB, 'conn'>>;
  private readonly roomKey: FeedId;
  private readonly address: string;
  private readonly roomMetadata: boolean | RoomMetadata;
  private attendants: Set<FeedId>;
  private attendantsDrain?: {abort: () => void};
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
    this.attendants = new Set();
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
      const metadata: Record<string, any> = {type: 'room'};
      const {name, membership, features, _isRoom1} = this.roomMetadata;
      if (name) metadata.name = name;
      if (membership) metadata.membership = true;
      if (_isRoom1) metadata.openInvites = true;
      if (Array.isArray(features)) {
        if (features.includes('room1')) metadata.openInvites = true;
        if (features.includes('room2')) metadata.supportsRoom2 = true;
        if (features.includes('alias')) metadata.supportsAliases = true;
        if (features.includes('httpAuth')) metadata.supportsHttpAuth = true;
        if (features.includes('httpInvite')) metadata.supportsHttpInvite = true;
      }
      this.ssb.conn.db().update(this.address, metadata);
      this.ssb.conn.hub().update(this.address, metadata);
    }

    debug('announcing to portal: %s', this.roomKey);
    this.startAttendants();
  }

  private startAttendants() {
    pull(
      this.rpc.room.attendants(),
      (this.attendantsDrain = pull.drain(
        this.attendantsUpdated,
        this.attendantsEnded,
      )),
    );
  }

  private startEndpoints() {
    pull(
      this.rpc.tunnel.endpoints(),
      (this.endpointsDrain = pull.drain(
        this.endpointsUpdated,
        this.endpointsEnded,
      )),
    );
  }

  private attendantsUpdated = (event: AttendantsEvent) => {
    const room = this.roomKey;
    const roomName =
      typeof this.roomMetadata === 'object' ? this.roomMetadata.name : void 0;

    // debug log
    if (event.type === 'state') {
      debug('initial attendants in %s: %s', room, JSON.stringify(event.ids));
    } else if (event.type === 'joined') {
      debug('attendant joined %s: %s', room, event.id);
    } else if (event.type === 'left') {
      debug('attendant left %s: %s', room, event.id);
    }

    // Update attendants set
    if (event.type === 'state') {
      this.attendants.clear();
      for (const key of event.ids) {
        this.attendants.add(key);
      }
    } else if (event.type === 'joined') {
      this.attendants.add(event.id);
    } else if (event.type === 'left') {
      this.attendants.delete(event.id);
    }

    // Update onlineCount metadata for this room
    const onlineCount = this.attendants.size;
    this.ssb.conn.hub().update(this.address, {onlineCount});

    // Update ssb-conn-staging
    if (event.type === 'state') {
      for (const id of event.ids) {
        this.notifyNewAttendant(id, room, roomName);
      }
    } else if (event.type === 'joined') {
      this.notifyNewAttendant(event.id, room, roomName);
    } else if (event.type === 'left') {
      const address = this.getAddress(event.id);
      debug('will disconnect and unstage %s', address);
      this.ssb.conn.unstage(address);
      this.ssb.conn.disconnect(address);
    }
  };

  private attendantsEnded = (err?: Error | true) => {
    if (err && err !== true) {
      // If room.attendants() is not supported, call tunnel.endpoints()
      if (muxrpcMissing(err)) {
        this.attendantsDrain = void 0;
        this.startEndpoints();
        return;
      }

      this.handleStreamError(err);
    }
  };

  /**
   * Typically, this should stage the new attendant, but it's not up to us to
   * decide that. We just notify other modules (like the ssb-conn scheduler) and
   * they listen to the notify stream and stage it if they want.
   */
  private notifyNewAttendant(key: FeedId, room: FeedId, roomName?: string) {
    if (key === room) return;
    if (key === this.ssb.id) return;
    const address = this.getAddress(key);
    this.ssb.roomClient._notifyDiscoveredAttendant({
      address,
      key,
      room,
      roomName,
    });
  }

  private handleStreamError(err: Error) {
    const severity = getSeverity(err);
    if (severity === 1) {
      // pre-emptively destroy the stream, assuming the other
      // end is packet-stream 2.0.0 sending end messages.
      this.close();
    } else if (severity >= 2) {
      console.error(
        `error getting updates from room ${this.roomKey} because ${err.message}`,
      );
    }
  }

  private endpointsUpdated = (endpoints: Array<FeedId>) => {
    const room = this.roomKey;
    const roomName =
      typeof this.roomMetadata === 'object' ? this.roomMetadata.name : void 0;
    debug('got endpoints from %s: %s', room, JSON.stringify(endpoints));

    // Update onlineCount metadata for this room
    const onlineCount = endpoints.length;
    this.ssb.conn.hub().update(this.address, {onlineCount});

    // Detect removed endpoints, unstage them
    for (const entry of this.ssb.conn.staging().entries()) {
      const [addr, data] = entry;
      if (data.room === room && data.key && !endpoints.includes(data.key)) {
        debug('will disconnect and unstage %s', addr);
        this.ssb.conn.unstage(addr);
        this.ssb.conn.disconnect(addr);
      }
    }

    // Stage all the new endpoints
    for (const key of endpoints) {
      this.notifyNewAttendant(key, room, roomName);
    }
  };

  private endpointsEnded = (err?: Error | true) => {
    if (err && err !== true) {
      this.handleStreamError(err);
    }
  };

  private getAddress(key: FeedId) {
    const shs = key.substr(1, key.length - 9);
    return `tunnel:${this.roomKey}:${key}~shs:${shs}`;
  }

  /**
   * Similar to close(), but just destroys this "observer", not the
   * underlying connections.
   */
  public cancel() {
    this.attendantsDrain?.abort();
    this.endpointsDrain?.abort();
  }

  /**
   * Similar to cancel(), but also closes connection with the room server.
   */
  public close() {
    this.attendantsDrain?.abort();
    this.endpointsDrain?.abort();
    for (const key of this.attendants) {
      const address = this.getAddress(key);
      this.ssb.conn.unstage(address);
    }
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
