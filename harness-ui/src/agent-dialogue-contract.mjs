export class AgentDialogueError extends Error {
  constructor(message, code = 'AGENT_DIALOGUE_INVALID') {
    super(message);
    this.name = 'AgentDialogueError';
    this.code = code;
  }
}

function boundedText(value, name, max) {
  if (typeof value !== 'string') throw new AgentDialogueError(`${name} must be text`);
  const text = value.trim();
  if (!text || text.length > max) throw new AgentDialogueError(`${name} must contain 1-${max} characters`);
  return text;
}

export function validateAgentQuestion(value) {
  return boundedText(value, 'question', 2_000);
}

export function validateAgentAnswer(value) {
  return boundedText(value, 'answer', 8_000);
}
