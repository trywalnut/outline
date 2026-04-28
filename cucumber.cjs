/**
 * Cucumber configuration for the Arrow plugins (tags / approvals / reminders).
 *
 * Feature files live in `outline-doc/specs/` and are symlinked into `features/`
 * so the behavior contract stays decoupled from the code that satisfies it.
 */
// Force ts-node to use the BDD-suite tsconfig (commonjs) instead of the
// project's esnext tsconfig — cucumber-js step files load via require().
process.env.TS_NODE_PROJECT = require("path").resolve(__dirname, "features/tsconfig.json");
process.env.TS_NODE_TRANSPILE_ONLY = "false";

module.exports = {
  default: {
    requireModule: ["ts-node/register"],
    require: ["features/step_definitions/**/*.ts", "features/support/**/*.ts"],
    paths: ["features/**/*.feature"],
    format: ["progress-bar", "summary"],
    formatOptions: { snippetInterface: "async-await" },
    publishQuiet: true,
    parallel: 1,
    timeout: 60000,
    strict: false, // start lenient; flip to true once all scenarios pass
  },
};
