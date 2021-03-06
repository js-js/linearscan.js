var linearscan = require('../');
var pipeline = require('json-pipeline');

var assert = require('assert');
var assertText = require('assert-text');
assertText.options.trim = true;

function gp(kind, value) {
  return { kind: kind, group: 'gp', value: value };
}

function fp(kind, value) {
  return { kind: kind, group: 'fp', value: value };
}

exports.options = {
  registers: {
    gp: [
      'rax', 'rbx', 'rcx', 'rdx'
    ],
    fp: [
      'xmm1', 'xmm2', 'xmm3', 'xmm4'
    ]
  },
  opcodes: {
    literal: {
      output: gp('any')
    },
    'literal-fp': {
      output: fp('any')
    },
    if: { branch: true },
    jump: { branch: true },
    add: {
      output: gp('any'),
      inputs: [ gp('any'), gp('any') ]
    },
    'add-fp': {
      output: fp('any'),
      inputs: [ fp('any'), fp('any') ]
    },
    floor: {
      output: gp('any'),
      inputs: [ fp('register') ]
    },
    return: {
      inputs: [ gp('register', 'rax') ]
    },
    'rax-out': {
      inputs: [],
      output: gp('register', 'rax'),
      spills: []
    },
    'rbx-out': {
      inputs: [],
      output: gp('register', 'rbx'),
      spills: []
    },
    'rbx-call': {
      inputs: [],
      output: gp('register', 'rbx'),
      spills: [
        gp('register', 'rax'),
        gp('register', 'rbx'),
        gp('register', 'rcx'),
        gp('register', 'rdx')
      ]
    },
    call: {
      output: gp('register', 'rax'),
      inputs: [ gp('register'), gp('any') ],
      spills: [
        gp('register', 'rax'),
        gp('register', 'rbx'),
        gp('register', 'rcx'),
        gp('register', 'rdx')
      ]
    },
    vararg: function(node) {
      var regs = [ 'rax', 'rbx', 'rcx', 'rdx' ];
      return {
        output: gp('register', 'rax'),
        inputs: node.inputs.map(function(input, i) {
          return gp('register', regs[i]);
        })
      };
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

exports.createAllocator = function createAllocator(options, group, source) {
  if (source === undefined) {
    source = group;
    group = 'gp';
  }

  var builder = exports.createBuilder(options, source);

  builder.build();

  return linearscan.allocator.create(builder.config, group);
};

exports.withAllocator = function withAllocator(options, source, body) {
  var builder = exports.createBuilder(options, source);

  builder.build();

  for (var i = 0; i < builder.config.groups.length; i++) {
    var group = builder.config.groups[i];
    var alloc = linearscan.allocator.create(builder.config, group);

    body(alloc);
  }

  return builder.config;
};

exports.createResolver = function createResolver(options, source) {
  var config = exports.withAllocator(options, source, function(allocator) {
    allocator.allocate();
  });

  return linearscan.resolver.create(config);
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
    var root = config.intervals[node.index];
    var pos = config.positions[at.index];

    var child;
    if (root.start() === pos)
      child = root.childAt(pos);
    else
      child = root.childAt(pos - 1);

    if (child.value === null) {
      assert(child.group !== allocator.group || !child.alive);
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
