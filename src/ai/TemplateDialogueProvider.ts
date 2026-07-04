import { recentMemoryText } from '../agents/memory';
import { GENERIC_OPENERS, LOCATION_TOPICS, ROLE_TOPICS } from '../data/dialogueTemplates';
import type { DialogueProvider, DialogueRequest, DialogueResult } from './DialogueProvider';

function pick<T>(items: T[], seed: string): T {
  const hash = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  return items[hash % items.length];
}

export class TemplateDialogueProvider implements DialogueProvider {
  generateDialogue(request: DialogueRequest): DialogueResult {
    const { speaker, listener, location, timeLabel, recentEvents } = request;
    const roleTopic = pick(ROLE_TOPICS[speaker.role] ?? GENERIC_OPENERS, `${speaker.id}-${timeLabel}`);
    const placeTopic = pick(LOCATION_TOPICS[location.name] ?? GENERIC_OPENERS, `${listener.id}-${location.id}-${timeLabel}`);
    const event = recentEvents[0];
    const speakerMemory = recentMemoryText(speaker, 2);
    const listenerMemory = recentMemoryText(listener, 2);
    const topic = event ? event.description : `${placeTopic} and ${roleTopic}`;

    const speakerLine = event
      ? `I heard "${event.description}". It might affect my plan.`
      : `${pick(GENERIC_OPENERS, speaker.id + listener.id)} I am thinking about ${roleTopic}.`;

    const listenerLine = listenerMemory
      ? `That connects with what I remember: ${listenerMemory}`
      : `Good point. Around ${location.name}, I usually notice ${placeTopic}.`;

    const closingLine = speakerMemory
      ? `My recent notes say: ${speakerMemory}`
      : `Let's keep watching what happens after ${timeLabel}.`;

    return {
      topic,
      lines: [
        { agentId: speaker.id, text: speakerLine },
        { agentId: listener.id, text: listenerLine },
        { agentId: speaker.id, text: closingLine },
      ],
    };
  }
}
