var linearscan = require('../');
var pipeline = require('json-pipeline');

var assertText = require('assert-text');
assertText.options.trim = true;

exports.options = {
  registers: [ 'rax', 'rbx', 'rcx', 'rdx' ],
  opcodes: {
    literal: {
      output: 'any'
    },
    if: {},
    jump: {},
    'ssa:phi': {
      output: 'any',
      inputs: [ 'any', 'any' ]
    },
    add: {
      output: 'any',
      inputs: [ 'any', 'any' ]
    },
    return: {
      inputs: [ { kind: 'register', value: 'rax' } ]
    },
    call: {
      output: { kind: 'register', value: 'rax' },
      inputs: [ 'register', 'any' ],
      spills: [
        { kind: 'register', value: 'rax' },
        { kind: 'register', value: 'rbx' },
        { kind: 'register', value: 'rcx' }
      ]
    }
  }
};

exports.fn2str = function fn2str(fn) {
  return fn.toString().replace(/^function[^{]+{\/\*|\*\/}$/g, '');
};

exports.createBuilder = function createBuilder(options, source) {
  var p = pipeline.create('dominance');

  p.parse(exports.fn2str(source), {
    cfg: true
  }, 'printable');

  p.reindex();

  var config = linearscan.config.create(options);
  return linearscan.builder.create(p, config);
};

exports.check = function check(config, expected) {
  var out = '';

  function renderInterval(prefix, interval, isReg) {
    var out = prefix;

    if (interval.value !== null && !isReg)
      out += ' ' + interval.value.inspect();

    if (!interval.alive)
      out += ' (dead)';

    var ranges = interval.ranges.map(function(range) {
      return range.inspect();
    }).join(', ');

    out += ' ' + ranges;

    var uses = interval.uses.concat(interval.fixedUses).map(function(use) {
      return use.inspect();
    }).join(', ');

    if (uses)
      out += ' : ' + uses;

    return out;
  }

  for (var i = 0; i < config.registers.length; i++) {
    var reg = config.registers[i];
    if (reg.ranges.length === 0)
      continue;

    out += renderInterval('%' + i, reg, true) + '\n';
  }

  for (var i = 0; i < config.intervals.length; i++) {
    var interval = config.intervals[i];
    var prefix = interval.start() + '. ' + interval.node.opcode;
    out += renderInterval(prefix, interval) + '\n';
  }

  assertText.equal(out, exports.fn2str(expected));
}
