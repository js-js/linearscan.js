var linearscan = require('../');
var pipeline = require('json-pipeline');

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

  var config = linearscan.config.create(p, options);
  return linearscan.builder.create(config);
};
