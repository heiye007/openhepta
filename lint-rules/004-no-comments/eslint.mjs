export const noCommentsEslintRules = {
  "no-comments": {
    meta: {
      type: "problem",
      docs: {
        description: "Disallow all comments in code",
      },
      schema: [],
    },
    create(context) {
      return {
        Program() {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const comments = sourceCode.getAllComments();
          for (const comment of comments) {
            context.report({
              loc: comment.loc,
              message: "禁止在代码中包含任何注释 (no comments in code)。",
            });
          }
        },
      };
    },
  },
};

export const noCommentsEslintConfigs = [
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "local/no-comments": "error",
    },
  },
];
