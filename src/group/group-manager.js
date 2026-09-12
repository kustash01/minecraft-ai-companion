import { createLogger } from '../utils/logger.js';

const logger = createLogger('GROUP_MANAGER');

export class GroupManager {
  /**
   * @param {Object} options
   * @param {Object} options.socialGraph
   * @param {Object} options.profiles
   */
  constructor({ socialGraph, profiles }) {
    this.socialGraph = socialGraph;
    this.profiles = profiles;
    this.groups = new Map(); // groupId -> group object
    this.agentGroups = new Map(); // agentName -> groupId
  }

  /**
   * Creates a UUID-like string.
   */
  _generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  proposeGroup(initiator, members, goal, type) {
    const groupId = this._generateId();
    const group = {
      id: groupId,
      members: [initiator], // initiator is automatically in
      invited: members.filter(m => m !== initiator),
      leader: initiator,
      goal,
      type,
      createdAt: Date.now(),
      status: 'forming',
      taskBoard: []
    };
    
    this.groups.set(groupId, group);
    this.agentGroups.set(initiator, groupId);
    
    logger.info(`Группа ${groupId} предложена ${initiator}. Цель: ${goal}. Приглашены: ${group.invited.join(', ')}`);
    return group;
  }

  acceptGroupInvite(agentName, groupId) {
    const group = this.groups.get(groupId);
    if (!group) {
      logger.warn(`Группа ${groupId} не найдена (acceptGroupInvite)`);
      return false;
    }
    
    if (group.status !== 'forming') {
      logger.warn(`Группа ${groupId} уже активна или распущена`);
      return false;
    }
    
    const inviteIndex = group.invited.indexOf(agentName);
    if (inviteIndex !== -1) {
      group.invited.splice(inviteIndex, 1);
      group.members.push(agentName);
      this.agentGroups.set(agentName, groupId);
      logger.info(`${agentName} принял приглашение в группу ${groupId}`);
      return true;
    }
    
    return false;
  }

  declineGroupInvite(agentName, groupId, reason = '') {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    const inviteIndex = group.invited.indexOf(agentName);
    if (inviteIndex !== -1) {
      group.invited.splice(inviteIndex, 1);
      logger.info(`${agentName} отклонил приглашение в группу ${groupId}. Причина: ${reason}`);
      
      // If no one is invited and only initiator is in group, might dissolve early
      if (group.invited.length === 0 && group.members.length <= 1) {
        this.dissolveGroup(groupId, 'All invites declined');
      }
      return true;
    }
    return false;
  }

  activateGroup(groupId) {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    if (group.members.length >= 2) { // minimum 2 members to be a group
      group.status = 'active';
      logger.info(`Группа ${groupId} активирована. Участники: ${group.members.join(', ')}`);
      return group;
    } else {
      logger.warn(`Недостаточно участников для активации группы ${groupId}`);
      return false;
    }
  }

  leaveGroup(agentName, groupId, reason = '') {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    const memberIndex = group.members.indexOf(agentName);
    if (memberIndex !== -1) {
      group.members.splice(memberIndex, 1);
      this.agentGroups.delete(agentName);
      logger.info(`${agentName} покинул группу ${groupId}. Причина: ${reason}`);
      
      // Reassign leader if leader left
      if (group.leader === agentName && group.members.length > 0) {
        group.leader = group.members[0];
        logger.info(`Новый лидер группы ${groupId}: ${group.leader}`);
      }
      
      // Dissolve if empty or only 1 member left
      if (group.members.length < 2 && group.status === 'active') {
        this.dissolveGroup(groupId, 'Not enough members');
      }
      return true;
    }
    return false;
  }

  dissolveGroup(groupId, reason = '') {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    group.status = 'dissolving';
    for (const member of group.members) {
      this.agentGroups.delete(member);
    }
    group.status = 'dissolved';
    logger.info(`Группа ${groupId} распущена. Причина: ${reason}`);
    
    // We could delete it, but keeping it in 'dissolved' state for history might be useful
    // For now, keep it in the map. Cleanup will remove it later.
    return true;
  }

  getAgentGroup(agentName) {
    const groupId = this.agentGroups.get(agentName);
    if (!groupId) return null;
    return this.groups.get(groupId) || null;
  }

  getActiveGroups() {
    const active = [];
    for (const group of this.groups.values()) {
      if (group.status === 'active') {
        active.push(group);
      }
    }
    return active;
  }

  postTask(groupId, taskObj) {
    const group = this.groups.get(groupId);
    if (!group) return null;
    
    const task = {
      id: taskObj.id || this._generateId(),
      description: taskObj.description,
      assignedTo: taskObj.assignedTo || null,
      requestedBy: taskObj.requestedBy,
      status: taskObj.status || 'open',
      priority: taskObj.priority || 5,
      createdAt: Date.now()
    };
    
    if (task.assignedTo && task.status === 'open') {
      task.status = 'assigned';
    }
    
    group.taskBoard.push(task);
    logger.info(`Новая задача добавлена в группу ${groupId}: ${task.description}`);
    return task;
  }

  claimTask(agentName, groupId, taskId) {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    const task = group.taskBoard.find(t => t.id === taskId);
    if (task && (task.status === 'open' || task.status === 'assigned')) {
      task.assignedTo = agentName;
      task.status = 'in_progress';
      logger.info(`${agentName} взял задачу ${taskId} в группе ${groupId}`);
      return true;
    }
    return false;
  }

  completeTask(groupId, taskId, result = null) {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    const task = group.taskBoard.find(t => t.id === taskId);
    if (task && task.status === 'in_progress') {
      task.status = 'completed';
      logger.info(`Задача ${taskId} завершена в группе ${groupId}`);
      return true;
    }
    return false;
  }

  suggestGroupFormation(agents, socialGraph) {
    // This is a placeholder for complex logic analyzing proximity, relationships, etc.
    // In a real scenario, this would use `this.socialGraph` and `this.profiles`.
    const suggestions = [];
    if (agents.length >= 2) {
      suggestions.push({
        members: [agents[0], agents[1]],
        type: 'exploration',
        goal: 'Explore nearby terrain'
      });
    }
    return suggestions;
  }

  getState() {
    return {
      groups: Array.from(this.groups.values()),
      agentGroups: Object.fromEntries(this.agentGroups.entries())
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [groupId, group] of this.groups.entries()) {
      if (group.status === 'dissolved' && now - group.createdAt > 3600000) { // 1 hour
        this.groups.delete(groupId);
      } else if (group.status === 'forming' && now - group.createdAt > 600000) { // 10 minutes
        this.dissolveGroup(groupId, 'Forming timeout');
      } else if (group.status === 'active') {
        // check if active but no activity - left as exercise for more complex activity tracking
      }
    }
  }
}
