var assert = require('assert');
var util = require('util');

var linearscan = require('..');

describe('Linearscan.js', function() {
  function test(name, config, input, expected) {
    var l = linearscan.create(config);

    var output = l.run(input);

    console.log(JSON.stringify(l.toJSON()));
    // console.log(require('util').inspect(output, false, 300));
    // assert.deepEqual(output, expected);
  }

  test('should allocate registers', {
    registers: [ 'rax', 'rbx', 'rcx', 'rdx' ],

    instructions: {
      literal: { inputs: [ { type: 'js' } ] },
      add: {
        output: { type: 'register' },
        inputs: [ { type: 'register' }, { type: 'register' } ]
      },
      branch: {
        output: null,
        inputs: [ { type: 'register' }, { type: 'register' } ]
      },
      ret: { output: null, inputs: [ { type: 'register', id: 'rax' } ] }
    }
  }, [{
    id: 'B1',
    instructions: [
      { id: 'zero', type: 'literal', inputs: [ { type: 'js', value: 0 } ] },
      {
        type: 'to_phi',
        inputs: [
          { type: 'instruction', id: 'zero' },
          { type: 'instruction', id: 'index' }
        ]
      }
    ],
    successors: [ 'B2' ]
  }, {
    id: 'B2',
    instructions: [
      { id: 'index', type: 'phi' },
      { id: 'max', type: 'literal', inputs: [ { type: 'js', value: 42 } ] },
      {
        type: 'branch',
        cond: 'less',
        inputs: [
          { type: 'instruction', id: 'index' },
          { type: 'instruction', id: 'max' }
        ]
      }
    ],
    successors: [ 'B3', 'B4' ]
  }, {
    id: 'B4',
    instructions: [
      { type: 'ret', inputs: [ { type: 'instruction', id: 'index' } ] }
    ]
  }, {
    id: 'B3',
    instructions: [
      { id: 'one', type: 'literal', inputs: [ { type: 'js', value: 1 } ] },
      {
        id: 'sum',
        type: 'add',
        inputs: [
          { type: 'instruction', id: 'index' },
          { type: 'instruction', id: 'one' }
        ]
      },
      {
        type: 'to_phi',
        inputs: [
          { type: 'instruction', id: 'sum' },
          { type: 'instruction', id: 'index' }
        ]
      }
    ],
    successors: [ 'B2' ]
  }], []);
});
