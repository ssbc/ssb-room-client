const test = require('tape');
const pull = require('pull-stream');
const {ROOM_MSADDR, ROOM_ID, BOB_ID} = require('./keys');
const CreateSSB = require('./sbot');

test('cannot tunnel.connect to bad tunnel address 1', (t) => {
  let calledIsRoom = false;
  let calledEndpoints = false;
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
                      ssb.connect(`tunnel:blabla:${BOB_ID}`, (err, s) => {
                        t.pass(err.message);
                        t.match(err.message, /only know\:tunnel\~shs/);
                        ssb.close(() => {
                          t.true(calledIsRoom);
                          t.true(calledEndpoints);
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
                    t.fail('remote tunnel.connect should not happen');
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

test('cannot tunnel.connect to bad tunnel address 2', (t) => {
  let calledIsRoom = false;
  let calledEndpoints = false;
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
                      ssb.connect(`tunnel:${ROOM_ID}:blabla`, (err, s) => {
                        t.pass(err.message);
                        t.match(err.message, /only know\:tunnel\~shs/);
                        ssb.close(() => {
                          t.true(calledIsRoom);
                          t.true(calledEndpoints);
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
                    t.fail('remote tunnel.connect should not happen');
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

test('cannot tunnel.connect to bad tunnel address 3', (t) => {
  let calledIsRoom = false;
  let calledEndpoints = false;
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
                      ssb.connect(`tonel:${ROOM_ID}:${BOB_ID}`, (err, s) => {
                        t.pass(err.message);
                        t.match(err.message, /only know\:tunnel\~shs/);
                        ssb.close(() => {
                          t.true(calledIsRoom);
                          t.true(calledEndpoints);
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
                    t.fail('remote tunnel.connect should not happen');
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

test('bad ConnHub listen event', (t) => {
  let calledIsRoom = false;
  const ssb = CreateSSB((close) => ({
    hub: () => ({
      listen: () =>
        pull.values([
          {
            type: 'connected',
            address: ROOM_MSADDR,
            // key: ROOM_ID, // left out on purpose
            details: {
              rpc: {
                tunnel: {
                  isRoom(cb) {
                    t.fail('should not call isRoom');
                    cb(null, true);
                  },
                  endpoints() {
                    t.fail('should not call endpoints');
                    return pull.empty();
                  },
                },
              },
            },
          },
        ]),
    }),
  }));

  setTimeout(() => {
    t.false(calledIsRoom);
    ssb.close(() => {
      t.end();
    });
  }, 200);
});
