'use strict';

var assertText = require('assert-text');
assertText.options.trim = true;

var fixtures = require('./fixtures');

function check(b, expected) {
  var out = '';
  for (var i = 0; i < b.intervals.length; i++) {
    var interval = b.intervals[i];
    out += interval.node.index + '. ' + interval.node.opcode + ' ';

    var ranges = interval.ranges.map(function(range) {
      return range.inspect();
    }).join(', ');

    out += ranges;

    var uses = interval.uses.map(function(use) {
      return use.inspect();
    }).join(', ');

    if (uses)
      out += ' | ' + uses;

    out += '\n';
  }

  assertText.equal(out, fixtures.fn2str(expected));
}

describe('Interval Builder', function() {
  it('should work on branch', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 3
          i1 = if
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
        }
        b1 -> b3

        b2 {
          i3 = literal 2
        }
        b2 -> b3

        b3 {
          i4 = ssa:phi i2, i3
          i5 = add i0, i4
          i6 = return i5
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      0. start [4;6)
      1. region [6;7)
      2. region [7;8)
      3. region [8;11)

      4. literal [4;9) | {4=*}, {9=*}
      5. if [5;6)
      6. literal [6;7) | {6=*}, {8=*}
      7. literal [7;8) | {7=*}, {8=*}
      8. ssa:phi [8;9) | {8=*}, {9=*}
      9. add [9;10) | {9=*}, {10=%rax}
      10. return [10;11)
    */});
  });

  it('should work on loops', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump
        }
        b0 -> b1

        b1 {
          i2 = ssa:phi i0, i5
          i3 = if
        }
        b1 -> b2, b3

        b2 {
          i4 = literal 1
          i5 = add i2, i4
          i6 = jump
        }
        b2 -> b1

        b3 {
          i7 = return i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      0. start [4;6)
      1. region [6;8)
      2. region [8;11)
      3. region [11;12)
      4. literal [4;6) | {4=*}, {6=*}
      5. jump [5;6)
      6. ssa:phi [6;9), [11;11) | {6=*}, {9=*}, {11=%rax}
      7. if [7;8)
      8. literal [8;9) | {8=*}, {9=*}
      9. add [9;11) | {6=*}, {9=*}
      10. jump [10;11)
      11. return [11;12)
    */});
  });

  it('should generate holes', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = return i2
        }

        b2 {
         i4 = return i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      0. start [3;5)
      1. region [5;7)
      2. region [7;8)
      3. literal [3;5), [7;7) | {3=*}, {7=%rax}
      4. jump [4;5)
      5. literal [5;6) | {5=*}, {6=%rax}
      6. return [6;7)
      7. return [7;8)
    */});
  });
});
