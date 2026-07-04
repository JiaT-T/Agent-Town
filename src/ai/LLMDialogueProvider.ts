import type { DialogueProvider, DialogueRequest, DialogueResult } from './DialogueProvider';

export class LLMDialogueProvider implements DialogueProvider {
  generateDialogue(request: DialogueRequest): DialogueResult {
    // TODO: Replace this placeholder with a server-side LLM call.
    // Browser-only demos should not call a private model key directly. A real
    // implementation would send agent state, memories, nearby events, and the
    // current location to a backend route, then return dialogue text plus
    // structured intent hints. The client Agent Loop should still own movement,
    // needs, schedules, memories, and state transitions.
    return {
      topic: 'LLM dialogue placeholder',
      lines: [
        {
          agentId: request.speaker.id,
          text: 'LLM dialogue is reserved for a later server-backed provider.',
        },
        {
          agentId: request.listener.id,
          text: 'For now, the local template provider keeps this demo fully offline.',
        },
      ],
    };
  }
}
