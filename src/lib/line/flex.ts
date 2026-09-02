import { DECISION_REASONS } from "@/lib/domain/decisions";
import { ITEM_TYPE_LABELS } from "@/lib/domain/items";
import type { MonthStats } from "@/lib/domain/stats";
import { liffUrl } from "@/lib/env";
import type { DraftLine, DraftState } from "@/lib/line/claim";
import type { LineMessage } from "@/lib/line/client";
import { encodePostback } from "@/lib/line/postback";
import { formatMoney, formatThaiDate } from "@/lib/thai";

/**
 * What the bot looks like.
 *
 * Flex Message is JSON, not markup, and every one of these builders returns a
 * plain object for the client to POST. They are kept pure — no database, no
 * network — so the layouts can be asserted in tests without a LINE channel.
 *
 * The palette is the app's own (`src/app/globals.css`), spelled out in hex
 * because LINE renders these bubbles itself and knows nothing of CSS variables.
 */

const ACCENT = "#cc1517";
const TEXT = "#201e1d";
const MUTED = "#7d7979";
const HAIRLINE = "#d7d3d3";
const WARNING = "#b31114";

type Box = Record<string, unknown>;

function bubble(body: Box, footer?: Box): LineMessage {
  return {
    type: "bubble",
    body,
    ...(footer ? { footer } : {}),
  };
}

function flex(altText: string, contents: LineMessage): LineMessage {
  // altText is what shows in the chat list and in a push notification, so it
  // carries the headline rather than a generic "you have a message".
  return { type: "flex", altText, contents };
}

function label(text: string): Box {
  return { type: "text", text, size: "xs", color: MUTED };
}

function row(name: string, value: string): Box {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: name, size: "sm", color: MUTED, flex: 2 },
      { type: "text", text: value, size: "sm", color: TEXT, flex: 4, wrap: true },
    ],
  };
}

function separator(): Box {
  return { type: "separator", margin: "md", color: HAIRLINE };
}

function button(
  text: string,
  action: Box,
  style: "primary" | "secondary" | "link" = "secondary",
): Box {
  return {
    type: "button",
    height: "sm",
    style,
    ...(style === "primary" ? { color: ACCENT } : {}),
    action: { label: text, ...action },
  };
}

function postbackAction(text: string, data: string): Box {
  // displayText echoes the tap into the chat, so the transcript reads as a
  // conversation rather than a series of unexplained bot replies.
  return { type: "postback", data, displayText: text };
}

// ─── The requester's side ─────────────────────────────────────────────────

/** One line of a claim, rendered for the body of a card. */
function lineRows(line: DraftLine): Box[] {
  const rows: Box[] = [
    row("ประเภท", ITEM_TYPE_LABELS[line.type]),
    row("วันที่", formatThaiDate(line.incurredOn)),
  ];

  if (line.origin || line.destination) {
    rows.push(row("เส้นทาง", `${line.origin ?? "—"} → ${line.destination ?? "—"}`));
  }
  if (line.distanceKm) {
    rows.push(
      row(
        "ระยะทาง",
        `${line.distanceKm} กม. × ${formatMoney(line.ratePerKm ?? 0)} บาท`,
      ),
    );
  }

  rows.push(row("จำนวนเงิน", `฿${formatMoney(line.amount)}`));
  return rows;
}

/**
 * The answer to a photo: what was read off it, and what to do about it.
 *
 * Gaps are named rather than hidden. OCR misreads a crumpled receipt often
 * enough that a card claiming success would be worse than one saying plainly
 * which two fields it could not find.
 */
export function receiptCard(line: DraftLine, state: DraftState): LineMessage {
  const incomplete = line.missing.length > 0;

  const body: Box = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      label(incomplete ? "อ่านข้อมูลได้บางส่วน" : "อ่านข้อมูลจากไฟล์แล้ว"),
      ...lineRows(line),
      ...(incomplete
        ? [
            separator(),
            {
              type: "text",
              text: `ยังขาด: ${line.missing.join(", ")}`,
              size: "xs",
              color: WARNING,
              wrap: true,
              margin: "md",
            },
          ]
        : []),
      separator(),
      {
        type: "box",
        layout: "baseline",
        margin: "md",
        contents: [
          { type: "text", text: `รวม ${state.lines.length} รายการ`, size: "xs", color: MUTED, flex: 3 },
          {
            type: "text",
            text: `฿${formatMoney(state.total)}`,
            size: "sm",
            weight: "bold",
            color: TEXT,
            align: "end",
            flex: 2,
          },
        ],
      },
    ],
  };

  const footer: Box = {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      button("แก้ไขรายการนี้", {
        type: "uri",
        uri: liffUrl(`/liff/items/${line.id}`),
      }),
      {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        contents: [
          button(
            "ลบรายการ",
            postbackAction("ลบรายการ", encodePostback({ action: "remove", itemId: line.id })),
          ),
          button(
            "ส่งอนุมัติ",
            postbackAction(
              "ส่งอนุมัติ",
              encodePostback({ action: "submit", documentId: state.documentId }),
            ),
            "primary",
          ),
        ],
      },
    ],
  };

  return flex(
    incomplete
      ? `อ่านข้อมูลได้บางส่วน — ยังขาด ${line.missing.join(", ")}`
      : `เพิ่มรายการแล้ว ฿${formatMoney(line.amount)}`,
    bubble(body, footer),
  );
}

/** The whole claim as it stands: every line, the total, and the way onward. */
export function draftCard(state: DraftState): LineMessage {
  const heading =
    state.status === "CORRECTION"
      ? `${state.docNo ?? "เอกสาร"} — ต้องแก้ไข`
      : "รายการที่กำลังรวบรวม";

  const body: Box = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      { type: "text", text: heading, weight: "bold", size: "md", color: TEXT, wrap: true },
      ...(state.decisionReason
        ? [
            {
              type: "text",
              text: `เหตุผลที่ส่งกลับ: ${state.decisionReason}`,
              size: "xs",
              color: WARNING,
              wrap: true,
            },
          ]
        : []),
      separator(),
      ...state.lines.flatMap((line, index) => [
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: `${index + 1}. ${ITEM_TYPE_LABELS[line.type]}`,
              size: "sm",
              color: TEXT,
              flex: 3,
              wrap: true,
            },
            {
              type: "text",
              text: line.missing.length > 0 ? "ยังไม่ครบ" : `฿${formatMoney(line.amount)}`,
              size: "sm",
              color: line.missing.length > 0 ? WARNING : TEXT,
              align: "end",
              flex: 2,
            },
          ],
        },
      ]),
      ...(state.lines.length === 0
        ? [{ type: "text", text: "ยังไม่มีรายการ ส่งรูปใบเสร็จเข้ามาได้เลย", size: "sm", color: MUTED, wrap: true }]
        : []),
      separator(),
      {
        type: "box",
        layout: "baseline",
        margin: "md",
        contents: [
          { type: "text", text: "รวมทั้งสิ้น", size: "sm", color: MUTED, flex: 3 },
          {
            type: "text",
            text: `฿${formatMoney(state.total)}`,
            size: "lg",
            weight: "bold",
            color: ACCENT,
            align: "end",
            flex: 2,
          },
        ],
      },
    ],
  };

  const footer: Box = {
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    contents: [
      button(
        "ยกเลิก",
        postbackAction("ยกเลิกเอกสาร", encodePostback({ action: "discard", documentId: state.documentId })),
      ),
      button(
        "ส่งอนุมัติ",
        postbackAction("ส่งอนุมัติ", encodePostback({ action: "submit", documentId: state.documentId })),
        "primary",
      ),
    ],
  };

  return flex(`รวม ${state.lines.length} รายการ ฿${formatMoney(state.total)}`, bubble(body, footer));
}

// ─── The approver's side ──────────────────────────────────────────────────

/** Pushed to the approver the moment a claim is submitted. */
export function approvalRequestCard(input: {
  documentId: string;
  docNo: string | null;
  requesterName: string;
  itemCount: number;
  total: number;
}): LineMessage {
  const body: Box = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      label("รออนุมัติ"),
      { type: "text", text: input.requesterName, weight: "bold", size: "md", color: TEXT, wrap: true },
      separator(),
      row("เลขที่", input.docNo ?? "—"),
      row("จำนวน", `${input.itemCount} รายการ`),
      row("ยอดรวม", `฿${formatMoney(input.total)}`),
    ],
  };

  const footer: Box = {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      button("ดูเอกสาร", { type: "uri", uri: liffUrl(`/liff/documents/${input.documentId}`) }),
      {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        contents: [
          button(
            "ส่งกลับแก้ไข",
            postbackAction(
              "ส่งกลับแก้ไข",
              encodePostback({ action: "decide", documentId: input.documentId, verdict: "return" }),
            ),
          ),
          button(
            "อนุมัติ",
            postbackAction(
              "อนุมัติ",
              encodePostback({ action: "decide", documentId: input.documentId, verdict: "approve" }),
            ),
            "primary",
          ),
        ],
      },
      button(
        "ไม่อนุมัติ",
        postbackAction(
          "ไม่อนุมัติ",
          encodePostback({ action: "decide", documentId: input.documentId, verdict: "reject" }),
        ),
        "link",
      ),
    ],
  };

  return flex(
    `${input.requesterName} ส่งเบิก ฿${formatMoney(input.total)}`,
    bubble(body, footer),
  );
}

/**
 * Asked before a return or a rejection goes through.
 *
 * The requester has to be told what to fix, and a free-text prompt in a chat
 * invites "ไม่ผ่าน" — so the same fixed list the web screen offers is offered
 * here, as buttons.
 */
export function reasonPicker(documentId: string, verdict: "return" | "reject"): LineMessage {
  const body: Box = {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      {
        type: "text",
        text: verdict === "return" ? "ส่งกลับให้แก้ไขเพราะ" : "ไม่อนุมัติเพราะ",
        weight: "bold",
        size: "md",
        color: TEXT,
      },
      label("ผู้จัดทำจะเห็นเหตุผลนี้"),
      {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        margin: "md",
        contents: DECISION_REASONS.map((reason) =>
          button(
            reason,
            postbackAction(reason, encodePostback({ action: "reason", documentId, verdict, reason })),
          ),
        ),
      },
    ],
  };

  return flex(verdict === "return" ? "เลือกเหตุผลที่ส่งกลับ" : "เลือกเหตุผลที่ไม่อนุมัติ", bubble(body));
}

/** The approver's monthly total, with the neighbouring months a tap away. */
export function monthSummaryCard(stats: MonthStats, offset: number): LineMessage {
  const body: Box = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      label("สรุปยอดที่อนุมัติ"),
      { type: "text", text: stats.label, weight: "bold", size: "xl", color: TEXT },
      {
        type: "text",
        text: `฿${formatMoney(stats.total)}`,
        weight: "bold",
        size: "xxl",
        color: ACCENT,
      },
      row("จำนวนเอกสาร", `${stats.count} ฉบับ`),
      row("เฉลี่ยต่อฉบับ", `฿${formatMoney(stats.average)}`),
      separator(),
      ...(stats.rows.length > 0
        ? stats.rows.slice(0, 10).map((person) => ({
            type: "box",
            layout: "horizontal",
            margin: "sm",
            contents: [
              { type: "text", text: person.name, size: "sm", color: TEXT, flex: 3, wrap: true },
              {
                type: "text",
                text: `฿${formatMoney(person.amount)}`,
                size: "sm",
                color: MUTED,
                align: "end",
                flex: 2,
              },
            ],
          }))
        : [{ type: "text", text: "ยังไม่มีเอกสารที่อนุมัติในเดือนนี้", size: "sm", color: MUTED, wrap: true, margin: "md" }]),
    ],
  };

  const footer: Box = {
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    contents: [
      button(
        "เดือนก่อน",
        postbackAction("เดือนก่อนหน้า", encodePostback({ action: "summary", offset: offset - 1 })),
      ),
      // There is nothing to show past the current month, so the button stops
      // there rather than paging into an empty future.
      ...(offset < 0
        ? [
            button(
              "เดือนถัดไป",
              postbackAction("เดือนถัดไป", encodePostback({ action: "summary", offset: offset + 1 })),
            ),
          ]
        : []),
    ],
  };

  return flex(`${stats.label} ฿${formatMoney(stats.total)}`, bubble(body, footer));
}
