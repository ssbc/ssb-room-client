const {isAddress} = require('ssb-ref');

const SEED = 'SSB+Room+PSK3TLYC2T86EHQCUHBUHASCASE18JBV24=';

function isOpenRoomInvite(invite: any) {
  if (typeof invite !== 'string') return false;
  if (!invite) return false;
  if (!invite.endsWith(':' + SEED)) return false;
  const [addr] = invite.split(':' + SEED);
  if (!addr) return false;
  if (!isAddress(addr)) return false;
  return true;
}

function addressToOpenRoomInvite(addr: any) {
  return typeof addr === 'string' ? `${addr}:${SEED}` : null;
}

function openRoomInviteToAddress(invite: any) {
  return isOpenRoomInvite(invite) ? invite.split(':' + SEED)[0] : null;
}

module.exports = {
  SEED,
  isOpenRoomInvite,
  addressToOpenRoomInvite,
  openRoomInviteToAddress,
};
