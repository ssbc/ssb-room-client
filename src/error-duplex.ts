// SPDX-FileCopyrightText: 2021 Andre Staltz
//
// SPDX-License-Identifier: LGPL-3.0-only

import {Callback} from './types';

export default function ErrorDuplex(message: string) {
  const err = new Error(message);
  err.stack = '';
  return {
    source(_abort: any, cb: Callback) {
      cb(err);
    },
    sink(read: any) {
      read(err, () => {});
    },
  };
}
