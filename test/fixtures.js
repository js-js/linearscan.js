var linearscan = require('../');
var pipeline = require('json-pipeline');

var assert = require('assert');
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
    'rax-out': {
      inputs: [],
      output: { kind: 'register', value: 'rax' },
      spills: []
    },
    'rbx-out': {
      inputs: [],
      output: { kind: 'register', value: 'rbx' },
      spills: []
    },
    'rbx-call': {
      inputs: [],
      output: { kind: 'register', value: 'rbx' },
      spills: [
        { kind: 'register', value: 'rax' },
        { kind: 'register', value: 'rbx' },
        { kind: 'register', value: 'rcx' },
        { kind: 'register', value: 'rdx' }
      ]
    },
    call: {
      output: { kind: 'register', value: 'rax' },
      inputs: [ 'register', 'any' ],
      spills: [
        { kind: 'register', value: 'rax' },
        { kind: 'register', value: 'rbx' },
        { kind: 'register', value: 'rcx' },
        { kind: 'register', value: 'rdx' }
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

exports.createAllocator = function createAllocator(options, source) {
  var builder = exports.createBuilder(options, source);

  builder.buildIntervals();

  return linearscan.allocator.create(builder.config);
};

exports.createResolver = function createResolver(options, source) {
  var allocator = exports.createAllocator(options, source);

  allocator.allocate();

  return linearscan.resolver.create(allocator.config);
};

exports.checkBuilder = function checkBuilder(builder, expected) {
  var config = builder.config;
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
};

exports.checkAllocator = function checkAllocator(allocator, expected) {
  var out = '';
  var config = allocator.config;

  function interval(node, at) {
    var child = config.intervals[node.index].childAt(
        config.positions[at.index]);

    if (child.value === null) {
      assert(!child.alive);
      return '(none)';
    }
    return child.value.inspect();
  }

  for (var i = 0; i < config.input.nodes.length; i++) {
    var node = config.input.nodes[i];

    if (node.opcode === 'start' ||
        node.opcode === 'region' ||
        node.opcode === 'if' ||
        node.opcode === 'jump') {
      continue;
    }

    out += interval(node, node) + ' = ' + node.opcode;
    for (var j = 0; j < node.inputs.length; j++)
      out += ' ' + interval(node.inputs[j], node);
    out += '\n';
  }

  assertText.equal(out, exports.fn2str(expected));
};

exports.checkResolver = function checkResolver(resolver, expected) {
  var out = '';
  var config = resolver.config;

  for (var i = 0; i < config.instructions.length; i++)
    if (resolver.instructions[i] !== null)
      out += resolver.instructions[i].inspect() + '\n';

  assertText.equal(out, exports.fn2str(expected));
};
