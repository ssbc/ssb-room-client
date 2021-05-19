const test = require('tape');
const ssbKeys = require('ssb-keys');
const server = require('server');
const pull = require('pull-stream');
const Notify = require('pull-notify');
const {
  ROOM_ID,
  BOB_ID,
  ROOM_MSADDR,
  ALICE_ID,
  ALICE_KEYS,
  BOB_KEYS,
} = require('./keys');
const CreateSSB = require('./sbot');

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
                room: {
                  metadata(cb) {
                    t.pass('rpc.room.metadata got called');
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

test('if room.metadata is missing, tries tunnel.isRoom', (t) => {
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
                room: {
                  metadata(cb) {
                    cb(
                      new Error(
                        'method:room,metadata is not in list of allowed methods',
                      ),
                    );
                  },
                },
                tunnel: {
                  isRoom(cb) {
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, false);
                    setTimeout(() => {
                      t.pass('did not call rpc.tunnel.endpoints');
                      close(t.end);
                    }, 200);
                  },
                },
                tunnel: {
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
        t.deepEqual(data, {
          name: 'Foobar Express',
          type: 'room',
          membership: true,
          openInvites: true,
          supportsAliases: true,
          supportsHttpAuth: true,
        });
        dbUpdated = true;
        if (hubUpdated) close(t.end);
      },
    }),
    hub: () => ({
      update: (addr, data) => {
        t.equal(addr, ROOM_MSADDR);
        t.deepEqual(data, {
          name: 'Foobar Express',
          type: 'room',
          membership: true,
          openInvites: true,
          supportsAliases: true,
          supportsHttpAuth: true,
        });
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, {
                      name: 'Foobar Express',
                      membership: true,
                      features: ['room1', 'alias', 'httpAuth'],
                    });
                  },
                },
                tunnel: {
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, true);
                  },
                },
                tunnel: {
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    cb(null, true);
                  },
                },
                tunnel: {
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
                room: {
                  metadata(cb) {
                    t.pass('rpc.tunnel.isRoom got called');
                    calledIsRoom = true;
                    cb(null, true);
                  },
                },
                tunnel: {
                  endpoints() {
                    setTimeout(() => {
                      ssb.connect(`tunnel:${ROOM_ID}:${BOB_ID}`, (err, s) => {
                        t.doesNotMatch(err.message, /only know\:tunnel\~shs/);
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
                  endpoints: () => {
                    return pull.empty();
                  },
                },

                room: {
                  metadata(cb) {
                    t.pass('rpc.room.metadata got called');
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

test('can consumeAliasUri given an HTTP URL', (t) => {
  let calledIsRoom = false;
  const BOB_ADDR = `tunnel:${ROOM_ID}:${BOB_ID}~shs:${BOB_ID.slice(1, -8)}`;
  const expectedConnections = [ROOM_MSADDR, BOB_ADDR];
  const hubEvents = Notify();

  function onConnectedToRoom(cb) {
    const roomRpc = {
      room: {
        metadata(cb) {
          t.pass('rpc.tunnel.isRoom got called');
          calledIsRoom = true;
          cb(null, true);
        },
      },
      tunnel: {
        connect({portal, target, origin}, cb) {
          t.true(calledIsRoom);
          t.equal(portal, ROOM_ID);
          t.equal(target, BOB_ID);
          t.equal(origin, ALICE_ID);
        },
        endpoints: () => {
          return pull.empty();
        },
      },
    };
    cb(null, roomRpc);

    hubEvents({
      type: 'connected',
      address: ROOM_MSADDR,
      key: ROOM_ID,
      details: {
        rpc: roomRpc,
      },
    });
  }

  function onConnectedToBob(cb) {
    const bobRpc = {
      dummy: {
        whoami(cb2) {
          cb2(null, 'I am bob');
        },
      },
    };
    cb(null, bobRpc);
  }

  const ssb = CreateSSB((close) => ({
    hub: () => ({
      listen: () => hubEvents.listen(),
    }),
    remember(addr, data) {
      t.equal(addr, BOB_ADDR, 'remembered bob');
      t.equal(data.key, BOB_ID, 'key');
      t.equal(data.room, ROOM_ID, 'roomKey');
      t.equal(data.roomAddress, ROOM_MSADDR, 'roomAddress');
      t.equal(data.autoconnect, true, 'autoconnect');
    },
    connect(addr, data, cb) {
      if (!cb) cb = data;
      t.equal(addr, expectedConnections.shift(), `connect to ${addr}`);
      if (addr === ROOM_MSADDR) {
        onConnectedToRoom(cb);
      } else {
        onConnectedToBob(cb);
      }
    },
  }));

  // Launch mock server to host the alias details
  const ctx = server({port: 3000}, [
    server.router.get('/bob', (ctx) => ({
      multiserverAddress: ROOM_MSADDR,
      roomId: ROOM_ID,
      userId: BOB_ID,
      alias: 'bob',
      signature: ssbKeys.sign(
        BOB_KEYS,
        `=room-alias-registration:${ROOM_ID}:${BOB_ID}:bob`,
      ),
    })),
  ]);

  setTimeout(() => {
    ssb.roomClient.consumeAliasUri('http://localhost:3000/bob', (err, rpc) => {
      t.error(err, 'no error');

      rpc.dummy.whoami((err2, answer) => {
        t.error(err2, 'no error');
        t.equals(answer, 'I am bob');

        ctx
          .then(({close}) => close())
          .then(() => {
            ssb.close(() => {
              t.end();
            });
          });
      });
    });
  }, 200);
});

test('can consumeAliasUri given an SSB URI', (t) => {
  let calledIsRoom = false;
  const BOB_ADDR = `tunnel:${ROOM_ID}:${BOB_ID}~shs:${BOB_ID.slice(1, -8)}`;
  const expectedConnections = [ROOM_MSADDR, BOB_ADDR];
  const hubEvents = Notify();

  function onConnectedToRoom(cb) {
    const roomRpc = {
      room: {
        metadata(cb) {
          t.pass('rpc.tunnel.isRoom got called');
          calledIsRoom = true;
          cb(null, true);
        },
      },
      tunnel: {
        connect({portal, target, origin}, cb) {
          t.true(calledIsRoom);
          t.equal(portal, ROOM_ID);
          t.equal(target, BOB_ID);
          t.equal(origin, ALICE_ID);
        },
        endpoints: () => {
          return pull.empty();
        },
      },
    };
    cb(null, roomRpc);

    hubEvents({
      type: 'connected',
      address: ROOM_MSADDR,
      key: ROOM_ID,
      details: {
        rpc: roomRpc,
      },
    });
  }

  function onConnectedToBob(cb) {
    const bobRpc = {
      dummy: {
        whoami(cb2) {
          cb2(null, 'I am bob');
        },
      },
    };
    cb(null, bobRpc);
  }

  const ssb = CreateSSB((close) => ({
    hub: () => ({
      listen: () => hubEvents.listen(),
    }),
    remember(addr, data) {
      t.equal(addr, BOB_ADDR, 'remembered bob');
      t.equal(data.key, BOB_ID, 'key');
      t.equal(data.room, ROOM_ID, 'roomKey');
      t.equal(data.roomAddress, ROOM_MSADDR, 'roomAddress');
      t.equal(data.autoconnect, true, 'autoconnect');
    },
    connect(addr, data, cb) {
      if (!cb) cb = data;
      t.equal(addr, expectedConnections.shift(), `connect to ${addr}`);
      if (addr === ROOM_MSADDR) {
        onConnectedToRoom(cb);
      } else {
        onConnectedToBob(cb);
      }
    },
  }));

  setTimeout(() => {
    const ssbUri =
      'ssb:experimental?' +
      [
        'action=consume-alias',
        'multiserverAddress=' + encodeURIComponent(ROOM_MSADDR),
        'roomId=' + encodeURIComponent(ROOM_ID),
        'userId=' + encodeURIComponent(BOB_ID),
        'alias=' + 'bob',
        'signature=' +
          encodeURIComponent(
            ssbKeys.sign(
              BOB_KEYS,
              `=room-alias-registration:${ROOM_ID}:${BOB_ID}:bob`,
            ),
          ),
      ].join('&');

    ssb.roomClient.consumeAliasUri(ssbUri, (err, rpc) => {
      t.error(err, 'no error');

      rpc.dummy.whoami((err2, answer) => {
        t.error(err2, 'no error');
        t.equals(answer, 'I am bob');

        ssb.close(() => {
          t.end();
        });
      });
    });
  }, 200);
});
