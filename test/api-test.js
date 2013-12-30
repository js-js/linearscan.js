var assert = require('assert');
var util = require('util');

var linearscan = require('..');

describe('Linearscan.js', function() {
  function test(name, config, input, expected) {
    var l = linearscan.create(config);

    var output = l.run(input);

    console.log(require('util').inspect(output, false, 300));
    // assert.deepEqual(output, expected);
  }

  test('should allocate registers', {
    registers: [ 'rax', 'rbx', 'rcx', 'rdx' ],

    instructions: {
      literal: { args: [ { type: 'js' } ] },
      add: {
        ret: { type: 'register' },
        args: [ { type: 'register' }, { type: 'register' } ]
      },
      branch: {
        ret: null,
        args: [ { type: 'register' }, { type: 'register' } ]
      },
      ret: { ret: null, args: [ { type: 'register', id: 'rax' } ] }
    }
  }, [{
    id: 'B1',
    instructions: [
      { id: 'i1', type: 'literal', args: [ { type: 'js', value: 0 } ] },
      { id: 'i2', type: 'literal', args: [ { type: 'js', value: 42 } ] },
      {
        type: 'to_phi',
        args: [
          { type: 'instruction', id: 'i1' },
          { type: 'instruction', id: 'i3' }
        ]
      }
    ],
    successors: [ 'B2' ]
  }, {
    id: 'B2',
    instructions: [
      { id: 'i3', type: 'phi' },
      {
        type: 'branch',
        cond: 'less',
        args: [
          { type: 'instruction', id: 'i3' },
          { type: 'instruction', id: 'i2' }
        ]
      }
    ],
    successors: [ 'B4', 'B3' ]
  }, {
    id: 'B4',
    instructions: [
      { type: 'ret', args: [ { type: 'instruction', id: 'i3' } ] }
    ]
  }, {
    id: 'B3',
    instructions: [
      { id: 'i4', type: 'literal', args: [ { type: 'js', value: 1 } ] },
      {
        id: 'i5',
        type: 'add',
        args: [
          { type: 'instruction', id: 'i3' },
          { type: 'instruction', id: 'i4' }
        ]
      },
      {
        type: 'to_phi',
        args: [
          { type: 'instruction', id: 'i5' },
          { type: 'instruction', id: 'i3' }
        ]
      }
    ],
    successors: [ 'B2' ]
  }], []);
});
