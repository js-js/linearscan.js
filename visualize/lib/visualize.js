'use strict';

var App = require('./app');

var config = {
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

var app = new App({
  input: '#pipeline',
  reindexed: '#reindexed',
  intervals: '#output',
  config: config,
  initial: 'b0 {\n' +
           '  i0 = literal 0\n' +
           '  i1 = jump\n' +
           '}\n' +
           'b0 -> b1, b2\n' +
           'b1 {\n' +
           '  i2 = literal 1\n' +
           '  i3 = return i2\n' +
           '}\n' +
           'b2 {\n' +
           '  i4 = add i0, i0\n' +
           '  i5 = return i0\n' +
           '}'
});
