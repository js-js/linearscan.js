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

    it('should support ' + name, function() {
      var data = fixtures.representation.parse(src);
      var output = l.run(data);

      function strip(source) {
        var lines = source.split(/\r\n|\r|\n/g);

        var out = lines.map(function(line) {
          return line.replace(/^\s*/, '');
        }).filter(function(line) {
          return !!line;
        });

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

  test('loop with add', config, function() {/*
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
      $rcx = add $rax, $rbx
      print $rcx {$rcx => [0]}
      $rax = to_phi [0]
    block B4
      ret $rax
  */});

  test('loop with revadd', config, function() {/*
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
      $rbx = to_phi $rax
    block B2 -> B3, B4
      $rax = literal %42
      branch $rbx, $rax
    block B3 -> B2
      $rax = literal %1
      $rcx = revadd $rbx, $rax
      print $rcx {$rcx => [0]}
      $rax = to_phi [0]
      gap {$rax => $rbx}
    block B4
      gap {$rbx => $rax}
      ret $rax
  */});

  test('nested loops', config, function() {/*
    block B1 -> B2
      zero1 = literal %0
      zero2 = literal %0
      to_phi zero1, i
      to_phi zero2, counter
    block B2 -> B3, B8
      i = phi
      counter = phi
      max1 = literal %42
      branch i, max1

      block B3 -> B4
        zero3 = literal %0
        to_phi zero3, j
        to_phi counter, counter1
      block B4 -> B5, B6
        j = phi
        counter1 = phi
        max2 = literal %42
        branch j, max2
      block B5 -> B4
        one1 = literal %1
        j1 = add j, one1
        counter2 = add counter1, one1
        print counter2
        to_phi j1, j
        to_phi counter2, counter1
      block B6 -> B7
        one2 = literal %1
        i1 = add i, one2

    block B7 -> B2
      to_phi counter1, counter
      to_phi i1, i
    block B8
      ret counter
  */}, function() {/*
    block B1 -> B2
      $rax = literal %0
      $rbx = literal %0
    block B2 -> B3, B8
      $rcx = literal %42
      branch $rax, $rcx

      block B3 -> B4
        $rcx = literal %0
      block B4 -> B5, B6
        $rdx = literal %42
        branch $rcx, $rdx
      block B5 -> B4
        $rdx = literal %1
        $rcx = add $rcx, $rdx
        gap {$rcx => [0]}
        $rcx = add $rbx, $rdx
        print $rcx {$rax => [3], [0] => [1], $rcx => [2]}
        $rcx = to_phi [1]
        $rax = to_phi [2]
        gap {$rax => $rbx, [3] => $rax}
      block B6 -> B7
        gap {$rax <=> $rbx}
        $rcx = literal %1
        $rbx = add $rbx, $rcx

    block B7 -> B2
      gap {$rbx <=> $rax}
    block B8
      gap {$rbx => $rax}
      ret $rax
  */});

  test('spilling', config, function() {/*
    block B1
      a = literal %0
      b = literal %1
      c = literal %2
      d = literal %3
      e = literal %4
      add a, b
      add b, c
      add c, d
      add d, e
  */}, function() {/*
    block B1
      $rax = literal %0
      $rbx = literal %1
      $rcx = literal %2
      $rdx = literal %3
      [0] = literal %4
      $rax = add $rax, $rbx
      $rax = add $rbx, $rcx
      $rax = add $rcx, $rdx
      gap {[0] => $rax}
      $rax = add $rdx, $rax
  */});
});
