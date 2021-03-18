const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('tape');
const ssbKeys = require('ssb-keys');
const SecretStack = require('secret-stack');
const caps = require('ssb-caps');
const pull = require('pull-stream');

const aliceKeys = ssbKeys.generate();
const bobKeys = ssbKeys.generate();
const carlaKeys = ssbKeys.generate();

let testInstance = 0;
const CreateSSB = (makeMockConn) => {
  const name = `test${testInstance}`;
  testInstance++;
  let sbot;

  const close = (cb) => {
    sbot.close(cb);
  };

  sbot = SecretStack({appKey: caps.shs})
    .use(require('./mock-conn'))
    .use(require('../lib/index'))
    .call(null, {
      path: fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-room-client-' + name)),
      temp: true,
      name,
      keys: aliceKeys,
      connections: {
        incoming: {
          tunnel: [{scope: 'public', transform: 'shs'}],
        },
        outgoing: {
          tunnel: [{transform: 'shs'}],
        },
      },
      mockConn: makeMockConn ? makeMockConn(close) : null,
    });

  return sbot;
};

test('connect to room', (t) => {
  const ssb = CreateSSB();

  ssb.connect(`tunnel:${bobKeys.id}:${carlaKeys.id}`, (err, x) => {
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
            address: 'net:something.com:8008~noauth',
            key: bobKeys.id,
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
            address: 'net:something.com:8008~noauth',
            key: bobKeys.id,
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
  const ROOM_ADDR = 'net:something.com:8008~noauth';

  CreateSSB((close) => ({
    db: () => ({
      update: (addr, data) => {
        t.equal(addr, ROOM_ADDR);
        t.deepEqual(data, {name: 'Foobar Express'});
        dbUpdated = true;
        if (hubUpdated) close(t.end);
      },
    }),
    hub: () => ({
      update: (addr, data) => {
        t.equal(addr, ROOM_ADDR);
        t.deepEqual(data, {name: 'Foobar Express'});
        hubUpdated = true;
        if (dbUpdated) close(t.end);
      },
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_ADDR,
            key: bobKeys.id,
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
            address: 'net:something.com:8008~noauth',
            key: bobKeys.id,
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
  const ROOM_ADDR = 'net:something.com:8008~noauth';

  CreateSSB((close) => ({
    stage: (addr, data) => {
      const bob = bobKeys.id;
      const carla = carlaKeys.id;
      const carlaSHS = carlaKeys.id.slice(1, -8);
      t.equal(addr, `tunnel:${bob}:${carla}~shs:${carlaSHS}`);
      t.deepEqual(data, {
        type: 'room-endpoint',
        key: carla,
        room: bob,
        roomName: undefined,
      });
      close(t.end);
    },
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_ADDR,
            key: bobKeys.id,
            details: {
              rpc: {
                tunnel: {
                  isRoom: (cb) => {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, true);
                  },
                  endpoints: () => {
                    t.pass('rpc.tunnel.endpoints got called');
                    return pull.values([[carlaKeys.id]]);
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
            address: 'net:something.com:8008~noauth',
            key: bobKeys.id,
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
                      ssb.connect(
                        `tunnel:${bobKeys.id}:${carlaKeys.id}`,
                        (err, s) => {
                          t.ok(err, 'error, but we expected it because mocks');
                          ssb.close(() => {
                            t.true(calledIsRoom);
                            t.true(calledEndpoints);
                            t.true(calledConnect);
                            t.true(calledClose);
                            t.end();
                          });
                        },
                      );
                    }, 200);

                    t.pass('rpc.tunnel.endpoints got called');
                    calledEndpoints = true;
                    return pull.values([[carlaKeys.id]]);
                  },
                  connect(addr, cb) {
                    t.deepEqual(addr, {
                      portal: bobKeys.id,
                      target: carlaKeys.id,
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
  const ROOM_ADDR = 'net:something.com:8008~noauth';
  const ssb = CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_ADDR,
            key: bobKeys.id,
            details: {
              rpc: {
                tunnel: {
                  isRoom(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    calledIsRoom = true;
                    cb(null, true);

                    setTimeout(() => {
                      ssb.roomClient.registerAlias(
                        bobKeys.id,
                        'Alice',
                        (err, url) => {
                          t.error(err);
                          t.equal(url, 'alice.bobsroom.com');

                          ssb.roomClient.revokeAlias(
                            bobKeys.id,
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
                      bobKeys.id,
                      aliceKeys.id,
                      alias,
                    ].join(':');
                    t.ok(ssbKeys.verify(aliceKeys, sig, body));
                    cb(null, 'alice.bobsroom.com');
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
