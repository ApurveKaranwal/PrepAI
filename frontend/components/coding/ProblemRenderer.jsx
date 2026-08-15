"use client";

import React from "react";

/**
 * Renders problem descriptions with clean typography, code chips,
 * formatted constraints, and mathematical notation (matching Sarvam.ai aesthetic).
 */
export default function ProblemRenderer({ content }) {
  if (!content) return null;

  const formatInline = (text) => {
    if (!text) return "";

    // 1. Process math notation: **$O(1)$** or $O(1)$ or $N=10^5$
    let processed = text.replace(/\*\*\$([^\$]+)\$\*\*/g, '___MATH_BOLD_$1___');
    processed = processed.replace(/\$([^\$]+)\$/g, '___MATH_$1___');

    // 2. Process bold: **text**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '___BOLD_$1___');

    // 3. Process inline code: `code`
    processed = processed.replace(/`([^`]+)`/g, '___CODE_$1___');

    // Tokenize and render React elements
    const tokens = processed.split(/(___[A-Z_]+_[^_]+___)/g);

    return tokens.map((token, idx) => {
      if (token.startsWith("___MATH_BOLD_")) {
        const val = token.replace("___MATH_BOLD_", "").replace("___", "");
        return (
          <span key={idx} className="font-mono font-bold text-[#C85A32] bg-[#FAF6F0] px-1.5 py-0.5 rounded border border-[#DFD5C6] text-[11px]">
            {val}
          </span>
        );
      }
      if (token.startsWith("___MATH_")) {
        const val = token.replace("___MATH_", "").replace("___", "");
        return (
          <span key={idx} className="font-mono text-[#C85A32] font-semibold text-[11px]">
            {val}
          </span>
        );
      }
      if (token.startsWith("___BOLD_")) {
        const val = token.replace("___BOLD_", "").replace("___", "");
        return (
          <strong key={idx} className="font-bold text-[#1F2937]">
            {val}
          </strong>
        );
      }
      if (token.startsWith("___CODE_")) {
        const val = token.replace("___CODE_", "").replace("___", "");
        return (
          <code key={idx} className="font-mono text-[11px] bg-[#FAF6F0] text-[#C85A32] border border-[#DFD5C6] px-1.5 py-0.5 rounded-md font-semibold">
            {val}
          </code>
        );
      }
      return token;
    });
  };

  // Robust line-by-line AST parser
  const lines = content.split("\n");
  const elements = [];
  let currentList = [];
  let currentParagraph = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(" ").trim();
      if (text) {
        elements.push({ type: "p", content: text });
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push({ type: "ul", items: [...currentList] });
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("###") || line.startsWith("##") || line.startsWith("#")) {
      flushParagraph();
      flushList();
      const headerText = line.replace(/^#+\s*/, "");
      elements.push({ type: "h", content: headerText });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      currentList.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }

    // Regular line in paragraph
    flushList();
    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();

  return (
    <div className="space-y-3.5 text-xs text-[#262626] leading-relaxed font-sans select-text">
      {elements.map((el, idx) => {
        if (el.type === "h") {
          return (
            <div key={idx} className="pt-2">
              <h4 className="text-[11px] font-bold font-mono uppercase tracking-wider text-[#6E6359] border-b border-[#DFD5C6]/60 pb-1 mb-2">
                {el.content}
              </h4>
            </div>
          );
        }

        if (el.type === "ul") {
          return (
            <ul key={idx} className="space-y-2 bg-[#FAF6F0] p-3.5 rounded-xl border border-[#DFD5C6]">
              {el.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2.5 text-xs text-[#374151] leading-relaxed">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C85A32] shrink-0 mt-1.5" />
                  <span className="flex-1">{formatInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="leading-relaxed text-[#374151] text-xs">
            {formatInline(el.content)}
          </p>
        );
      })}
    </div>
  );
}
