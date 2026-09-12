export class ShortTermMemory {
  constructor() {
    this.currentTask = null;
    this.currentPlan = null;
    this.recentObservations = [];
    this.maxObservations = 20;
    this.temporaryVariables = new Map();
  }

  setTask(task) {
    this.currentTask = task;
  }

  getTask() {
    return this.currentTask;
  }

  clearTask() {
    this.currentTask = null;
    this.currentPlan = null;
  }

  setPlan(plan) {
    this.currentPlan = plan;
  }

  getPlan() {
    return this.currentPlan;
  }

  updatePlanStep(stepIndex, status, result = null) {
    if (!this.currentPlan || !this.currentPlan.steps[stepIndex]) return;
    this.currentPlan.steps[stepIndex].status = status;
    if (result) this.currentPlan.steps[stepIndex].result = result;
  }

  addObservation(observation) {
    this.recentObservations.push({
      text: observation,
      timestamp: Date.now(),
    });
    if (this.recentObservations.length > this.maxObservations) {
      this.recentObservations.shift();
    }
  }

  getRecentObservations(limit = 5) {
    return this.recentObservations.slice(-limit).map(o => o.text);
  }

  setVar(key, val) {
    this.temporaryVariables.set(key, val);
  }

  getVar(key) {
    return this.temporaryVariables.get(key);
  }

  clear() {
    this.currentTask = null;
    this.currentPlan = null;
    this.recentObservations = [];
    this.temporaryVariables.clear();
  }
}
