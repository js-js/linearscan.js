var assert = require('assert');
var util = require('util');
var fixtures = require('./fixtures');

var linearscan = require('..');

describe('Linearscan.js', function() {
  function test(name, config, input, expected) {
    var l = linearscan.create(config);

    var src = input.toString()
        .replace(/^function\s*\(\)\s*{\/\*|\*\/}$/g, '');
    var expected = expected.toString()
        .replace(/^function\s*\(\)\s*{\/\*|\*\/}$/g, '');

    it(name, function() {
      var data = fixtures.representation.parse(src);
      var output = l.run(data);

      function strip(source) {
        var lines = source.split(/\r\n|\r|\n/g);

        var out = lines.map(function(line) {
          return line.replace(/^\s*/, '');
        });

        while (out[0] === '')
          out = out.slice(1);
        while (out[out.length - 1] === '')
          out = out.slice(0, out.length - 1);

        return out.join('\n');
      }

      assert.equal(
        strip(fixtures.representation.stringify(output)),
        strip(expected));
    });
  }

  var config = {
    registers: [ 'rax', 'rbx', 'rcx', 'rdx' ],

    instructions: {
      literal: { inputs: [ { type: 'js' } ] },
      add: {
        output: { type: 'register' },
        inputs: [ { type: 'register' }, { type: 'register' } ]
      },
      revadd: {
        output: { type: 'register' },
        inputs: [
          { type: 'register', id: 'rbx' },
          { type: 'register', id: 'rax' }
        ]
      },
      branch: {
        output: null,
        inputs: [ { type: 'register' }, { type: 'register' } ]
      },
      print: {
        output: null,
        inputs: [ { type: 'register', id: 'rcx' } ],
        call: true
      },
      ret: { output: null, inputs: [ { type: 'register', id: 'rax' } ] }
    }
  };

  test('should support loop', config, function() {/*
    block B1 -> B2
      zero = literal %0
      to_phi zero, index
    block B2 -> B3, B4
      index = phi
      max = literal %42
      branch index, max
    block B3 -> B2
      one = literal %1
      sum = add index, one
      print sum
      to_phi sum, index
    block B4
      ret index
  */}, function() {/*
    block B1 -> B2
      $rax = literal %0
    block B2 -> B3, B4
      $rbx = literal %42
      branch $rax, $rbx
    block B3 -> B2
      $rbx = literal %1
      $rax = add $rax, $rbx
      gap {$rax => $rcx}
      print $rcx {$rcx => [0]}
      $rax = to_phi [0]
    block B4
      ret $rax
  */});

  test('should support loop with revadd', config, function() {/*
    block B1 -> B2
      zero = literal %0
      to_phi zero, index
    block B2 -> B3, B4
      index = phi
      max = literal %42
      branch index, max
    block B3 -> B2
      one = literal %1
      sum = revadd index, one
      print sum
      to_phi sum, index
    block B4
      ret index
  */}, function() {/*
    block B1 -> B2
      $rax = literal %0
    block B2 -> B3, B4
      $rbx = literal %42
      branch $rax, $rbx
    block B3 -> B2
      gap {$rax => $rbx}
      $rax = literal %1
      $rax = revadd $rbx, $rax
      gap {$rax => $rcx}
      print $rcx {$rcx => [0]}
      $rbx = to_phi [0]
    block B4
      ret $rax
  */});
});
