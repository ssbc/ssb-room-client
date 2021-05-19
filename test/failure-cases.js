const test = require('tape');
const pull = require('pull-stream');
const {ROOM_MSADDR, ROOM_ID, BOB_ID} = require('./keys');
const CreateSSB = require('./sbot');

test('cannot tunnel.connect to bad tunnel address 1', (t) => {
  let calledMetadata = false;
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.room.metadata got called');
                    calledMetadata = true;
                    cb(null, {name: 'foo.com'});
                  },
                  attendants() {
                    setTimeout(() => {
                      ssb.connect(`tunnel:blabla:${BOB_ID}`, (err, s) => {
                        t.pass(err.message);
                        t.match(err.message, /only know\:tunnel\~shs/);
                        ssb.close(() => {
                          t.true(calledMetadata);
                          t.true(calledEndpoints);
                          t.true(calledClose);
                          t.end();
                        });
                      });
                    }, 200);

                    t.pass('rpc.room.attendants got called');
                    calledEndpoints = true;
                    return pull.values([{type: 'state', ids: [BOB_ID]}]);
                  },
                },
                tunnel: {
                  isRoom(cb) {
                    t.fail('dont call tunnel.isRoom if room.metadata exists');
                  },
                  endpoints() {
                    t.fail(
                      'dont call tunnel.endpoints if room.attendants exists',
                    );
                    return pull.error(new Error());
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
  let calledMetadata = false;
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.room.metadata got called');
                    calledMetadata = true;
                    cb(null, {name: 'foo.com'});
                  },
                  attendants() {
                    setTimeout(() => {
                      ssb.connect(`tunnel:${ROOM_ID}:blabla`, (err, s) => {
                        t.pass(err.message);
                        t.match(err.message, /only know\:tunnel\~shs/);
                        ssb.close(() => {
                          t.true(calledMetadata);
                          t.true(calledEndpoints);
                          t.true(calledClose);
                          t.end();
                        });
                      });
                    }, 200);

                    t.pass('rpc.room.attendants got called');
                    calledEndpoints = true;
                    return pull.values([{type: 'state', ids: [BOB_ID]}]);
                  },
                },
                tunnel: {
                  isRoom(cb) {
                    t.fail('dont call tunnel.isRoom if room.metadata exists');
                  },
                  endpoints() {
                    t.fail(
                      'dont call tunnel.endpoints if room.attendants exists',
                    );
                    return pull.error(new Error());
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
  let calledMetadata = false;
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.room.metadata got called');
                    calledMetadata = true;
                    cb(null, {name: 'foo.com'});
                  },
                  attendants() {
                    setTimeout(() => {
                      ssb.connect(`tonel:${ROOM_ID}:${BOB_ID}`, (err, s) => {
                        t.pass(err.message);
                        t.match(err.message, /only know\:tunnel\~shs/);
                        ssb.close(() => {
                          t.true(calledMetadata);
                          t.true(calledEndpoints);
                          t.true(calledClose);
                          t.end();
                        });
                      });
                    }, 200);

                    t.pass('rpc.room.attendants got called');
                    calledEndpoints = true;
                    return pull.values([{type: 'state', ids: [BOB_ID]}]);
                  },
                },
                tunnel: {
                  isRoom(cb) {
                    t.fail('dont call tunnel.isRoom if room.metadata exists');
                  },
                  endpoints() {
                    t.fail(
                      'dont call tunnel.endpoints if room.attendants exists',
                    );
                    return pull.error(new Error());
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

test('when fails to create tunnel.connect duplex stream', (t) => {
  let calledMetadata = false;
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.room.metadata got called');
                    calledMetadata = true;
                    cb(null, {name: 'foo.com'});
                  },
                  attendants() {
                    setTimeout(() => {
                      ssb.connect(`tunnel:${ROOM_ID}:${BOB_ID}`, (err, s) => {
                        t.ok(err, 'error, but we expected it');
                        t.match(err.message, /foobar/);
                        ssb.close(() => {
                          t.true(calledMetadata);
                          t.true(calledEndpoints);
                          t.true(calledConnect);
                          t.true(calledClose);
                          t.end();
                        });
                      });
                    }, 200);

                    t.pass('rpc.room.attendants got called');
                    calledEndpoints = true;
                    return pull.values([{type: 'state', ids: [BOB_ID]}]);
                  },
                },
                tunnel: {
                  isRoom(cb) {
                    t.fail('dont call tunnel.isRoom if room.metadata exists');
                  },
                  endpoints() {
                    t.fail(
                      'dont call tunnel.endpoints if room.attendants exists',
                    );
                    return pull.error(new Error());
                  },
                  connect(addr) {
                    t.deepEqual(addr, {
                      portal: ROOM_ID,
                      target: BOB_ID,
                    });
                    t.pass('at this point would do an actual connection');
                    calledConnect = true;
                    return {
                      source: pull.error(new Error('foobar')),
                      sink: () => {},
                    };
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
                room: {
                  metadata(cb) {
                    calledIsRoom = true;
                    t.fail('should not call rpc.room.metadata');
                    cb(null, true);
                  },
                  attendants() {
                    t.fail('should not call rpc.room.attendants');
                    return pull.empty();
                  },
                },
                tunnel: {
                  isRoom(cb) {
                    calledIsRoom = true;
                    t.fail('should not call rpc.tunnel.isRoom');
                    cb(null, true);
                  },
                  endpoints() {
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

  setTimeout(() => {
    t.false(calledIsRoom);
    ssb.close(() => {
      t.end();
    });
  }, 200);
});

test('if room.metadata errors, does not try tunnel.isRoom', (t) => {
  let calledIsRoom = false;
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
                room: {
                  metadata(cb) {
                    cb(new Error('random bad stuff'));
                  },
                },
                tunnel: {
                  isRoom(cb) {
                    calledIsRoom = true;
                    t.fail('should not call isRoom');
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

test('connect to offline room', (t) => {
  const ssb = CreateSSB();

  ssb.connect(`tunnel:${ROOM_ID}:${BOB_ID}`, (err, x) => {
    t.match(
      err.message,
      /^cant connect to .* because room .* is offline or unknown$/,
      'connect but offline',
    );
    ssb.close(t.end);
  });
});
