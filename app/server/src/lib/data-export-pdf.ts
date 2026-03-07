import PDFDocument from "pdfkit";
import { createRequire } from "node:module";

import {
  aggregateNotesByCategory,
  formatDateJapanese,
  formatDateJapaneseShort,
  getCategoryLabel,
  getImportantStatementText,
  parseKeyPoints,
  parseNoteEntries,
  parseTranscript,
  sanitizeImportantStatements,
} from "./data-export-formatters.js";
import { buildFlexibleNoteItems } from "./flexible-notes.js";

import type {
  CategoryNoteData,
  ConversationRow,
  NoteEntryWithSource,
} from "./data-export-formatters.js";
import type { FlexibleNoteItem, InsightCategory } from "./flexible-notes.js";

// --- Font resolution ---

interface FontSet {
  regular: string;
  bold: string;
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

// --- Design tokens (matching app.css @theme) ---

const PDF_COLORS = {
  textPrimary: "#3d3532",
  textSecondary: "#8c8279",
  accentPrimary: "#e8935a",
  accentPrimaryLight: "#f5d4b8",
  accentSecondary: "#7ba68c",
  accentSecondaryLight: "#d1e5d8",
  success: "#7ba68c",
  warningLight: "#f5d4b8",
  borderLight: "#e8e0d6",
  bgSurface: "#fbf7f0",
  white: "#ffffff",
} as const;

const PDF_FONTS = {
  titleSize: 22,
  subtitleSize: 15,
  sectionHeadingSize: 15,
  bodySize: 13,
  smallSize: 11,
  lineGap: 4,
} as const;

const PDF_LAYOUT = {
  pageMargin: 48,
  sectionGap: 20,
  itemGap: 10,
  leftBorderWidth: 2,
  leftBorderIndent: 10,
  badgePaddingX: 8,
  badgePaddingY: 3,
  badgeRadius: 8,
  badgeGap: 6,
} as const;

const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  hobbies: "趣味・好み",
  values: "価値観",
  relationships: "人間関係",
  memories: "思い出",
  concerns: "気がかり",
  other: "その他",
};

const INSIGHT_CATEGORY_ORDER: readonly InsightCategory[] = [
  "hobbies",
  "values",
  "relationships",
  "memories",
  "concerns",
  "other",
];

const FOOTER_MAIN = "おはなしエンディングノートで作成";
const FOOTER_DISCLAIMER =
  "この文書は記録として保管用です。法的効力はありません。";
const TRANSCRIPT_DISCLAIMER =
  "音声から自動で文字に起こしたものです。実際の会話と異なる場合がありますので、正確な内容は録音データでご確認ください。";

// --- PDF document helpers ---

function createPdfDocument(): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    margin: PDF_LAYOUT.pageMargin,
    bufferPages: true,
    info: {
      Producer: "ohanashi-ending-note",
    },
  });
  return doc;
}

function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const pageNum = i + 1;
    const pageText = `${pageNum} / ${totalPages}`;
    // lineBreak: false prevents PDFKit from auto-paginating when drawing
    // below the bottom margin, which would create unwanted blank pages
    doc
      .font("jp-regular")
      .fontSize(9)
      .fillColor(PDF_COLORS.textSecondary)
      .text(pageText, 0, doc.page.height - doc.page.margins.bottom + 16, {
        width: doc.page.width,
        align: "center",
        lineBreak: false,
      });
  }
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

function getContentWidth(doc: PDFKit.PDFDocument): number {
  const page = doc.page;
  return page.width - page.margins.left - page.margins.right;
}

function getLeftMargin(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.left;
}

// --- Layout primitives ---

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const pageTop = doc.page.margins.top;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const remaining = pageBottom - doc.y;

  if (remaining < needed) {
    // If doc.y is past the page bottom (e.g. from moveDown), reset to trigger
    // a new page. But if we're still near the top of the current page, don't
    // create a new blank page — just stay here.
    if (doc.y <= pageTop + needed) {
      // Already near top of page; content should fit from here
      return;
    }
    doc.addPage();
  }
}

function drawCenteredTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  options?: {
    subtitle?: string;
    userName?: string;
    date?: string;
    progress?: string;
  },
): void {
  doc
    .font("jp-bold")
    .fontSize(PDF_FONTS.titleSize)
    .fillColor(PDF_COLORS.textPrimary)
    .text(title, { align: "center" });

  if (options?.subtitle !== undefined) {
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.subtitleSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(options.subtitle, { align: "center" });
    doc.moveDown(0.3);
  }

  if (options?.userName !== undefined && options.userName !== "") {
    doc.moveDown(0.5);
    doc
      .font("jp-bold")
      .fontSize(PDF_FONTS.subtitleSize)
      .fillColor(PDF_COLORS.textPrimary)
      .text(options.userName, { align: "center" });
  }

  if (options?.date !== undefined) {
    doc.moveDown(0.3);
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.smallSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(`作成日: ${options.date}`, { align: "center" });
  }

  if (options?.progress !== undefined) {
    doc.moveDown(0.2);
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.smallSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(options.progress, { align: "center" });
  }

  doc.moveDown(1.5);
}

function drawSectionHeading(
  doc: PDFKit.PDFDocument,
  text: string,
  rightText?: string,
): void {
  ensureSpace(doc, 40);

  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);

  doc
    .font("jp-bold")
    .fontSize(PDF_FONTS.sectionHeadingSize)
    .fillColor(PDF_COLORS.textPrimary);

  const headingY = doc.y;

  let headingEndY: number;

  if (rightText !== undefined) {
    // Measure right text width
    doc.font("jp-regular").fontSize(PDF_FONTS.smallSize);
    const rightWidth = doc.widthOfString(rightText);

    // Draw heading text
    doc
      .font("jp-bold")
      .fontSize(PDF_FONTS.sectionHeadingSize)
      .fillColor(PDF_COLORS.textPrimary)
      .text(text, left, headingY, { width: contentWidth - rightWidth - 10 });

    headingEndY = doc.y;

    // Draw right text on same baseline
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.smallSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(rightText, left + contentWidth - rightWidth, headingY + 2, {
        width: rightWidth,
        align: "right",
      });
  } else {
    doc.text(text, left, headingY, { width: contentWidth });
    headingEndY = doc.y;
  }

  // Draw underline
  const lineY = headingEndY + 3;
  doc
    .moveTo(left, lineY)
    .lineTo(left + contentWidth, lineY)
    .strokeColor(PDF_COLORS.borderLight)
    .lineWidth(1.5)
    .stroke();

  doc.y = lineY + 8;
}

function drawCategoryBadges(
  doc: PDFKit.PDFDocument,
  categories: string[],
): void {
  if (categories.length === 0) return;

  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);

  // Measure text widths with correct font state
  doc.font("jp-regular").fontSize(PDF_FONTS.bodySize);
  const actualLineHeight = doc.currentLineHeight();
  const badgePadX = PDF_LAYOUT.badgePaddingX + 2;
  const badgePadY = PDF_LAYOUT.badgePaddingY + 2;
  const badgeHeight = actualLineHeight + badgePadY * 2;

  // Buffer for CJK font measurement inaccuracy
  const cjkBuffer = 4;

  ensureSpace(doc, badgeHeight + 8);

  let cursorX = left;
  let cursorY = doc.y;

  for (const catId of categories) {
    doc.font("jp-regular").fontSize(PDF_FONTS.bodySize);
    const label = getCategoryLabel(catId);
    const textWidth = doc.widthOfString(label);
    const badgeWidth = textWidth + badgePadX * 2 + cjkBuffer;

    // Wrap to next line if needed
    if (cursorX + badgeWidth > left + contentWidth && cursorX > left) {
      cursorX = left;
      cursorY += badgeHeight + PDF_LAYOUT.badgeGap;
      ensureSpace(doc, badgeHeight + PDF_LAYOUT.badgeGap);
    }

    // Draw badge background
    doc
      .save()
      .roundedRect(
        cursorX,
        cursorY,
        badgeWidth,
        badgeHeight,
        PDF_LAYOUT.badgeRadius,
      )
      .fill(PDF_COLORS.accentPrimaryLight);
    doc.restore();

    // Draw badge text (re-set font after fill)
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.bodySize)
      .fillColor(PDF_COLORS.textPrimary)
      .text(label, cursorX + badgePadX, cursorY + badgePadY, {
        width: textWidth + cjkBuffer,
        lineBreak: false,
      });

    cursorX += badgeWidth + PDF_LAYOUT.badgeGap;
  }

  doc.y = cursorY + badgeHeight + PDF_LAYOUT.itemGap;
}

function drawBulletList(
  doc: PDFKit.PDFDocument,
  items: string[],
  marker: string,
  markerColor: string,
): void {
  if (items.length === 0) return;

  const left = getLeftMargin(doc);
  const indent = 24;
  const contentWidth = getContentWidth(doc) - indent;

  for (const item of items) {
    const textHeight = doc.heightOfString(item, {
      width: contentWidth,
      lineGap: PDF_FONTS.lineGap,
    });
    ensureSpace(doc, textHeight + 8);

    const markerY = doc.y;

    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.bodySize)
      .fillColor(markerColor)
      .text(marker, left + 2, markerY, { continued: false, lineBreak: false });

    doc.fillColor(PDF_COLORS.textPrimary).text(item, left + indent, markerY, {
      width: contentWidth,
      lineGap: PDF_FONTS.lineGap,
    });

    doc.y += 6;
  }
}

function drawQAEntry(
  doc: PDFKit.PDFDocument,
  question: string,
  answer: string,
  borderColor?: string,
): void {
  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);
  const color = borderColor ?? PDF_COLORS.accentPrimary;
  const indent = PDF_LAYOUT.leftBorderIndent;

  // Question
  const qHeight = doc.heightOfString(question, {
    width: contentWidth,
    lineGap: PDF_FONTS.lineGap,
  });
  const aHeight = doc.heightOfString(answer, {
    width: contentWidth - indent,
    lineGap: PDF_FONTS.lineGap,
  });
  ensureSpace(doc, qHeight + aHeight + 16);

  doc
    .font("jp-regular")
    .fontSize(PDF_FONTS.bodySize)
    .fillColor(PDF_COLORS.textSecondary)
    .text(question, left, doc.y, {
      width: contentWidth,
      lineGap: PDF_FONTS.lineGap,
    });

  doc.y += 4;

  // Answer with left border
  const answerY = doc.y;
  doc
    .font("jp-regular")
    .fontSize(PDF_FONTS.bodySize)
    .fillColor(PDF_COLORS.textPrimary)
    .text(answer, left + indent, answerY, {
      width: contentWidth - indent,
      lineGap: PDF_FONTS.lineGap,
    });

  const answerEndY = doc.y;

  // Draw left border line
  doc
    .save()
    .moveTo(left + indent - 4, answerY - 1)
    .lineTo(left + indent - 4, answerEndY + 1)
    .strokeColor(color)
    .lineWidth(PDF_LAYOUT.leftBorderWidth)
    .opacity(0.7)
    .stroke()
    .restore();

  doc.y = answerEndY + 8;
}

function drawInfoBox(doc: PDFKit.PDFDocument, text: string): void {
  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);
  const boxPadding = 10;

  doc.font("jp-regular").fontSize(PDF_FONTS.bodySize);
  const textHeight = doc.heightOfString(text, {
    width: contentWidth - boxPadding * 2,
    lineGap: PDF_FONTS.lineGap,
  });
  const boxHeight = textHeight + boxPadding * 2;

  ensureSpace(doc, boxHeight + 8);

  const boxY = doc.y;

  doc
    .save()
    .roundedRect(left, boxY, contentWidth, boxHeight, 8)
    .fill(PDF_COLORS.accentSecondaryLight);
  doc.restore();

  doc
    .font("jp-regular")
    .fontSize(PDF_FONTS.bodySize)
    .fillColor(PDF_COLORS.textPrimary)
    .text(text, left + boxPadding, boxY + boxPadding, {
      width: contentWidth - boxPadding * 2,
      lineGap: PDF_FONTS.lineGap,
    });

  doc.y = boxY + boxHeight + 8;
}

function drawDisclaimerBox(doc: PDFKit.PDFDocument, text: string): void {
  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);
  const boxPadding = 8;

  doc.font("jp-regular").fontSize(PDF_FONTS.smallSize);
  const textHeight = doc.heightOfString(text, {
    width: contentWidth - boxPadding * 2,
    lineGap: PDF_FONTS.lineGap,
  });
  const boxHeight = textHeight + boxPadding * 2;

  ensureSpace(doc, boxHeight + 8);

  const boxY = doc.y;

  doc
    .save()
    .roundedRect(left, boxY, contentWidth, boxHeight, 6)
    .fill(PDF_COLORS.bgSurface);
  doc.restore();

  doc
    .font("jp-regular")
    .fontSize(PDF_FONTS.smallSize)
    .fillColor(PDF_COLORS.textSecondary)
    .text(text, left + boxPadding, boxY + boxPadding, {
      width: contentWidth - boxPadding * 2,
      lineGap: PDF_FONTS.lineGap,
    });

  doc.y = boxY + boxHeight + 8;
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  // Footer needs: sectionGap(20) + border(1) + gap(12) + text(~11) + gap(~5) + text(~11) ≈ 60pt
  // ensureSpace accounts for the full height including the gap
  const footerHeight = PDF_LAYOUT.sectionGap + 40;
  ensureSpace(doc, footerHeight);

  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);

  doc.y += PDF_LAYOUT.sectionGap;

  // Top border
  doc
    .moveTo(left, doc.y)
    .lineTo(left + contentWidth, doc.y)
    .strokeColor(PDF_COLORS.borderLight)
    .lineWidth(1)
    .stroke();

  doc.y += 12;

  doc
    .font("jp-regular")
    .fontSize(PDF_FONTS.smallSize)
    .fillColor(PDF_COLORS.textSecondary)
    .text(FOOTER_MAIN, { align: "center" });

  doc.moveDown(0.3);

  doc.text(FOOTER_DISCLAIMER, { align: "center" });
}

// --- Ending Note PDF section renderers ---

function drawCategorySection(
  doc: PDFKit.PDFDocument,
  cat: CategoryNoteData,
): void {
  if (cat.noteEntries.length === 0 && cat.unansweredQuestions.length === 0) {
    return;
  }

  drawSectionHeading(
    doc,
    cat.label,
    `${cat.answeredCount}/${cat.totalQuestions} 項目`,
  );

  for (const entry of cat.noteEntries) {
    drawNoteEntryWithSource(doc, entry);
  }

  // Unanswered questions
  if (cat.unansweredQuestions.length > 0) {
    ensureSpace(doc, 30);

    doc.y += 10;

    // Light separator
    const left = getLeftMargin(doc);
    const contentWidth = getContentWidth(doc);
    doc
      .moveTo(left + 8, doc.y)
      .lineTo(left + contentWidth - 8, doc.y)
      .strokeColor(PDF_COLORS.borderLight)
      .lineWidth(1)
      .stroke();
    doc.y += 12;

    doc
      .font("jp-bold")
      .fontSize(PDF_FONTS.sectionHeadingSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text("未記入の項目", left + 8);

    doc.moveDown(0.5);

    for (const q of cat.unansweredQuestions) {
      ensureSpace(doc, 24);

      const checkboxY = doc.y;
      const checkboxSize = 11;
      const checkboxX = left + 14;
      const textIndent = checkboxX + checkboxSize + 8;

      // Draw a visible checkbox rectangle
      doc
        .save()
        .rect(checkboxX, checkboxY + 1, checkboxSize, checkboxSize)
        .strokeColor(PDF_COLORS.textSecondary)
        .lineWidth(1.2)
        .stroke()
        .restore();

      doc
        .font("jp-regular")
        .fontSize(PDF_FONTS.bodySize)
        .fillColor(PDF_COLORS.textSecondary)
        .text(q.title, textIndent, checkboxY, {
          width: contentWidth - (textIndent - left) - 8,
        });

      doc.y += 6;
    }
  }

  // Disclaimer
  if (cat.disclaimer !== undefined) {
    doc.moveDown(0.3);
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.smallSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(cat.disclaimer, getLeftMargin(doc) + 8, doc.y, {
        width: getContentWidth(doc) - 16,
        lineGap: PDF_FONTS.lineGap,
      });
  }

  // Add gap between categories, but cap it to avoid pushing past page bottom
  // which could cause a near-blank page when followed by empty sections
  const gapSize = PDF_LAYOUT.sectionGap;
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining > gapSize) {
    doc.y += gapSize;
  }
}

function drawNoteEntryWithSource(
  doc: PDFKit.PDFDocument,
  entry: NoteEntryWithSource,
): void {
  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);
  const indent = PDF_LAYOUT.leftBorderIndent + 8;

  if (entry.questionType === "accumulative" && entry.allEntries.length > 0) {
    // Accumulative: show question with count + all entries
    const countLabel = `（${entry.allEntries.length}件）`;
    ensureSpace(doc, 30);

    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.bodySize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(`${entry.questionTitle}  ${countLabel}`, left + 8, doc.y, {
        width: contentWidth - 16,
      });

    doc.y += 4;

    for (const item of entry.allEntries) {
      const answerHeight = doc.heightOfString(item.answer, {
        width: contentWidth - indent - 16,
        lineGap: PDF_FONTS.lineGap,
      });
      ensureSpace(doc, answerHeight + 20);

      const answerY = doc.y;

      doc
        .font("jp-regular")
        .fontSize(PDF_FONTS.bodySize)
        .fillColor(PDF_COLORS.textPrimary)
        .text(item.answer, left + indent, answerY, {
          width: contentWidth - indent - 16,
          lineGap: PDF_FONTS.lineGap,
        });

      const dateStr = formatDateJapaneseShort(item.recordedAt);
      doc
        .font("jp-regular")
        .fontSize(PDF_FONTS.smallSize)
        .fillColor(PDF_COLORS.textSecondary)
        .text(dateStr, left + indent, doc.y, {
          width: contentWidth - indent - 16,
        });

      // Left border
      doc
        .save()
        .moveTo(left + indent - 6, answerY - 1)
        .lineTo(left + indent - 6, doc.y + 2)
        .strokeColor(PDF_COLORS.accentSecondary)
        .lineWidth(PDF_LAYOUT.leftBorderWidth)
        .opacity(0.7)
        .stroke()
        .restore();

      doc.y += 6;
    }
  } else {
    // Single: show Q&A with optional version history
    drawQAEntry(
      doc,
      entry.questionTitle,
      entry.answer,
      PDF_COLORS.accentPrimary,
    );

    if (entry.hasHistory && entry.previousVersions.length > 0) {
      ensureSpace(doc, 30);

      doc
        .font("jp-bold")
        .fontSize(PDF_FONTS.smallSize)
        .fillColor(PDF_COLORS.textSecondary)
        .text(
          `更新履歴（${entry.previousVersions.length}回）`,
          left + indent + 8,
          doc.y,
          { width: contentWidth - indent - 24 },
        );

      doc.y += 2;

      const reversedVersions = [...entry.previousVersions].reverse();
      for (const version of reversedVersions) {
        const vHeight = doc.heightOfString(version.answer, {
          width: contentWidth - indent - 24,
          lineGap: PDF_FONTS.lineGap,
        });
        ensureSpace(doc, vHeight + 18);

        const vY = doc.y;
        const dateStr = formatDateJapaneseShort(version.recordedAt);

        doc
          .font("jp-regular")
          .fontSize(PDF_FONTS.smallSize)
          .fillColor(PDF_COLORS.textSecondary)
          .text(dateStr, left + indent + 12, vY, {
            width: contentWidth - indent - 28,
          });

        doc
          .fillColor(PDF_COLORS.textSecondary)
          .text(version.answer, left + indent + 12, doc.y, {
            width: contentWidth - indent - 28,
            lineGap: PDF_FONTS.lineGap,
          });

        // Warning-colored left border for history
        doc
          .save()
          .moveTo(left + indent + 6, vY - 1)
          .lineTo(left + indent + 6, doc.y + 1)
          .strokeColor(PDF_COLORS.accentPrimary)
          .lineWidth(PDF_LAYOUT.leftBorderWidth)
          .opacity(0.5)
          .stroke()
          .restore();

        doc.y += 4;
      }
    }
  }

  doc.y += 2;
}

function drawInsightsSection(
  doc: PDFKit.PDFDocument,
  items: FlexibleNoteItem[],
): void {
  if (items.length === 0) return;

  drawSectionHeading(doc, "会話から見えたこと");

  doc
    .font("jp-regular")
    .fontSize(PDF_FONTS.smallSize)
    .fillColor(PDF_COLORS.textSecondary)
    .text(
      "質問項目に直接当てはまらない、好きなことや思い出、人となりのメモ",
      getLeftMargin(doc),
      doc.y,
      { width: getContentWidth(doc) },
    );

  doc.moveDown(0.5);

  // Group by category
  const map = new Map<InsightCategory, FlexibleNoteItem[]>();
  for (const item of items) {
    const existing = map.get(item.category);
    if (existing !== undefined) {
      existing.push(item);
    } else {
      map.set(item.category, [item]);
    }
  }

  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);
  const indent = PDF_LAYOUT.leftBorderIndent;

  for (const category of INSIGHT_CATEGORY_ORDER) {
    const categoryItems = map.get(category);
    if (categoryItems === undefined || categoryItems.length === 0) continue;

    ensureSpace(doc, 30);

    doc
      .font("jp-bold")
      .fontSize(PDF_FONTS.smallSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(INSIGHT_CATEGORY_LABELS[category], left + 4, doc.y, {
        width: contentWidth - 8,
      });

    doc.moveDown(0.3);

    for (const item of categoryItems) {
      doc.font("jp-regular").fontSize(PDF_FONTS.bodySize);
      const textHeight = doc.heightOfString(item.text, {
        width: contentWidth - indent - 8,
        lineGap: PDF_FONTS.lineGap,
      });
      ensureSpace(doc, textHeight + 22);

      const itemY = doc.y;

      doc
        .font("jp-regular")
        .fontSize(PDF_FONTS.bodySize)
        .fillColor(PDF_COLORS.textPrimary)
        .text(item.text, left + indent, itemY, {
          width: contentWidth - indent - 8,
          lineGap: PDF_FONTS.lineGap,
        });

      const dateStr = formatDateJapaneseShort(new Date(item.recordedAt));
      const mentionSuffix =
        item.mentionCount > 1 ? ` ・ ${item.mentionCount}回出てきた話題` : "";

      doc
        .fillColor(PDF_COLORS.textSecondary)
        .fontSize(PDF_FONTS.smallSize)
        .text(`${dateStr}の会話${mentionSuffix}`, left + indent, doc.y, {
          width: contentWidth - indent - 8,
        });

      // Left border
      doc
        .save()
        .moveTo(left + 4, itemY - 1)
        .lineTo(left + 4, doc.y + 1)
        .strokeColor(PDF_COLORS.accentSecondary)
        .lineWidth(PDF_LAYOUT.leftBorderWidth)
        .opacity(0.6)
        .stroke()
        .restore();

      doc.y += 6;
    }

    doc.y += 4;
  }
}

// --- Public API ---

export async function buildEndingNotePdf(
  rows: ConversationRow[],
  userName: string,
): Promise<Buffer> {
  const doc = createPdfDocument();
  applyFonts(doc);

  const categories = aggregateNotesByCategory(rows);
  const totalAnswered = categories.reduce(
    (sum, cat) => sum + cat.answeredCount,
    0,
  );
  const totalQuestions = categories.reduce(
    (sum, cat) => sum + cat.totalQuestions,
    0,
  );

  // Build flexible notes from conversation data
  const flexibleNotes = buildFlexibleNoteItems(
    rows.map((row) => ({
      conversationId: row.id,
      startedAt: row.startedAt.getTime(),
      importantStatements: sanitizeImportantStatements(
        parseKeyPoints(row.keyPoints)?.importantStatements,
      ),
      noteEntries: parseNoteEntries(row.noteEntries),
    })),
  );

  // Title
  drawCenteredTitle(doc, "わたしのエンディングノート", {
    subtitle: "大切な想いの記録",
    userName,
    date: formatDateJapaneseShort(new Date()),
    progress:
      totalAnswered > 0
        ? `${totalQuestions}項目中 ${totalAnswered}項目を記録しました`
        : undefined,
  });

  // Category sections
  for (const cat of categories) {
    drawCategorySection(doc, cat);
  }

  // Insights section
  drawInsightsSection(doc, flexibleNotes);

  // Footer
  drawFooter(doc);

  addPageNumbers(doc);
  return finalizePdf(doc);
}

interface ConversationPdfOptions {
  hasAudio: boolean;
  audioFileName: string | null;
}

export async function buildConversationPdf(
  row: ConversationRow,
  options: ConversationPdfOptions,
): Promise<Buffer> {
  const doc = createPdfDocument();
  applyFonts(doc);

  const left = getLeftMargin(doc);
  const contentWidth = getContentWidth(doc);

  // Title
  drawCenteredTitle(doc, "会話の記録", {
    date: formatDateJapanese(row.startedAt),
  });

  // Discussed category tags
  if (row.discussedCategories !== null && row.discussedCategories.length > 0) {
    drawSectionHeading(doc, "話したテーマ");
    drawCategoryBadges(doc, row.discussedCategories);
    doc.moveDown(0.5);
  }

  // Key points
  const keyPoints = parseKeyPoints(row.keyPoints);
  if (keyPoints !== null) {
    if (keyPoints.importantStatements.length > 0) {
      drawSectionHeading(doc, "重要な発言");
      drawBulletList(
        doc,
        keyPoints.importantStatements.map(getImportantStatementText),
        "●",
        PDF_COLORS.textPrimary,
      );
      doc.moveDown(0.5);
    }

    if (keyPoints.decisions.length > 0) {
      drawSectionHeading(doc, "決定事項");
      drawBulletList(doc, keyPoints.decisions, "✓", PDF_COLORS.success);
      doc.moveDown(0.5);
    }

    if (keyPoints.undecidedItems.length > 0) {
      drawSectionHeading(doc, "まだ未確定の事項");
      drawBulletList(
        doc,
        keyPoints.undecidedItems,
        "○",
        PDF_COLORS.textSecondary,
      );
      doc.moveDown(0.5);
    }
  }

  // Fallback summary
  if (keyPoints === null && row.summary !== null) {
    drawSectionHeading(doc, "会話のまとめ");
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.bodySize)
      .fillColor(PDF_COLORS.textPrimary)
      .text(row.summary, left + 8, doc.y, {
        width: contentWidth - 16,
        lineGap: PDF_FONTS.lineGap,
      });
    doc.moveDown(1);
  }

  // Placeholder when no summary available
  if (keyPoints === null && row.summary === null) {
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.bodySize)
      .fillColor(PDF_COLORS.textSecondary)
      .text("この会話のまとめはまだ作成されていません。", left + 8, doc.y, {
        width: contentWidth - 16,
      });
    doc.moveDown(1);
  }

  // Conversation contribution count
  const coveredCount = row.coveredQuestionIds?.length ?? 0;
  if (coveredCount > 0) {
    drawInfoBox(doc, `この会話で ${coveredCount}項目 に回答しました`);
    doc.moveDown(0.5);
  }

  // Recorded note entries
  const noteEntries = parseNoteEntries(row.noteEntries);
  if (noteEntries.length > 0) {
    drawSectionHeading(doc, "この会話で記録された内容");
    for (const entry of noteEntries) {
      drawQAEntry(doc, entry.questionTitle, entry.answer);
    }
    doc.moveDown(0.5);
  }

  // Audio file reference
  if (options.hasAudio && options.audioFileName !== null) {
    ensureSpace(doc, 30);
    doc
      .font("jp-regular")
      .fontSize(PDF_FONTS.smallSize)
      .fillColor(PDF_COLORS.textSecondary)
      .text(
        `この会話の録音が同じフォルダに保存されています（${options.audioFileName}）`,
        left + 8,
        doc.y,
        { width: contentWidth - 16 },
      );
    doc.moveDown(1);
  }

  // Transcript
  const transcript = parseTranscript(row.transcript);
  if (transcript.length > 0) {
    drawSectionHeading(doc, "会話のやり取り");
    drawDisclaimerBox(doc, TRANSCRIPT_DISCLAIMER);
    doc.moveDown(0.3);

    for (const entry of transcript) {
      const speaker = entry.role === "user" ? "わたし" : "話し相手";
      const textHeight = doc.heightOfString(entry.text, {
        width: contentWidth - 24,
        lineGap: PDF_FONTS.lineGap,
      });
      ensureSpace(doc, textHeight + 24);

      doc
        .font("jp-bold")
        .fontSize(PDF_FONTS.smallSize)
        .fillColor(
          entry.role === "user"
            ? PDF_COLORS.textPrimary
            : PDF_COLORS.accentSecondary,
        )
        .text(`${speaker}:`, left + 12, doc.y, { width: contentWidth - 24 });

      doc.y += 2;

      doc
        .font("jp-regular")
        .fontSize(PDF_FONTS.smallSize)
        .fillColor(PDF_COLORS.textPrimary)
        .text(entry.text, left + 12, doc.y, {
          width: contentWidth - 24,
          lineGap: PDF_FONTS.lineGap,
        });

      doc.y += 8;
    }
  }

  // Footer
  drawFooter(doc);

  addPageNumbers(doc);
  return finalizePdf(doc);
}
