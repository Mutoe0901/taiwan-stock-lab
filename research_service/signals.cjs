// Uses the exact A/B signal code shipped in the app. No separate strategy port.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {module: {exports: {}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/ab-strategies.js'), 'utf8'), context);
const AB = context.module.exports;
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const x = AB.compute(input.bars);
const options = {...input.options, dailyBars: input.dailyBars || []};
process.stdout.write(JSON.stringify(x.bars.map((bar, i) => ({
  long: AB.signalAt(x, i, 1, input.strategy, options).pass,
  short: AB.signalAt(x, i, -1, input.strategy, options).pass,
  exitLong: AB.exitAt(x, i, 1), exitShort: AB.exitAt(x, i, -1)
}))));
