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

export interface SSB {
  id: FeedId;
  conn?: {
    connect: CallableFunction;
    stage: CallableFunction;
    unstage: CallableFunction;
    db: () => {update: CallableFunction};
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
}

export type SSBWithConn = SSB & Required<Pick<SSB, 'conn'>>;

export interface RPC {
  tunnel: {
    endpoints: CallableFunction;
    connect: (opts: ConnectOpts, cb: Callback) => void;
  };
  close: CallableFunction;
}

export interface SSBConfig {
  path: string;
  blobsPurge?: {
    cpuMax?: number;
    storageLimit?: number;
    maxPause?: number;
  };
}
