import {Callback} from './types';

export default function ErrorDuplex(message: string) {
  const err = new Error(message);
  return {
    source(_abort: any, cb: Callback) {
      cb(err);
    },
    sink(read: any) {
      read(err, () => {});
    },
  };
}
