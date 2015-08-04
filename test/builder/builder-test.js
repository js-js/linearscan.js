'use strict';

var assertText = require('assert-text');
assertText.options.trim = true;

var fixtures = require('../fixtures');

function check(b, expected) {
  var out = '';
  for (var i = 0; i < b.intervals.length; i++) {
    var interval = b.intervals[i];
    out += interval.node.index + '. ' + interval.node.opcode + ' ';

    var ranges = interval.ranges.map(function(range) {
      return '[' + range.start + ';' + range.end + ')';
    }).join(', ');

    out += ranges + '\n';
  }

  assertText.equal(out, fixtures.fn2str(expected));
}

describe('Interval Builder', function() {
  it('should populate liveIn', function() {
    var b = fixtures.createBuilder(function() {/*
      pipeline {
        b0 {
          i0 = literal 3
          i1 = branch
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

      4. literal [4;9)
      5. branch [5;6)
      6. literal [6;7)
      7. literal [7;8)
      8. ssa:phi [8;9)
      9. add [9;10)
      10. return [10;11)
    */});
  });
});
