const ssbKeys = require('ssb-keys');
const debug = require('debug')('test');

const ALICE_KEYS = ssbKeys.generate();
const ALICE_ID = ALICE_KEYS.id;
const ROOM_KEYS = ssbKeys.generate();
const ROOM_ID = ROOM_KEYS.id;
const ROOM_MSADDR = 'net:something.com:8008~shs:' + ROOM_ID.slice(1, -8);
const BOB_KEYS = ssbKeys.generate();
const BOB_ID = BOB_KEYS.id;

debug('alice is ' + ALICE_ID);
debug('room is ' + ROOM_ID);
debug('bob is ' + BOB_ID);

module.exports = {
  ALICE_KEYS,
  ALICE_ID,
  ROOM_KEYS,
  ROOM_ID,
  ROOM_MSADDR,
  BOB_KEYS,
  BOB_ID,
};