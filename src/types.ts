import {AddressData} from 'ssb-conn-db/lib/types';
import {ConnectionData} from 'ssb-conn-hub/lib/types';
import {StagedData} from 'ssb-conn-staging/lib/types';
import {FeedId} from 'ssb-typescript';

export interface Callback<T = any> {
  (err?: any, x?: T): void;
}

export interface ConnectOpts {
  target: FeedId;
  portal: FeedId;
  origin?: FeedId;
}

export interface RoomMetadata {
  name?: string;
  description?: string;
  membership?: boolean;
  features?: Array<string>;

  /**
   * This is not in `isRoom()`'s response neither in `metadata()`'s response,
   * but is monkey-patched internally to signal that the metadata object is
   * coming from `isRoom()`.
   */
  _isRoom1?: true;
}

export interface SSB {
  id: FeedId;
  keys: any;
  conn?: {
    connect: (msaddr: string, cb: Callback<RPC>) => void;
    disconnect: CallableFunction;
    remember: (msaddr: string, data: any) => void;
    stage: CallableFunction;
    unstage: CallableFunction;
    db: () => {
      update: CallableFunction;
      get: (msaddr: string) => AddressData | undefined;
      getAddressForId: (id: FeedId) => string | undefined;
      entries: () => Iterable<[string, AddressData]>;
    };
    hub: () => {
      listen: CallableFunction;
      update: (k: string, d: any) => void;
      entries: () => Iterable<[string, ConnectionData]>;
    };
    staging: () => {entries: () => Iterable<[string, StagedData]>};
  };
  multiserver: {
    transport: CallableFunction;
  };
  tunnel: {
    getRoomsMap: CallableFunction;
  };
}

export type SSBWithConn = SSB & Required<Pick<SSB, 'conn'>>;

export interface RPC {
  tunnel: {
    endpoints: CallableFunction;
    connect: (opts: ConnectOpts, cb: Callback) => void;
    isRoom: (cb: Callback<RoomMetadata | boolean>) => void;
  };
  close: CallableFunction;
  room: {
    registerAlias: (alias: string, sig: string, cb: Callback) => void;
    revokeAlias: (alias: string, cb: Callback) => void;
    metadata: (cb: Callback<RoomMetadata | boolean>) => void;
  };
}

export interface SSBConfig {
  path: string;
  keys: {
    curve: string;
    public: string;
    private: string;
    id: string;
  };
  blobsPurge?: {
    cpuMax?: number;
    storageLimit?: number;
    maxPause?: number;
  };
}
