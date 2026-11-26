export const pdfOverlayEslintRules = {
  "pdf-overlay-above-textlayer": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Ensure PDF highlight/area-crop overlay container sits above .textLayer (z-[3]+ instead of z-[0..2])",
      },
      schema: [],
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          const classAttr = node.attributes.find(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name?.name === "className" &&
              attr.value?.type === "Literal" &&
              typeof attr.value.value === "string"
          );
          if (!classAttr) return;
          const cls = classAttr.value.value;
          const zMatch = /\bz-\[(\d+)\]/.exec(cls);
          if (!zMatch) return;
          const zVal = Number(zMatch[1]);
          if (zVal <= 2 && cls.includes("inset-0") && cls.includes("pointer-events-none")) {
            context.report({
              node: classAttr,
              message: `PDF 叠加交互层 (${cls}) 的 z-index (${zVal}) 不能 <= .textLayer 的 z-index (2)，否则会拦截框选区与手柄的鼠标事件。请使用 z-[3] 及以上。`,
            });
          }
        },
      };
    },
  },
};

export const pdfOverlayEslintConfigs = [
  {
    files: ["electron-renderer/src/features/reader/PdfReader.tsx"],
    rules: {
      "local/pdf-overlay-above-textlayer": "error",
    },
  },
];
