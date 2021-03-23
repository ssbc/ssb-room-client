const test = require('tape');
const ssbKeys = require('ssb-keys');
const pull = require('pull-stream');
const {ROOM_ID, BOB_ID, ROOM_MSADDR, ALICE_ID, ALICE_KEYS} = require('./keys');
const CreateSSB = require('./sbot');

test('connect to room', (t) => {
  const ssb = CreateSSB();

  ssb.connect(`tunnel:${ROOM_ID}:${BOB_ID}`, (err, x) => {
    t.match(err.message, /^room @\S+ is offline$/, 'connect but offline');
    ssb.close(t.end);
  });
});

test('when connected to a peer, checks if it is a room', (t) => {
  CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom: (cb) => {
                    t.pass('rpc.tunnel.isRoom got called');
                    close(t.end);
                  },
                },
              },
            },
          },
        ]),
    }),
  }));
});

test('when connected to a non-room, does not call tunnel.endpoints', (t) => {
  CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom: (cb) => {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, false);
                    setTimeout(() => {
                      t.pass('did not call rpc.tunnel.endpoints');
                      close(t.end);
                    }, 200);
                  },
                  endpoints: () => {
                    t.fail('should not call rpc.tunnel.endpoints');
                    return pull.empty();
                  },
                },
              },
            },
          },
        ]),
    }),
  }));
});

test('when connected to a room, updates hub and db with metadata', (t) => {
  let dbUpdated = false;
  let hubUpdated = false;

  CreateSSB((close) => ({
    db: () => ({
      update: (addr, data) => {
        t.equal(addr, ROOM_MSADDR);
        t.deepEqual(data, {name: 'Foobar Express'});
        dbUpdated = true;
        if (hubUpdated) close(t.end);
      },
    }),
    hub: () => ({
      update: (addr, data) => {
        t.equal(addr, ROOM_MSADDR);
        t.deepEqual(data, {name: 'Foobar Express'});
        hubUpdated = true;
        if (dbUpdated) close(t.end);
      },
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom: (cb) => {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, {name: 'Foobar Express'});
                  },
                  endpoints: () => {
                    return pull.empty();
                  },
                },
              },
            },
          },
        ]),
    }),
  }));
});

test('when connected to a room, calls tunnel.endpoints', (t) => {
  CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom: (cb) => {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, true);
                  },
                  endpoints: () => {
                    t.pass('rpc.tunnel.endpoints got called');
                    close(t.end);
                    return pull.empty();
                  },
                },
              },
            },
          },
        ]),
    }),
  }));
});

test('stages other endpoints', (t) => {
  CreateSSB((close) => ({
    stage: (addr, data) => {
      const BOB_SHS = BOB_ID.slice(1, -8);
      t.equal(addr, `tunnel:${ROOM_ID}:${BOB_ID}~shs:${BOB_SHS}`);
      t.deepEqual(data, {
        type: 'room-endpoint',
        key: BOB_ID,
        room: ROOM_ID,
        roomName: undefined,
      });
      close(t.end);
    },
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom: (cb) => {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, true);
                  },
                  endpoints: () => {
                    t.pass('rpc.tunnel.endpoints got called');
                    return pull.values([[BOB_ID]]);
                  },
                },
              },
            },
          },
        ]),
    }),
  }));
});

test('when connected to a room, can tunnel.connect to others', (t) => {
  let calledIsRoom = false;
  let calledEndpoints = false;
  let calledConnect = false;
  let calledClose = false;
  const ssb = CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    calledIsRoom = true;
                    cb(null, true);
                  },
                  endpoints() {
                    setTimeout(() => {
                      ssb.connect(`tunnel:${ROOM_ID}:${BOB_ID}`, (err, s) => {
                        t.doesNotMatch(err.message, /only know\:tunnel\~shs/)
                        t.ok(err, 'error, but we expected it because mocks');
                        ssb.close(() => {
                          t.true(calledIsRoom);
                          t.true(calledEndpoints);
                          t.true(calledConnect);
                          t.true(calledClose);
                          t.end();
                        });
                      });
                    }, 200);

                    t.pass('rpc.tunnel.endpoints got called');
                    calledEndpoints = true;
                    return pull.values([[BOB_ID]]);
                  },
                  connect(addr) {
                    t.deepEqual(addr, {
                      portal: ROOM_ID,
                      target: BOB_ID,
                    });
                    t.pass('at this point would do an actual connection');
                    calledConnect = true;
                    return {source: pull.empty(), sink: () => {}};
                  },
                },
                close() {
                  t.pass('calls rpc.close()');
                  calledClose = true;
                },
              },
            },
          },
        ]),
    }),
  }));
});

test('when connected to a room 2.0, can registerAlias', (t) => {
  const ssb = CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            key: ROOM_ID,
            details: {
              rpc: {
                tunnel: {
                  isRoom(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    calledIsRoom = true;
                    cb(null, true);

                    setTimeout(() => {
                      ssb.roomClient.registerAlias(
                        ROOM_ID,
                        'Alice',
                        (err, url) => {
                          t.error(err);
                          t.equal(url, 'alice.room.com');

                          ssb.roomClient.revokeAlias(
                            ROOM_ID,
                            'Alice',
                            (err2, answer) => {
                              t.error(err2);
                              t.true(answer);
                              ssb.close(t.end);
                            },
                          );
                        },
                      );
                    }, 200);
                  },
                  endpoints: () => {
                    return pull.empty();
                  },
                },

                room: {
                  registerAlias(alias, sig, cb) {
                    t.equal(alias, 'Alice');
                    t.ok(sig);
                    const body = [
                      '=room-alias-registration',
                      ROOM_ID,
                      ALICE_ID,
                      alias,
                    ].join(':');
                    t.ok(ssbKeys.verify(ALICE_KEYS, sig, body));
                    cb(null, 'alice.room.com');
                  },
                  revokeAlias(alias, cb) {
                    t.equal(alias, 'Alice');
                    cb(null, true);
                  },
                },

                close() {
                  t.pass('calls rpc.close()');
                  calledClose = true;
                },
              },
            },
          },
        ]),
    }),
  }));
});
