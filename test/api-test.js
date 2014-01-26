var assert = require('assert');
var ssa = require('ssa-ir');
var util = require('util');

var linearscan = require('..');

describe('Linearscan.js', function() {
  function test(name, config, input, expected) {
    var l = linearscan.create(config);

    var src = input.toString()
        .replace(/^function\s*\(\)\s*{\/\*|\*\/}$/g, '');
    var expected = expected.toString()
        .replace(/^function\s*\(\)\s*{\/\*|\*\/}$/g, '');

    it('should support ' + name, function() {
      var data = ssa.parse(src);
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

      assert.equal(strip(ssa.stringify(output)),
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
      tmp: {
        output: null,
        scratch: [ { type: 'register' } ]
      },
      tmpCall: {
        output: null,
        inputs: [ { type: 'register' } ],
        scratch: [ { type: 'register' } ],
        call: true
      },
      ext: {
        output: { type: 'register', id: 'rax' },
        inputs: [ { type: 'register', id: 'rcx' } ],
        call: true
      },
      ret: { output: null, inputs: [ { type: 'register', id: 'rax' } ] }
    }
  };

  test('loop with add', config, function() {/*
    block B1 -> B2
      zero = literal %0
      to_phi index, zero
    block B2 -> B3, B4
      index = phi
      max = literal %42
      branch index, max
    block B3 -> B2
      one = literal %1
      sum = add index, one
      print sum
      to_phi index, sum
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
      gap {$rcx => [0]}
      print $rcx
      $rax = to_phi [0]
    block B4
      ret $rax
  */});

  test('loop with revadd', config, function() {/*
    block B1 -> B2
      zero = literal %0
      to_phi index, zero
    block B2 -> B3, B4
      index = phi
      max = literal %42
      branch index, max
    block B3 -> B2
      one = literal %1
      sum = revadd index, one
      print sum
      to_phi index, sum
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
      gap {$rcx => [0]}
      print $rcx
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
      to_phi i, zero1
      to_phi counter, zero2
    block B2 -> B3, B8
      i = phi
      counter = phi
      max1 = literal %42
      branch i, max1

      block B3 -> B4
        zero3 = literal %0
        to_phi j, zero3
        to_phi counter1, counter
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
        to_phi j, j1
        to_phi counter1, counter2
      block B6 -> B7
        one2 = literal %1
        i1 = add i, one2

    block B7 -> B2
      to_phi counter, counter1
      to_phi i, i1
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
        gap {$rax => [2], $rcx => [1]}
        print $rcx
        $rcx = to_phi [0]
        $rax = to_phi [1]
        gap {$rax => $rbx, [2] => $rax}
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

  test('if else', config, function() {/*
    block B1 -> B2, B3
      one = literal %1
      zero = literal %0
      branch zero, one
    block B2 -> B4
      true = literal %true
      to_phi res, true
    block B3 -> B4
      false = literal %false
      to_phi res, false
    block B4
      res = phi
      r = add res, one
      ret r
  */}, function() {/*
    block B1 -> B2, B3
      $rax = literal %1
      $rbx = literal %0
      branch $rbx, $rax
    block B3 -> B4
      $rbx = literal %false
    block B2 -> B4
      $rbx = literal %true
    block B4
      $rax = add $rbx, $rax
      ret $rax
  */});

  test('tmp nop', config, function() {/*
    block B1
      a = literal %0
      b = literal %1
      c = literal %2
      d = literal %3
      e = literal %4
      tmp
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
      gap {$rdx => [1]}
      tmp |$rdx|
      $rax = add $rax, $rbx
      $rax = add $rbx, $rcx
      $rax = add $rcx, [1]
      gap {[0] => $rax}
      $rax = add [1], $rax
  */});

  test('tmp call', config, function() {/*
    block B1
      a = literal %0
      b = literal %1
      c = literal %2
      d = literal %3
      e = literal %4
      tmpCall a
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
      gap {$rbx => [1], $rax => [4], $rcx => [2], $rdx => [3]}
      tmpCall $rax |$rbx|
      gap {[1] => $rbx, [4] => $rax}
      $rax = add $rax, $rbx
      gap {[2] => $rax}
      $rbx = add $rbx, $rax
      gap {[3] => $rbx}
      $rax = add $rax, $rbx
      gap {[0] => $rax}
      $rax = add $rbx, $rax
  */});

  test('call with reg output', config, function() {/*
    block B1
      a = literal %0
      b = ext a
      c = ext b
      c = ext b
  */}, function() {/*
    block B1
      $rcx = literal %0
      $rcx = ext $rcx
      gap {$rcx => [0]}
      $rax = ext $rcx
      gap {[0] => $rcx}
      $rax = ext $rcx
  */});

  test('preserve astIds', config, function() {/*
    block B1
      a = literal %0 # 0
      b = ext a # 1
      c = ext b # 2
      c = ext b # 3
  */}, function() {/*
    block B1
      $rcx = literal %0 # 0
      $rcx = ext $rcx # 1
      gap {$rcx => [0]}
      $rax = ext $rcx # 2
      gap {[0] => $rcx}
      $rax = ext $rcx # 3
  */});
});
