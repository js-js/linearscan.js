'use strict';

var App = require('./app');

function gp(kind, value) {
  return { kind: kind, group: 'gp', value: value };
}

var config = {
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
    if: {},
    jump: {},
    add: {
      output: gp('any'),
      inputs: [ gp('any'), gp('any') ]
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
    }
  }
};

var app = new App({
  input: '#pipeline',
  reindexed: '#reindexed',
  intervals: '#output',
  allocate: '#allocate',
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
