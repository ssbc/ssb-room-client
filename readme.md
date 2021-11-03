<!--
SPDX-FileCopyrightText: 2021 Andre Staltz

SPDX-License-Identifier: CC0-1.0
-->

# ssb-room-client

Plugin to accept interact with SSB room servers. This is supposed to be installed and used on **apps** that make remote calls to servers, thus _clients_.

Note, some rooms may have additional features such as Sign-in with SSB and HTTP invites, so it may be worth installing also [ssb-http-auth-client](https://github.com/ssb-ngi-pointer/ssb-http-auth-client) and [ssb-http-invite-client](https://github.com/ssb-ngi-pointer/ssb-http-invite-client).

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

This library supports [room2 features](https://github.com/ssb-ngi-pointer/rooms2), alias registration and alias consumption, using the following muxrpc APIs:

### `ssb.roomClient.consumeAliasUri(uri, cb)`

Connects to a member of the room known by the "alias" `uri`.

* `uri` is a string, either an HTTP URL or an SSB URI:
    * `https://alice.room.com`
    * `ssb:experimental?action=consume-alias&roomId=R&userId=U&.......`
* `cb` is called with the 2nd arg `rpc` (of the alias' peer) if succeeded

This API will:

1. Make an HTTP call on the room server
2. Establish a muxrpc connection with the room
3. Establish a muxrpc connection to the alias peer inside the room
4. Store metadata about the alias peer in [ssb-conn DB](https://github.com/staltz/ssb-conn/), so that in the future we can reconnect to this alias peer

### `ssb.roomClient.registerAlias(roomId, alias, cb)`

Registers an alias at the room server known by `roomId`

* `roomId` is the SSB ID of the room server where you want to register an alias
* `alias` is a string you want to be known by, e.g. "alice"
* `cb` will be called with 2nd arg as the confirmed alias URL if everything succeeded

### `ssb.roomClient.revokeAlias(roomId, alias, cb)`

* `roomId` is the SSB ID of the room server where you want to revoke an alias
* `alias` is a string you want to remove, e.g. "Alice"
* `cb` will be called with 2nd arg `true` if everything succeeded

### Utils and misc

Apart from that, you just use SSB CONN's APIs to connect with Rooms and the peers online in a Room.

There is one more muxrpc API, `discoveredAttendants()` which returns a `pull-stream` source of all room attendants discovered, but this API is sort of internal because `ssb-conn`'s scheduler uses it and you shouldn't have to worry about using this API ever.

If an _Open_ Room (has the same invite code for everyone) gives the user an invite code, then you can use the **following utilities** to extract the [multiserver](https://github.com/ssbc/multiserver) `address` of the Room:

```js
const utils = require('ssb-room-client/utils');

/**
 * Returns a boolean indicating whether this
 * string is an invite code to some Room.
 */
utils.isOpenRoomInvite(str);

/**
 * Returns a multiserver address but
 * returns null if `str` is not an invite.
 */
utils.openRoomInviteToAddress(str);

/**
 * If `addr` refers to the multiserver address
 * for a Room server, then this returns an invite
 * code to that Room.
 */
utils.addressToOpenRoomInvite(addr);
```

For example, if you call `utils.openRoomInviteToAddress(invite)`, you now have `address`, and you can call `ssb.conn.connect(address, {type: 'room'}, cb)`.

Once the room is connected to, the `ssb-room-client` plugin will automatically stage the peers currently online in that Room, and then using `ssb.conn.stagedPeers()` you can read those peers and optionally connect to them using the address they announced. Read more about this in the [docs for SSB CONN](https://github.com/staltz/ssb-conn).

**Rooms are not feeds to be followed.** Although every room server has an SSB id, this is only used for encryption through secret-handshake, and does not represent a "feed" in any sense. Your app should not display room servers as accounts, users should not assign names or profile pictures, because the room never publishes anything on SSB. If accounts follow a room, this would only pollute the social graph with no benefit.

## License

LGPL-3.0
