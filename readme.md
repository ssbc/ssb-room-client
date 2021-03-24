# ssb-room-client

Plugin to accept interact with SSB room servers. This is supposed to be installed and used on **apps** that make remote calls to servers, thus *clients*.

## Installation

**Prerequisites:**

- Node.js 6.5.0 or higher
- Requires `secret-stack@>=6.2.0`
- Requires `ssb-keys@>=8.1.0`
- [ssb-conn](https://github.com/staltz/ssb-conn) installed as a secret-stack plugin

```
npm install --save ssb-room-client
```

Require and use the following plugin into your ssb-server or secret-stack setup:

```diff
 SecretStack({appKey: require('ssb-caps').shs})
   .use(require('ssb-master'))
   .use(require('ssb-logging'))
   .use(require('ssb-conn'))
   .use(require('ssb-replicate'))
   .use(require('ssb-ebt'))
+  .use(require('ssb-room-client'))
   .use(require('ssb-friends'))
   .use(require('ssb-about'))
   .call(null, require('./config'));
```

Also, configure your [ssb-config connections](https://github.com/ssbc/ssb-config) to allow incoming and outgoing `tunnel` connections. Both are necessary:

```diff
 connections: {
   incoming: {
     net: [{scope: 'private', transform: 'shs', port: NET_PORT}],
     bluetooth: [{scope: 'public', transform: 'shs'}],
+    tunnel: [{scope: 'public', transform: 'shs'}],
   },
   outgoing: {
     net: [{transform: 'shs'}],
     bluetooth: [{scope: 'public', transform: 'shs'}],
+    tunnel: [{transform: 'shs'}],
   },
 };
```

## Usage

This library supports [room2 features](https://github.com/ssb-ngi-pointer/rooms2), such as alias registration and consumption, using the following muxrpc APIs:

```js
// `roomId` is the SSB ID of the room server where you want to register an alias
// `alias` is a string you want to be known by, e.g. "Alice"
// `cb` will be called with 2nd arg `true` if everything succeeded
ssb.roomClient.registerAlias(roomId, alias, cb)

// `roomId` is the SSB ID of the room server where you want to revoke an alias
// `alias` is a string you want to remove, e.g. "Alice"
// `cb` will be called with 2nd arg `true` if everything succeeded
ssb.roomClient.revokeAlias(roomId, alias, cb)

// `uri` is a string, either an HTTP URL or an SSB URI:
//   * `https://alice.room.com`
//   * `ssb:experimental?action=consume-alias&roomId=R&userId=U&.......`
// `cb` is called with the 2nd arg `rpc` (of the alias' peer) if succeeded
ssb.roomClient.consumeAliasUri(uri, cb)

// Low-level alternative to the above
// `opts` is an object and needs all of the following fields:
//   * address: string
//   * roomId: string
//   * userId: string
//   * alias: string
//   * signature: string
// `cb` is called with the 2nd arg `rpc` (of the alias' peer) if succeeded
ssb.roomClient.consumeAlias(opts, cb)
```

Apart from that, you just use SSB CONN's APIs to connect with Rooms and the peers online in a Room.

If a Room gives the user an invite code, then you can use the **following utilities** to extract the [multiserver](https://github.com/ssbc/multiserver) `address` of the Room:

```js
const utils = require('ssb-room-client/utils')

/**
 * Returns a boolean indicating whether this
 * string is an invite code to some Room.
 */
utils.isInvite(str)

/**
 * Returns a multiserver address but
 * returns null if `str` is not an invite.
 */
utils.inviteToAddress(str)

/**
 * If `addr` refers to the multiserver address
 * for a Room server, then this returns an invite
 * code to that Room.
 */
utils.addressToInvite(addr)
```

For example, if you call `utils.inviteToAddress(invite)`, you now have `address`, and you can call `ssb.conn.connect(address, {type: 'room'}, cb)`.

Once the Room is connected to, the `ssb-room-client` plugin will automatically stage the peers currently online in that Room, and then using `ssb.conn.stagedPeers()` you can read those peers and optionally connect to them using the address they announced. Read more about this in the [docs for SSB CONN](https://github.com/staltz/ssb-conn).

**Rooms are not accounts to be followed.** Although every room server has an SSB id, this is only used for encryption through secret-handshake, and does not represent a "feed" in any sense. Your app should not display room servers as accounts, users should not assign names or profile pictures, because the room never publishes anything on SSB. If accounts follow a room, this would only pollute the social graph with no benefit.

## License

LGPL-3.0
