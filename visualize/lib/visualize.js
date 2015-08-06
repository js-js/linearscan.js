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
  config: config
});
