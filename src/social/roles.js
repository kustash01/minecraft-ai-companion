import logger from '../utils/logger.js';

export const PlayerRole = {
  OWNER: 'owner',     // Full control over all actions, memory, and permissions
  FRIEND: 'friend',   // Can issue standard commands, shared chests, building
  GUEST: 'guest',     // Read-only queries and basic chat, cannot change memory/build
  UNKNOWN: 'unknown', // Cautious interactions
};

export const PermissionLevel = {
  SAFE: 'SAFE',         // Asking questions, checking time, safe lookups
  NORMAL: 'NORMAL',     // Movement, mining common ores, farming, crafting
  RISKY: 'RISKY',       // Dropping rare gear, entering Nether, fighting bosses
  CRITICAL: 'CRITICAL', // Resetting memory, deleting structures, lava placement
};

export class PlayerRolesManager {
  constructor(ownerName = 'kustash01') {
    this.ownerName = ownerName;
    this.players = new Map(); // username -> { role, trustScore: 0.0-1.0, permissions }

    // Register owner
    this.players.set(ownerName, {
      role: PlayerRole.OWNER,
      trustScore: 1.0,
      permissions: [PermissionLevel.SAFE, PermissionLevel.NORMAL, PermissionLevel.RISKY, PermissionLevel.CRITICAL],
    });
  }

  getPlayerRole(username) {
    if (username === this.ownerName) return PlayerRole.OWNER;
    return this.players.get(username)?.role || PlayerRole.UNKNOWN;
  }

  hasPermission(username, permLevel) {
    const player = this.players.get(username);
    if (!player) return permLevel === PermissionLevel.SAFE;
    return player.permissions.includes(permLevel);
  }

  setPlayerRole(username, role) {
    let perms = [PermissionLevel.SAFE];
    if (role === PlayerRole.FRIEND) perms = [PermissionLevel.SAFE, PermissionLevel.NORMAL, PermissionLevel.RISKY];
    if (role === PlayerRole.OWNER) perms = [PermissionLevel.SAFE, PermissionLevel.NORMAL, PermissionLevel.RISKY, PermissionLevel.CRITICAL];

    this.players.set(username, {
      role,
      trustScore: role === PlayerRole.OWNER ? 1.0 : (role === PlayerRole.FRIEND ? 0.8 : 0.4),
      permissions: perms,
    });
    logger.info(`[ROLES] Player ${username} role set to ${role}`);
  }
}

export const playerRoles = new PlayerRolesManager();
