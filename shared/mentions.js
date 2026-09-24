export const fileMentionIds = (message) =>
  [...String(message).matchAll(/@file#(\d+)(?=$|[\s.,;:!?])/gi)].map((match) =>
    Number(match[1]),
  );

export const artifactMentionKeys = (message) =>
  new Set(
    [...String(message).matchAll(/@([A-Z]+)#(\d+)(?=$|[\s.,;:!?])/g)].map(
      (match) => `${match[1]}#${match[2]}`,
    ),
  );

export function activeMentionQuery(message) {
  const tail = String(message).match(/@([^@\n]*)$/)?.[1];
  if (tail === undefined || /^(?:file|[A-Z]+)#\d+(?:\s|$)/i.test(tail))
    return null;
  return tail.toLowerCase();
}
