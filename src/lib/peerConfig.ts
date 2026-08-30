/**
 * PeerJS configuration using a pool of reliable public broker servers.
 * This improves connection reliability across different network environments.
 */
export const PEER_CONFIG = {
  debug: 1 as 0 | 1 | 2,
  // Multiple broker server options - PeerJS will try them in order
  // Using more reliable free public PeerJS servers
  servers: [
    {
      host: "peerjs.com",
      port: 443,
      path: "/",
      secure: true,
    },
    {
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
    },
    {
      host: "1.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
    },
    {
      host: "peerjs.metered.live",
      port: 443,
      path: "/peerjs",
      secure: true,
    },
  ],
};