/**
 * The slice of LINE's webhook payload this app acts on.
 *
 * Hand-written rather than imported from the SDK, and deliberately narrow: an
 * event type that is not described here is one the webhook ignores, which is
 * the behaviour wanted for the dozen event kinds (leave, join, beacon, unsend,
 * membership changes) that have nothing to do with an expense claim.
 */

export type LineSource = {
  type: "user" | "group" | "room";
  /** Absent when a group event has no identifiable sender. */
  userId?: string;
};

export type LineTextMessage = {
  type: "text";
  id: string;
  text: string;
};

export type LineImageMessage = {
  type: "image";
  id: string;
};

/** Anything else the user might send: sticker, video, location, file. */
export type LineOtherMessage = {
  type: string;
  id: string;
};

export type LineMessageEvent = {
  type: "message";
  replyToken: string;
  source: LineSource;
  message: LineTextMessage | LineImageMessage | LineOtherMessage;
};

export type LinePostbackEvent = {
  type: "postback";
  replyToken: string;
  source: LineSource;
  postback: { data: string };
};

export type LineFollowEvent = {
  type: "follow";
  replyToken: string;
  source: LineSource;
};

export type LineEvent =
  | LineMessageEvent
  | LinePostbackEvent
  | LineFollowEvent
  | { type: string; source?: LineSource; replyToken?: string };

export type LineWebhookBody = {
  destination?: string;
  events?: LineEvent[];
};

export function isMessageEvent(event: LineEvent): event is LineMessageEvent {
  return event.type === "message";
}

export function isPostbackEvent(event: LineEvent): event is LinePostbackEvent {
  return event.type === "postback";
}

export function isFollowEvent(event: LineEvent): event is LineFollowEvent {
  return event.type === "follow";
}

export function isImageMessage(
  message: LineMessageEvent["message"],
): message is LineImageMessage {
  return message.type === "image";
}

export function isTextMessage(
  message: LineMessageEvent["message"],
): message is LineTextMessage {
  return message.type === "text";
}
