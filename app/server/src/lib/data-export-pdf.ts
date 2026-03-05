import PDFDocument from "pdfkit";
import { createRequire } from "node:module";

import {
  buildConversationSummaryText,
  buildEndingNoteText,
  formatDate,
  formatTranscript,
  getCategoryLabel,
  parseTranscript,
} from "./data-export-formatters.js";

import type { ConversationRow } from "./data-export-formatters.js";

interface FontSet {
  regular: string;
  bold: string;
}

interface ConversationPdfOptions {
  conversationIndex: number;
  audioFileName: string | null;
}

const require = createRequire(import.meta.url);

function resolveJapaneseFonts(): FontSet | null {
  try {
    return {
      regular:
        require.resolve("@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff"),
      bold: require.resolve("@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-700-normal.woff"),
    };
  } catch {
    return null;
  }
}

function createPdfDocument(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Producer: "ohanashi-ending-note",
    },
  });
}

function writeTitle(doc: PDFKit.PDFDocument, text: string): void {
  doc.font("jp-bold").fontSize(20).text(text, { align: "center" });
  doc.moveDown(0.5);
}

function writeBodyText(doc: PDFKit.PDFDocument, text: string): void {
  doc.font("jp-regular").fontSize(11).text(text, {
    lineGap: 3,
  });
}

async function finalizePdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
    doc.end();
  });
}

function applyFonts(doc: PDFKit.PDFDocument): void {
  const fonts = resolveJapaneseFonts();
  if (fonts === null) {
    doc.registerFont("jp-regular", "Helvetica");
    doc.registerFont("jp-bold", "Helvetica-Bold");
    return;
  }

  doc.registerFont("jp-regular", fonts.regular);
  doc.registerFont("jp-bold", fonts.bold);
}

function buildConversationPdfText(
  row: ConversationRow,
  options: ConversationPdfOptions,
): string {
  const lines: string[] = [];

  lines.push(`会話番号: ${options.conversationIndex}`);
  lines.push(`会話ID: ${row.id}`);
  lines.push(`カテゴリ: ${getCategoryLabel(row.category)}`);
  lines.push(`開始日時: ${formatDate(row.startedAt)}`);
  lines.push(
    `録音ファイル: ${options.audioFileName ?? "なし（録音データはありません）"}`,
  );
  lines.push("");
  lines.push("■ 会話の要約");
  lines.push(buildConversationSummaryText(row));
  lines.push("");
  lines.push("■ 会話の書き起こし");
  lines.push(formatTranscript(parseTranscript(row.transcript)));

  return lines.join("\n");
}

export async function buildEndingNotePdf(
  rows: ConversationRow[],
  userName: string,
): Promise<Buffer> {
  const doc = createPdfDocument();
  applyFonts(doc);

  writeTitle(doc, "わたしのエンディングノート");
  doc
    .font("jp-regular")
    .fontSize(11)
    .text(`作成日: ${formatDate(new Date())}`, {
      align: "center",
    });
  if (userName !== "") {
    doc.text(`作成者: ${userName}`, { align: "center" });
  }
  doc.moveDown(1);

  writeBodyText(doc, buildEndingNoteText(rows, userName));
  return finalizePdf(doc);
}

export async function buildConversationPdf(
  row: ConversationRow,
  options: ConversationPdfOptions,
): Promise<Buffer> {
  const doc = createPdfDocument();
  applyFonts(doc);

  writeTitle(doc, "会話記録");
  writeBodyText(doc, buildConversationPdfText(row, options));

  return finalizePdf(doc);
}
