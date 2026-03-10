import os from 'os';

/**
 * Returns all non-loopback IPv4 addresses of the local machine.
 * These are the addresses a phone on the same LAN can use to reach this machine.
 */
export function getLanAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const ifaces of Object.values(interfaces)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}
